# videojam-extractor

Standalone always-on service that resolves a YouTube video ID to a playable
stream URL for the tvOS app. Replaces scraping public Piped/Invidious
instances (which broke wholesale under YouTube's PO-token enforcement) with
`youtubei.js` talking directly to YouTube, backed by a self-hosted
[bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
sidecar for the PO-token/BotGuard side — we deliberately don't reimplement
that logic ourselves; it's intricate and actively patched upstream as YouTube
changes things, and owning a copy of it would just move that maintenance
burden onto us.

```
Vercel: /api/party/[code]/video-url ──▶ videojam-extractor ──▶ videojam-potoken-provider
        (falls back to Piped/Invidious    (youtubei.js:        (brainicism/bgutil-ytdlp-
         if this is unreachable)           getInfo/chooseFormat  pot-provider image,
                                            /decipher)            unmodified)
```

## Local dev / testing

```sh
cp .env.example .env   # set EXTRACTOR_SHARED_SECRET to anything for local testing
docker compose up --build
curl -H "Authorization: Bearer <your secret>" \
  "http://localhost:8080/video-info?id=jNQXAC9IVRw"
```

Expect `{"url": "...", "type": "mp4", "quality": "...", "expiresAt": "..."}`.
A bad ID (`?id=00000000000`) should 404. `curl localhost:8080/health` checks
the sidecar is reachable.

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

Uses [Tailscale Funnel](https://tailscale.com/kb/1223/funnel) (free on the
Personal plan) to get a stable public HTTPS URL without port-forwarding or
owning a domain:

```sh
cp .env.example .env
# fill in EXTRACTOR_SHARED_SECRET and TS_AUTHKEY in .env
# (TS_AUTHKEY: https://login.tailscale.com/admin/settings/keys — use a
# reusable, non-ephemeral key)

docker compose -f docker-compose.synology.yml up -d --build

# One-time — persists across restarts via the tailscale-state volume:
docker compose -f docker-compose.synology.yml exec tailscale tailscale funnel 8080

# Find your public URL:
docker compose -f docker-compose.synology.yml exec tailscale tailscale funnel status
```

That last command prints something like `https://videojam-extractor.<your-tailnet>.ts.net`
— that's your `VIDEO_EXTRACTOR_URL`.

If the `tailscale` service fails to start with a permissions/device error,
it's almost always Synology's Container Manager not exposing `/dev/net/tun`
or `NET_ADMIN` — `docker-compose.synology.yml` is already set to
`TS_USERSPACE: "true"` specifically to avoid needing those, so this
shouldn't come up, but if it does, that env var is the fix.

Then, in the Vercel project:
- `VIDEO_EXTRACTOR_URL` = the `https://....ts.net` URL from above
- `VIDEO_EXTRACTOR_SECRET` = the same value set in `.env`

Verify:

```sh
curl -H "Authorization: Bearer <VIDEO_EXTRACTOR_SECRET>" \
  "https://videojam-extractor.<your-tailnet>.ts.net/video-info?id=jNQXAC9IVRw"
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
no code changes needed on our side unless `youtubei.js`'s own `getInfo`/
`chooseFormat`/`decipher` API surface changes, in which case `npm update
youtubei.js` and re-check `extractor/src/extract.ts` against its types.
