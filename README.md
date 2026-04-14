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
2. Go to <https://vercel.com/new> and import the repo.
3. No env vars required for v1 — click **Deploy**.
4. Vercel auto-deploys on each push to the branch.

## How it works (v1)

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

The v1 server state is in `src/lib/store.ts` using an in-memory `Map` on
`globalThis`. This is fine for a demo but has two limits:

1. Serverless cold starts wipe the map.
2. State isn't shared across regions / function instances.

Planned iterations:

- **Persistent real-time backend.** Swap `store.ts` for Supabase or Vercel KV +
  Postgres. Use Postgres `LISTEN/NOTIFY` (Supabase Realtime) or Pusher to push
  queue updates; drop the 3-second polling in `PartyRoom`.
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
