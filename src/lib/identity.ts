"use client";

// Stable per-browser identity + display name, stored in localStorage.
// Used for upvote deduping and "added by" labels.

const USER_ID_KEY = "jukebox.userId";
const NAME_KEY = "jukebox.displayName";

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = randomId();
    window.localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function getDisplayName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

export function setDisplayName(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAME_KEY, name);
}

// Admin keys are stored per-party-code so creators stay authenticated after
// reload. Guests never have one.
function adminKeyFor(code: string) {
  return `jukebox.admin.${code.toUpperCase()}`;
}

export function getAdminKey(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(adminKeyFor(code));
}

export function setAdminKey(code: string, key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(adminKeyFor(code), key);
}

export function clearAdminKey(code: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(adminKeyFor(code));
}

function adminPinFor(code: string) {
  return `jukebox.pin.${code.toUpperCase()}`;
}

export function getAdminPin(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(adminPinFor(code));
}

export function setAdminPin(code: string, pin: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(adminPinFor(code), pin);
}
