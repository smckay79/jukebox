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

## Deploying to Fly.io

Two separate Fly apps, talking over Fly's private network — not
docker-compose, Fly doesn't run compose files directly.

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

Verify from outside the sandbox/Fly network (source IP matters for
PO-token/BotGuard enforcement — confirmed by testing during development):

```sh
curl -H "Authorization: Bearer <VIDEO_EXTRACTOR_SECRET>" \
  "https://videojam-extractor.fly.dev/video-info?id=jNQXAC9IVRw"
```

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
