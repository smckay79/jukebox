// Thin client for the bgutil-ytdlp-pot-provider sidecar's HTTP API
// (https://github.com/Brainicism/bgutil-ytdlp-pot-provider). We deliberately do
// NOT reimplement BotGuard/PO-token solving ourselves here — that logic is
// intricate, reverse-engineered, and actively patched by that project's
// maintainers as YouTube changes its checks (confirmed: their session manager
// has patches dated within the last month as of writing this). Owning a
// from-scratch copy of that logic would just move the maintenance burden onto
// us. Instead we run their published image as a sidecar and call its
// documented /get_pot endpoint.

export interface PoTokenResult {
  poToken: string;
  contentBinding: string;
  expiresAt: string;
}

const PROVIDER_URL = process.env.POTOKEN_PROVIDER_URL ?? "http://127.0.0.1:4416";

export async function fetchPoToken(
  contentBinding?: string,
  bypassCache = false,
): Promise<PoTokenResult> {
  const res = await fetch(`${PROVIDER_URL}/get_pot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content_binding: contentBinding,
      bypass_cache: bypassCache,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `PO token provider returned ${res.status}: ${body.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as PoTokenResult;
  if (!data.poToken) {
    throw new Error("PO token provider returned an empty poToken");
  }
  return data;
}

export async function providerHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${PROVIDER_URL}/ping`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
