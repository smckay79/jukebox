# videojam-extractor

Standalone always-on service that resolves a YouTube video ID to a playable
stream URL for the tvOS app. It supports both YouTube's older progressive
MP4 delivery and its newer SABR-only delivery for licensed/official videos.
It replaces scraping public Piped/Invidious instances (which broke wholesale
under YouTube's PO-token enforcement) with `youtubei.js` talking directly to
YouTube, backed by a self-hosted
[bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
sidecar for the PO-token/BotGuard side — we deliberately don't reimplement
that logic ourselves; it's intricate and actively patched upstream as YouTube
changes things, and owning a copy of it would just move that maintenance
burden onto us.

```
Vercel: /api/party/[code]/video-url ──▶ videojam-extractor ──▶ PO-token sidecar
                                                │
                         progressive works ─────┴──▶ signed /stream MP4 proxy
                         progressive 403s ─────────▶ SABR demux ─▶ ffmpeg HLS
                                                                    │
Apple TV / AVPlayer ◀──────────────── signed /stream or /hls URL ───┘
```

`/video-info` never hands back YouTube's own signed `googlevideo.com` URL. It
first probes two bytes of the best combined progressive format. When that
works, it returns a short-lived signed URL on this service's `/stream`
endpoint, which proxies the actual video bytes through. This matters:
YouTube's playback CDN ties a signed URL to the IP that requested it (the
same PO-token/BotGuard enforcement discussed above), so a client fetching
that URL from a different network gets a 403 partway through — confirmed by
testing. Routing playback through `/stream` means the byte-fetch always
happens from this container's (residential) IP, regardless of where the
Apple TV actually is.

When the progressive probe gets the selective 403 used for many official or
major-label videos, `/video-info` instead returns a signed `/hls/.../index.m3u8`
URL with `type: "hls"`. The extractor uses the released
[`googlevideo`](https://github.com/LuanRT/googlevideo) SABR client to POST the
protobuf playback state and demultiplex the UMP response into separate H.264
and AAC streams. The Docker image's `ffmpeg` then stream-copies those tracks
into ordinary MPEG-TS HLS segments. `AVPlayer` supports that result natively;
no SABR protocol code or custom player is needed in the tvOS app.

HLS sessions are shared per video, limited to four by default, and removed
after two idle hours. Playlists and segments live only in the container's
temporary cache. Relative segment URLs inherit the signed capability path,
so neither playlists nor media are exposed without a valid signature.

## Local dev / testing

```sh
cp .env.example .env   # set EXTRACTOR_SHARED_SECRET to anything for local testing
docker compose up --build
curl -H "Authorization: Bearer <your secret>" \
  "http://localhost:8080/video-info?id=jNQXAC9IVRw"
```

Expect `{"url": "...", "type": "mp4", "quality": "..."}` for a progressive
video, or the same response with `type: "hls"` and a `.m3u8` URL when SABR is
required. Fetch the returned URL to verify actual media delivery; the first
HLS request may wait a few seconds for its initial segment.
A bad ID (`?id=00000000000`) should 404. `curl localhost:8080/health` checks
the sidecar is reachable.

The following optional environment variables tune the bounded HLS cache:

- `MAX_HLS_SESSIONS` (default `4`)
- `HLS_SESSION_TTL_MS` (default `7200000`, two hours)
- `HLS_READY_TIMEOUT_MS` (default `45000`)
- `HLS_CACHE_DIR` (default: the container's temporary directory)

## Deploying to a home Docker host (Synology, etc.) — recommended

**Fly.io was tried first and doesn't work reliably** — confirmed by real
deploy testing, not just theory: YouTube's bot detection rejects requests
from Fly's IP ranges (`InterstitialView`/`PlayerInterstitial` parse errors,
i.e. YouTube serving a "sign in to confirm you're not a bot" wall) regardless
of a correctly-scoped, video-bound PO token. Datacenter IPs are simply
treated far more suspiciously than residential ones. Running this from a
home Docker host — a Synology, a Raspberry Pi, whatever's on your home
network — uses your residential IP instead, which is much less likely to be
pre-flagged.

Uses [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
(free) to get a stable public HTTPS URL under a domain you already control on
Cloudflare. We tried [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
first — its registration handshake failed identically
(`invalid key: unable to validate API key`) across every configuration
variation tried (userspace/kernel networking, shared/standalone network
namespace, IPv4-only) on one particular Synology, despite the same key
registering cleanly from two other machines. Cloudflare Tunnel's connection
model is much simpler (a plain outbound HTTPS/QUIC connection with a bearer
token, no WireGuard-style registration handshake, no `NET_ADMIN`/tun device
needed), which sidesteps whatever that was.

**1. Create the tunnel** (in a browser, on the [Cloudflare Zero Trust
dashboard](https://one.dash.cloudflare.com/)):
- **Networks → Tunnels → Create a tunnel → Cloudflared** connector.
- Name it (e.g. `videojam-extractor`).
- Copy the **token** shown on the install-command step — this is your
  `CLOUDFLARE_TUNNEL_TOKEN`. (If you navigate away, get it again from the
  tunnel's **Configure** page.)
- On the **Public Hostname** tab, add one: pick your domain (e.g.
  `controlaltdeleted.com`), give it a subdomain (e.g. `videojam-extractor`),
  and set the service to `HTTP` → `extractor:8080` (that's the Docker Compose
  service name — not `localhost`, since `cloudflared` runs in its own
  container). Save.

**2. Run it:**

```sh
cp .env.example .env
# fill in EXTRACTOR_SHARED_SECRET, CLOUDFLARE_TUNNEL_TOKEN, and
# PUBLIC_BASE_URL (the exact hostname from the Public Hostname tab, e.g.
# https://videojam-extractor.controlaltdeleted.com) in .env

docker-compose -f docker-compose.synology.yml up -d --build
```

The extractor image now includes `ffmpeg` for lossless H.264/AAC-to-HLS
packaging. Allow enough container storage for up to four cached 720p music
videos (or lower `MAX_HLS_SESSIONS` on a space-constrained host). This is
stream-copy packaging, not video transcoding, so CPU use stays modest.

That's it — no separate "enable funnel" step; the Public Hostname route you
configured in the dashboard takes effect as soon as `cloudflared` connects.
Confirm it connected:

```sh
docker-compose -f docker-compose.synology.yml logs cloudflared
```

Look for a line like `Registered tunnel connection` — that means it's live.

Then, in the Vercel project:
- `VIDEO_EXTRACTOR_URL` = the hostname you set on the Public Hostname tab
  (e.g. `https://videojam-extractor.controlaltdeleted.com`)
- `VIDEO_EXTRACTOR_SECRET` = the same value set in `.env`

Verify:

```sh
curl -H "Authorization: Bearer <VIDEO_EXTRACTOR_SECRET>" \
  "https://videojam-extractor.controlaltdeleted.com/video-info?id=jNQXAC9IVRw"
```

## Deploying to Fly.io (not currently recommended — see above)

Kept for reference in case Fly's IP reputation improves, or as a fallback
behind a residential proxy. Two separate Fly apps, talking over Fly's
private network — not docker-compose, Fly doesn't run compose files
directly.

```sh
# 1. The PO-token sidecar — the published image, unmodified.
fly launch --no-deploy --image brainicism/bgutil-ytdlp-pot-provider:1.3.2-node \
  --name videojam-potoken-provider --config potoken-provider.fly.toml
fly deploy --config potoken-provider.fly.toml

# 2. Our extractor, from this directory's Dockerfile.
fly launch --no-deploy --name videojam-extractor --config fly.toml
fly secrets set --config fly.toml EXTRACTOR_SHARED_SECRET="$(openssl rand -hex 32)"
fly deploy --config fly.toml
```

Then, in the Vercel project:
- `VIDEO_EXTRACTOR_URL` = `https://videojam-extractor.fly.dev`
- `VIDEO_EXTRACTOR_SECRET` = the same value passed to `fly secrets set` above

## Updating when YouTube breaks BotGuard again

This will happen again — it's the nature of this cat-and-mouse game, just
with much faster upstream fixes than the old public-instance approach.
When it does:

```sh
fly deploy --config potoken-provider.fly.toml --image brainicism/bgutil-ytdlp-pot-provider:<new-tag>
```

Check https://github.com/Brainicism/bgutil-ytdlp-pot-provider for new tags —
no code changes are normally needed on our side. Also watch releases of
[`youtubei.js`](https://github.com/LuanRT/YouTube.js) and
[`googlevideo`](https://github.com/LuanRT/googlevideo). If their player,
format, or SABR APIs change, update the locked dependencies and re-check
`src/extract.ts`, `src/innertube.ts`, and `src/sabr-hls.ts` against their
types, then repeat both a progressive-video and official-video live test.
