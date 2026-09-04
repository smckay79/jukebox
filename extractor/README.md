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
# fill in EXTRACTOR_SHARED_SECRET and CLOUDFLARE_TUNNEL_TOKEN in .env

docker-compose -f docker-compose.synology.yml up -d --build
```

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
no code changes needed on our side unless `youtubei.js`'s own `getInfo`/
`chooseFormat`/`decipher` API surface changes, in which case `npm update
youtubei.js` and re-check `extractor/src/extract.ts` against its types.
