# Handoff: YouTube SABR-enforcement blocking some videos in VideoJam's extractor

> **Resolved on 2026-09-04:** the extractor now integrates the released
> [`googlevideo` 4.1.1](https://github.com/LuanRT/googlevideo) `SabrStream`
> implementation. `/video-info` probes progressive delivery and, on the
> selective 403 described below, returns a signed HLS URL. `SabrStream`
> demultiplexes YouTube's UMP response; `ffmpeg` stream-copies the selected
> H.264/AAC tracks into HLS that tvOS `AVPlayer` consumes without app changes.
> Live Docker tests produced complete HLS playlists for three IDs previously
> listed as blocked (`abaielFw_Xw`, `_VnwVOf3NxE`, `XZVpR3Pk-r8`), verified
> 206 segment ranges, and confirmed H.264 720p plus AAC with `ffprobe`.
> The remainder of this document is retained as the historical investigation.

## What this project is

"VideoJam" is a party jukebox web app (Next.js, deployed on Vercel at
`videojam.net`) plus a tvOS ("Apple TV") client (`appletv/JukeboxPlayer`,
Swift/AVKit) that acts as the shared display/speaker for a party. Guests
add YouTube videos to a shared queue from their phones (via the web app);
the Apple TV plays them full-screen via `AVPlayer`.

tvOS has no `WKWebView`, so it can't embed YouTube's official IFrame
Player the way the web app does (`src/components/Player.tsx`, which has
zero reliability problems since it uses YouTube's own player). Instead,
the Apple TV needs a **raw, direct, playable stream URL** for each video
ID, which `AVPlayer` then plays.

## Repo / branch

- Repo: `smckay79/jukebox` (GitHub)
- Branch: `claude/youtube-jukebox-qr-zTy3V`. The investigation predating the
  resolution above is committed and pushed; the SABR/HLS resolution is the
  current local change set pending review and deployment.
- The extractor service lives entirely under `extractor/` — a standalone
  Node/TypeScript service, **not** part of the Next.js app, deployed
  separately (see "Deployment" below).
- Read `extractor/README.md` first — it documents the whole history of
  this service (why Piped/Invidious scraping died, why Fly.io was
  abandoned, why Tailscale Funnel was abandoned in favor of Cloudflare
  Tunnel) and is kept up to date as things change.

## The architecture (as it stands right now)

```
Apple TV (Swift)
  → Vercel: /api/party/[code]/video-url  (src/app/api/party/[code]/route.ts)
      → extractor's own residential-IP-hosted service (primary)
      → [fallback only] public Piped/Invidious instances (legacy, mostly dead)
```

The extractor (`extractor/`) is:
- `youtubei.js` (the InnerTube API client library FreeTube's "Local API"
  mode uses) talking directly to YouTube — **not** scraping third-party
  mirrors.
- Backed by a self-hosted PO-token/BotGuard sidecar:
  `brainicism/bgutil-ytdlp-pot-provider:1.3.2-node` (an unmodified,
  published Docker image — deliberately not reimplemented ourselves,
  since it's actively patched upstream as YouTube changes its anti-bot
  checks).
- Deployed on the user's own Synology NAS (Docker Compose), specifically
  **not** on Fly.io/any datacenter host — YouTube's bot detection flags
  datacenter IPs outright, confirmed by real deploy testing early in this
  project. A home/residential IP is required just to get *some* videos
  working at all.
- Exposed publicly via **Cloudflare Tunnel** (`cloudflared`) at
  `https://videojam-extractor.controlaltdeleted.com`, chosen after
  Tailscale Funnel failed with an unresolved, unexplained registration
  error specific to this one Synology (documented in the README).

### Request flow for one video

1. Vercel's `video-url` route calls the extractor's
   `GET /video-info?id=<videoId>` (bearer-auth'd with
   `EXTRACTOR_SHARED_SECRET`).
2. The extractor mints a **video-bound** PO token (not just a
   visitor-bound/session one — this distinction mattered, see "Fixed
   issues" below), calls `youtubei.js`'s `getInfo()`, picks a combined
   video+audio format via `chooseFormat({type:'video+audio',
   quality:'best'})`.
3. Instead of handing back YouTube's own signed `googlevideo.com` URL,
   the extractor hands back a **signed URL pointing at its own
   `/stream` endpoint** (`extractor/src/server.ts`). This is because
   YouTube's CDN IP-locks the signed URL to whoever requested it (the
   extractor's residential IP) — a client (the Apple TV) fetching it
   directly from a different network gets a 403. Confirmed by testing:
   curling the raw googlevideo URL from a different IP reproduces the
   exact 403.
4. `/stream` proxies the actual bytes through the extractor container
   (using `VideoInfo.download()` — see below for why), so the byte-fetch
   always happens from the authorized residential IP regardless of where
   the Apple TV physically is.

## The problem this handoff is about

**Officially-licensed / major-label monetized YouTube videos (VEVO-style
official music videos, in every case tested) fail with a 403 on the
actual byte-fetch — regardless of how correct the request is.** Ordinary,
non-monetized videos (old uploads, small channels, home videos) work
completely fine end-to-end through this same pipeline.

### What's been tried, in order, with hard evidence for each ruling-out

1. **IP-locking of the signed URL** (see step 3 above) — real bug, fixed.
   Confirmed via direct curl reproduction. Not the licensed-content issue
   specifically (this affected *all* videos before the fix, not just
   licensed ones).

2. **Missing browser-like headers on the byte-fetch** (`User-Agent`,
   `Origin`, `Referer`) — added, real improvement, did not fix licensed
   content.

3. **Missing `pot=` (PO-token) query param on the deciphered URL** — a
   genuine bug found by reading `youtubei.js`'s own source
   (`node_modules/youtubei.js/dist/src/core/Player.js` line ~140):
   `format.decipher()` embeds a `pot=` param from
   `session.player.po_token` specifically — a *different* field from
   `session.po_token` that `Innertube.create()` never populates unless
   you pass `po_token` at session-creation time (which the original code
   didn't). Fixed by setting `yt.session.player.po_token` explicitly
   before every decipher/download call. Real fix, did not fully resolve
   licensed content either.

4. **Missing `cpn=` (content playback nonce) and YouTube's own
   `range=start-end` query-parameter convention** for chunked/ranged
   requests (as opposed to a standard HTTP `Range:` header) — found by
   reading `youtubei.js`'s `utils/FormatUtils.js`. Its own `download()`
   implementation handles this correctly; our original hand-rolled
   `fetch()` of the deciphered URL did not. **Switched the whole proxy to
   use `youtubei.js`'s own `VideoInfo.download()` method** instead of
   manually deciphering + fetching (see `extractor/src/extract.ts` /
   `extractor/src/server.ts` — `ExtractResult` now carries the
   `VideoInfo`/`Format` objects, not a bare URL). This was independently a
   good change (matches "let the actively-maintained library handle
   YouTube's fragile protocol details" philosophy) but **still did not
   fix licensed-content 403s.**

5. **Tried an escalating "attempt ladder"**: cached/fresh WEB client →
   brand-new WEB extraction (new PO token, new BotGuard session) → iOS
   InnerTube client. Confirmed via real logs (video IDs tested include
   `abaielFw_Xw`, `_VnwVOf3NxE`, `XZVpR3Pk-r8`, `1tVu5UAavg4`,
   `DpxE4U6OluE`, `zWCINQn6k0s`, `7Lb9dq-JZFI`, `YEq-cvq_cK4`,
   `UKwVvSleM6w` — all official/label music videos):
   - WEB client: consistent 403 on the byte-fetch, even with `pot=`,
     `cpn=`, and `range=` all correctly present in the request.
   - iOS client: consistently **no combined format available at all**
     (`chooseFormat` finds nothing — `youtubei.js` throws "No matching
     formats found"), not a 403. iOS's format catalog for these videos
     apparently doesn't include a combined progressive stream.
   - Tried adding an Android client attempt as a 4th rung — it **hung
     indefinitely** (no error, no timeout, no unhandled-rejection log)
     across every video tested, even with an explicit 8-second
     `Promise.race`-style timeout wrapper around it, while the rest of
     the process remained fully responsive (`/health` kept answering
     normally throughout). Root cause of the hang was never
     diagnosed — **removed** rather than keep chasing it, since it never
     once succeeded in any test.

6. **Investigated whether `yt-dlp` (Python) — the much larger,
   more-resourced sibling project — has real SABR support to shell out
   to instead of reimplementing it.** Installed the actual latest release
   (`yt-dlp==2026.8.19`, confirmed current via `pip index versions
   yt-dlp`) in a sandbox and read its source directly rather than
   assuming:
   - `pip install bgutil-ytdlp-pot-provider yt-dlp-get-pot` gives yt-dlp a
     PO-token provider (`bgutil:http`) that talks to an HTTP server on
     port 4416 by default —  the **exact same**
     `brainicism/bgutil-ytdlp-pot-provider` sidecar image already
     deployed for this project. That part would have been trivial to
     wire up.
   - **But yt-dlp does not have a working SABR downloader either.**
     Grepped its entire installed package for "sabr": every hit is in the
     YouTube extractor *detecting* the condition and giving up with a
     warning (`extractor/youtube/_video.py`), not a downloader that
     speaks the protocol. No `sabr` entry exists in yt-dlp's
     `downloader.PROTOCOL_MAP`.
   - Most tellingly, `extractor/youtube/_base.py` has this comment, dated
     within the last few weeks relative to "now" (~Sept 2026):
     > `# Using a clientVersion>1.65 may return SABR streams only`
     > `# Since 2026.07, intermittent/selective POT enforcement has been observed for non-HLS formats`
     > `# Since 2026.08.17, ALL formats (including live HLS and itag 18) are 403'd with version 1.65.10`

     This is yt-dlp's own maintainers describing **the identical wall
     we're hitting**, as of about two and a half weeks before this
     handoff was written. **No published open-source project has a
     working SABR client right now.** This is a live, unsolved,
     industry-wide problem this week — not something specific to this
     project's implementation.

   Given this, **the yt-dlp-subprocess plan was abandoned before writing
   any code** — it would inherit the exact same limitation for the exact
   same reason, for the cost of a much heavier Docker image (Python +
   ffmpeg added to what's currently a lean `node:20-slim` container).

### What SABR actually is, for whoever picks this up

YouTube's "Server-side Adaptive Bitrate" streaming: instead of a simple
signed `googlevideo.com/videoplayback?...` URL a client can GET (with
query-param-based byte ranges), the client must open a persistent
connection and POST a protobuf-encoded `ClientAbrState` (roughly:
current buffer health, which formats/qualities it wants, playback
position) and receive a UMP-framed response (a custom binary
multiplexed format — interleaved `MEDIA_HEADER`/`MEDIA_DATA` parts for
multiple tracks at once) that the client must demux itself, then
periodically re-POST updated state as playback continues. `youtubei.js`
has only placeholder support for this (an `is_sabr` option that just
emits `sabr://video?key=...` URI placeholders meant for a *native*
SABR-aware player like ExoNaturalPlayer to consume — it is **not** a
working client). Building a real one means:
- Reverse-engineering/implementing the `ClientAbrState` and related SABR
  protobuf message schemas (undocumented, YouTube-internal, subject to
  change without notice).
- Implementing a UMP parser (binary framing: part type + varint-ish
  length + payload, repeated).
- Managing a long-lived, stateful streaming session per video (not a
  one-shot request/response) that reacts to buffering/seeking.
- The PO-token needs to be sent as **raw bytes in the request payload**
  for SABR specifically (per a comment already found in
  `youtubei.js`'s `Player.js`: `// @NOTE: SABR requests should include
  the PoToken (not base64d, but as bytes!) in the payload.`), not as a
  URL query param the way progressive/DASH formats use it.

This is a genuine, non-trivial reverse-engineering project with an
actively moving target (YouTube can and does change the protocol), not a
"wire up an existing library" task. Whoever picks this up should expect
it to be closer in scope to the original PO-token/BotGuard integration
work than to a bug fix.

## Current state / what works today

- Ordinary (non-monetized/non-major-label) YouTube videos: **working
  end-to-end**, verified live in production (`videojam.net` →
  Synology extractor → real MP4 bytes → confirmed via `file` command and
  HTTP range requests returning proper `206 Partial Content`).
- Officially-licensed/major-label videos: **fail cleanly** (502 from the
  extractor after exhausting the WEB→WEB-fresh→iOS ladder, ~2-3 seconds,
  no hang, no crash) rather than succeeding. The tvOS app currently shows
  the raw error text and does **not** auto-skip to the next queued song —
  a good, independent, low-risk next step regardless of the SABR
  question would be wiring `PlayerScreen.swift`'s existing (admin-only)
  `APIClient.skipSong` call to fire automatically a few seconds after a
  playback error, so a blocked song doesn't stall the party. Not yet
  implemented.
- The service itself is robust against the failure mode that *was*
  actively causing outages: a real crash bug (an unhandled stream error
  from a deferred/lazy fetch inside `download()`'s chunked path killing
  the whole Node process, confirmed via production logs showing
  `exited with code 1`) was found and fixed — the container no longer
  goes down when a video fails, it just returns a clean error for that
  one request.

## Key files (all under `extractor/`)

- `src/server.ts` — HTTP server, `/health`, `/video-info` (bearer-auth'd,
  called by Vercel), `/stream` (signed-URL proxy, called by the Apple
  TV/`AVPlayer` directly). The attempt ladder and timeout wrapper live in
  `handleStream()`.
- `src/extract.ts` — `extractVideo(videoId, client)`: session + PO-token
  + `getInfo()` + `chooseFormat()`. Returns `{ info, format, poToken,
  quality }` (the live `VideoInfo`/`Format` objects, not a bare URL —
  needed since `VideoInfo.download()` is called later, possibly with a
  different requested byte range, from `server.ts`).
- `src/innertube.ts` — long-lived `Innertube` session lifecycle,
  session-level vs. video-bound PO token minting, `Platform.shim.eval`
  shim (`youtubei.js` requires the caller to supply a JS evaluator for
  signature deciphering — undocumented in its types, only surfaces at
  runtime).
- `src/cache.ts` — short-lived in-memory cache of `ExtractResult` per
  video ID (so repeated Range requests during one playback session don't
  each re-run a full `getInfo()`).
- `src/sign.ts` — HMAC signing/verification for the `/stream` proxy
  capability URLs (`videoId:expiry` signed with `EXTRACTOR_SHARED_SECRET`).
- `src/potoken-client.ts` — thin client to the
  `bgutil-ytdlp-pot-provider` sidecar's `/get_pot` / `/ping`.
- `docker-compose.synology.yml` — production deploy file (extractor +
  potoken-provider + cloudflared, no ports published to the host/LAN,
  only reachable from other containers on the compose network — a
  common source of confusion when testing `curl localhost:8080`
  directly on the Synology host, which will always fail by design).
- `README.md` — full deployment walkthrough and history; keep it updated
  if you change the architecture further.

## Suggested next steps, roughly in order of effort/risk

1. **(Cheap, unrelated to SABR) Auto-skip on playback failure** in
   `PlayerScreen.swift` — improves the actual party experience today
   without touching the extractor at all.
2. **(Cheap) Set up a watch for upstream progress** — periodically check
   `yt-dlp`'s and `youtubei.js`'s release notes/changelogs for real SABR
   downloader support landing. Given the pace of the anti-bot arms race
   so far in this project, it's likely someone ships this eventually;
   integrating an existing implementation later is far cheaper than
   building one now.
3. **(Large, high-risk, high-reward) Build a real SABR client** — if
   this content tier is important enough to justify it. Start from
   `youtubei.js`'s existing `is_sabr`/`sabr://` placeholder code and the
   PO-token-as-bytes note in `Player.js` as the two concrete breadcrumbs
   already found; expect to need to capture and reverse-engineer real
   UMP wire traffic (e.g. via a proxy on an actual browser session) since
   there's no reference implementation to copy from.
