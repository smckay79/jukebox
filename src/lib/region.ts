// Resolve the party host's country from the incoming request. Used by the
// playlist importer to flag videos whose YouTube regionRestriction blocks
// them where the host is — so a "Liked music" import doesn't queue up a
// track that'll just show a grey "not available" box at the party.
//
// Sources, in priority order:
//   1. x-vercel-ip-country — Vercel sets this from the request IP
//   2. cf-ipcountry — Cloudflare's equivalent if someone proxies through
//   3. Accept-Language's first locale tag (e.g. "en-US" -> "US")
//   4. Fallback: "US"
//
// Returns an uppercase ISO 3166-1 alpha-2 code.
export function getClientRegion(req: Request): string {
  const h = req.headers;
  const vc = h.get("x-vercel-ip-country");
  if (vc && /^[A-Z]{2}$/i.test(vc)) return vc.toUpperCase();
  const cf = h.get("cf-ipcountry");
  if (cf && /^[A-Z]{2}$/i.test(cf)) return cf.toUpperCase();
  const al = h.get("accept-language");
  if (al) {
    const m = /^[a-z]{2,3}[-_]([a-z]{2})/i.exec(al.trim());
    if (m) return m[1].toUpperCase();
  }
  return "US";
}

// Pick the region to use for a request. Accepts an explicit preference (the
// party's configured country) and only falls back to request-derived
// detection when that's missing or malformed. Keeps the validation in one
// place so callers don't have to remember the alpha-2 rule.
export function resolveRegion(req: Request, preferred?: string | null): string {
  if (preferred && /^[A-Za-z]{2}$/.test(preferred)) {
    return preferred.toUpperCase();
  }
  return getClientRegion(req);
}

// Evaluate a regionRestriction block from YouTube's videos.list response
// against our detected region. Returns `{ available: true }` when the video
// will play, otherwise carries a short reason we can show the user.
export function checkRegionRestriction(
  rr: { allowed?: string[]; blocked?: string[] } | undefined,
  region: string,
): { available: boolean; reason?: string } {
  if (!rr) return { available: true };
  const r = region.toUpperCase();
  // A `blocked` list means "playable everywhere except these".
  if (Array.isArray(rr.blocked) && rr.blocked.length > 0) {
    if (rr.blocked.map((x) => x.toUpperCase()).includes(r)) {
      return { available: false, reason: `Blocked in ${r}` };
    }
  }
  // An `allowed` list means "playable ONLY in these". Absence or empty list
  // we treat as "allowed everywhere" — that's how Google's API docs phrase
  // it, though in practice if `allowed` is set it's the whitelist.
  if (Array.isArray(rr.allowed) && rr.allowed.length > 0) {
    if (!rr.allowed.map((x) => x.toUpperCase()).includes(r)) {
      return { available: false, reason: `Not available in ${r}` };
    }
  }
  return { available: true };
}
