# Jukebox

A group-playlist YouTube jukebox for parties. Host creates a party, guests scan
a QR code to join, everyone adds tracks and upvotes their favorites, the host
can skip or yank songs.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- YouTube IFrame API for playback
- `qrcode` for join QR codes
- In-memory store on the server (v1 — will be replaced by a real backend)

## Local dev

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push this repo to GitHub (already done if you used Claude Code).
2. Go to <https://vercel.com/new> and import the repo. Click **Deploy** — no
   env vars needed to get a build up.
3. **Add persistent storage** (required for the app to actually work —
   without it you'll hit "Party not found" after creating a party, because
   Vercel serverless instances don't share memory):
   - In the Vercel project, go to **Storage → Create Database → Upstash for
     Redis** (or the "KV" option; it's Upstash under the hood).
   - Accept the free tier. Click **Connect** to link it to this project.
   - Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or
     `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) automatically.
   - Redeploy. Done.
4. Future pushes to the connected branch redeploy automatically.

### Storage modes

`src/lib/store.ts` picks a backend at startup:

- If `KV_REST_API_URL` + `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*`
  equivalents) are set → **Upstash Redis**. Parties are stored as JSON with
  a 7-day TTL.
- Otherwise → **in-memory `Map`**. Fine for `npm run dev`; broken on
  serverless because cold starts + multiple instances mean state is not
  shared.

## Local dev without Redis

`npm run dev` works with no env vars — the store uses an in-memory `Map` on
the dev server, which is fine for a single Node process. For production,
follow the Deploy to Vercel steps above to hook up Upstash.

## How it works

- **Create a party**: the creator gets a 6-char party code plus a secret admin
  key stored in `localStorage`. The admin key is what gates skip/remove.
- **Join a party**: everyone else hits `/party/<code>` (via QR or manual code).
- **Queue**: songs are sorted by upvotes, ties broken by time added. The
  creator's "add" counts as their upvote.
- **Now playing**: the first viewer's `<iframe>` player tells the server when
  the track ends, which promotes the next song. (Anyone can act as the
  playback host; the TV tab typically does.)
- **Admin**: only the creator (has the admin key in `localStorage`) sees
  Skip / Remove controls.

## Roadmap — iterate from here

Server state now lives in Upstash Redis (when env vars are present) via
`src/lib/store.ts`. Roadmap:

- **Real-time push.** Currently the client polls every 3s. Next step: use
  Upstash Redis pub/sub, Supabase Realtime, or Pusher to push queue deltas
  to connected clients so votes appear instantly. Drop the polling in
  `PartyRoom.tsx`.
- **Per-party concurrency.** Party writes currently do
  read-mutate-write-back on the JSON blob, so a pile of simultaneous votes
  could drop one. For a single party it's fine; at scale we'd switch to
  Redis hashes or Lua scripts for atomic updates.
- **Proper auth.** Replace the "localStorage admin key" with NextAuth (Google
  / magic link) so hosts keep their parties across browsers.
- **YouTube search.** Add a `/api/search` using the YouTube Data API so guests
  can search without copying URLs.
- **Per-user rate limits + moderation.** Upstash Redis for rate limiting; a
  `blocklist` table for banned video IDs.
- **UI polish.** Drag-to-reorder for admins, "coming up next" preview,
  now-playing progress bar, mobile-first redesign.
- **Party TTL + shareable links.** Persist parties for N days; host can end a
  party manually.

## Project layout

```
src/
  app/
    page.tsx                      landing (create / join)
    party/[code]/page.tsx         the party room (everyone)
    api/party/route.ts            POST → create party
    api/party/[code]/route.ts     GET → public party state
    api/party/[code]/queue/route.ts   POST → add song
    api/party/[code]/vote/route.ts    POST → toggle upvote
    api/party/[code]/ended/route.ts   POST → current song finished
    api/party/[code]/admin/route.ts   POST → skip / remove (requires key)
  components/
    CreatePartyForm.tsx
    JoinForm.tsx
    PartyRoom.tsx                 orchestrator
    Player.tsx                    YouTube IFrame wrapper
    AddSong.tsx
    Queue.tsx
    QRCard.tsx
  lib/
    store.ts                      in-memory store (swap for real backend)
    identity.ts                   client-side userId + admin key in localStorage
    youtube.ts                    URL parsing + oEmbed metadata
    types.ts
```
