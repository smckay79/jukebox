import crypto from "node:crypto";

// Short-lived capability tokens for /stream — lets us hand the tvOS app a
// URL on our own domain (which it can fetch from any network) instead of
// the raw googlevideo URL (which YouTube IP-locks to whoever requested it,
// i.e. this container's residential IP — see server.ts).
export function signStreamToken(
  videoId: string,
  expiresAt: number,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${videoId}:${expiresAt}`)
    .digest("hex");
}

export function verifyStreamToken(
  videoId: string,
  expiresAt: number,
  sig: string,
  secret: string,
): boolean {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt * 1000) return false;
  const expected = signStreamToken(videoId, expiresAt, secret);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(sig, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
