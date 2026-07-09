import { getRedis } from "./kv";

const SPONSOR_LOGO_KEY = "global:sponsorLogo";

let memSponsorLogo: string | null = null;

export async function getSponsorLogo(): Promise<string | null> {
  const r = getRedis();
  if (r) {
    const val = await r.get<string>(SPONSOR_LOGO_KEY);
    return val ?? null;
  }
  return memSponsorLogo;
}

export async function setSponsorLogo(dataUrl: string): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.set(SPONSOR_LOGO_KEY, dataUrl);
  } else {
    memSponsorLogo = dataUrl;
  }
}

export async function clearSponsorLogo(): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.del(SPONSOR_LOGO_KEY);
  } else {
    memSponsorLogo = null;
  }
}
