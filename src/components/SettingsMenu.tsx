"use client";

import { useEffect, useState } from "react";
import ThemePicker from "./ThemePicker";
import type { PartyTheme } from "@/lib/types";

// Admin-only settings modal, triggered from the header next to Show QR.
// Collects "one-time" party configuration — the background wallpaper and
// the scrolling marquee — in a single place so the header stays tidy.
// Short curated list of common picks. YouTube accepts any ISO 3166-1 alpha-2,
// but exposing a dropdown keeps the UI tidy and avoids typos. "" = Auto
// (fall back to the request-derived region in resolveRegion).
const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "", label: "Auto (from location)" },
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "DK", label: "Denmark" },
  { code: "PL", label: "Poland" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "IN", label: "India" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "AR", label: "Argentina" },
  { code: "ZA", label: "South Africa" },
];

interface BumperEntry {
  videoId: string;
  title: string;
  thumbnail: string;
}

export default function SettingsMenu({
  theme,
  marquee,
  country,
  bumperCount,
  onSetTheme,
  onSetMarquee,
  onSetCountry,
  onAddBumper,
  onRemoveBumper,
}: {
  theme?: PartyTheme;
  marquee?: string;
  country?: string;
  bumperCount?: number;
  onSetTheme: (next: PartyTheme | null) => Promise<string | null>;
  onSetMarquee: (text: string) => Promise<string | null>;
  onSetCountry: (next: string | null) => Promise<string | null>;
  onAddBumper: (url: string) => Promise<string | null>;
  onRemoveBumper: (videoId: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(marquee ?? "");
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [countryBusy, setCountryBusy] = useState(false);
  const [countryFlash, setCountryFlash] = useState(false);
  const [countryErr, setCountryErr] = useState<string | null>(null);
  const [bumperUrl, setBumperUrl] = useState("");
  const [bumperBusy, setBumperBusy] = useState(false);
  const [bumperErr, setBumperErr] = useState<string | null>(null);
  const [bumperFlash, setBumperFlash] = useState(false);

  // Re-sync the textarea whenever the persisted marquee changes from the
  // server (another admin device, or a load).
  useEffect(() => {
    setDraft(marquee ?? "");
  }, [marquee]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function saveCountry(next: string) {
    setCountryBusy(true);
    setCountryErr(null);
    const e = await onSetCountry(next || null);
    setCountryBusy(false);
    if (e) {
      setCountryErr(e);
    } else {
      setCountryFlash(true);
      setTimeout(() => setCountryFlash(false), 1200);
    }
  }

  async function saveMarquee() {
    setBusy(true);
    setErr(null);
    const e = await onSetMarquee(draft);
    setBusy(false);
    if (e) {
      setErr(e);
    } else {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-ghost text-sm"
        onClick={() => setOpen(true)}
        title="Settings"
        aria-label="Open settings"
      >
        <span aria-hidden>⚙</span>
        <span className="hidden sm:inline">Settings</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#120a1f] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Party settings</h2>
              <button
                type="button"
                className="text-white/60 hover:text-white"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-white/80">
                Background
              </h3>
              <ThemePicker theme={theme} onApply={onSetTheme} />
            </section>

            <section className="mt-5 space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Country
              </h3>
              <p className="text-xs text-white/50">
                Only show videos playable in this country, and bias search
                results toward its charts. Leave on Auto to use the server's
                detected region.
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={country ?? ""}
                  onChange={(e) => saveCountry(e.target.value)}
                  disabled={countryBusy}
                  className="input flex-1 text-sm"
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code || "auto"} value={c.code}>
                      {c.label}
                      {c.code ? ` · ${c.code}` : ""}
                    </option>
                  ))}
                </select>
                {countryFlash ? (
                  <span className="text-xs text-emerald-300">Saved</span>
                ) : countryBusy ? (
                  <span className="text-xs text-white/50">Saving…</span>
                ) : null}
              </div>
              {countryErr ? (
                <p className="text-xs text-red-400">{countryErr}</p>
              ) : null}
            </section>

            <section className="mt-5 space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Scrolling message
              </h3>
              <p className="text-xs text-white/50">
                Shown on a loop along the bottom of the TV view. Leave blank
                to turn it off.
              </p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Please don't kill the vibe"
                maxLength={300}
                rows={2}
                className="input resize-none text-sm"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/40">
                  {draft.length}/300
                </span>
                <div className="flex items-center gap-2">
                  {savedFlash ? (
                    <span className="text-xs text-emerald-300">Saved</span>
                  ) : null}
                  <button
                    type="button"
                    className="btn-primary !px-3 !py-1.5 text-sm"
                    disabled={busy || draft === (marquee ?? "")}
                    onClick={saveMarquee}
                  >
                    {busy ? "Saving…" : "Save message"}
                  </button>
                </div>
              </div>
              {err ? <p className="text-xs text-red-400">{err}</p> : null}
            </section>

            <section className="mt-5 space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Bumper videos
                {(bumperCount ?? 0) > 0 ? (
                  <span className="ml-1 font-normal text-white/40">
                    ({bumperCount})
                  </span>
                ) : null}
              </h3>
              <p className="text-xs text-white/50">
                Short clips that play randomly between songs — intros,
                hype reels, funny clips, whatever. Paste a YouTube link
                to add one.
              </p>
              <div className="flex gap-2">
                <input
                  value={bumperUrl}
                  onChange={(e) => setBumperUrl(e.target.value)}
                  placeholder="Paste a YouTube link"
                  className="input flex-1 text-sm"
                />
                <button
                  type="button"
                  className="btn-primary !px-3 !py-1.5 text-sm"
                  disabled={bumperBusy || !bumperUrl.trim()}
                  onClick={async () => {
                    setBumperBusy(true);
                    setBumperErr(null);
                    const e = await onAddBumper(bumperUrl.trim());
                    setBumperBusy(false);
                    if (e) {
                      setBumperErr(e);
                    } else {
                      setBumperUrl("");
                      setBumperFlash(true);
                      setTimeout(() => setBumperFlash(false), 1200);
                    }
                  }}
                >
                  {bumperBusy ? "Adding…" : "Add"}
                </button>
              </div>
              {bumperFlash ? (
                <span className="text-xs text-emerald-300">Added!</span>
              ) : null}
              {bumperErr ? (
                <p className="text-xs text-red-400">{bumperErr}</p>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
