"use client";

import { useRef, useState } from "react";
import { ERAS, GENRES } from "@/lib/background";
import type { PartyTheme } from "@/lib/types";

// Admin-only background controls. Lets the host pick an era + genre for a
// procedurally-generated wallpaper, reroll the seed, or upload a custom
// party image. Custom images are downscaled client-side so Redis doesn't
// swallow a 10MB phone photo.
const MAX_DIM = 1600; // resize longest edge to this
const MAX_BYTES = 500_000; // ~500KB encoded cap; we step quality down to fit

async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // Step down JPEG quality until we fit the cap. PNG fallback only if the
  // source is already very small.
  for (const q of [0.82, 0.72, 0.6, 0.5, 0.4]) {
    const dataUrl = canvas.toDataURL("image/jpeg", q);
    if (dataUrl.length <= MAX_BYTES) return dataUrl;
  }
  throw new Error("Image is too large — try a smaller file.");
}

export default function ThemePicker({
  theme,
  onApply,
}: {
  theme?: PartyTheme;
  onApply: (next: PartyTheme | null) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [era, setEra] = useState<string>(theme?.era ?? "80s");
  const [genre, setGenre] = useState<string>(theme?.genre ?? "electronic");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function apply(next: PartyTheme | null) {
    setBusy(true);
    setErr(null);
    const e = await onApply(next);
    setBusy(false);
    if (e) setErr(e);
  }

  async function applyProcedural(nextEra: string, nextGenre: string, seed?: number) {
    await apply({
      era: nextEra,
      genre: nextGenre,
      seed: seed ?? Math.floor(Math.random() * 1_000_000),
      // Drop any existing custom image when switching back to procedural.
      customImage: undefined,
    });
  }

  async function onRandomize() {
    await applyProcedural(era, genre);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await resizeImage(file);
      const result = await onApply({
        // Keep era/genre around as the fallback if the image is cleared.
        era: theme?.era,
        genre: theme?.genre,
        seed: theme?.seed,
        customImage: dataUrl,
      });
      if (result) setErr(result);
    } catch (ex) {
      setErr(
        ex instanceof Error ? ex.message : "Couldn't process that image",
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const hasTheme = !!theme?.era || !!theme?.customImage;

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Background{" "}
          {hasTheme ? (
            <span className="text-white/50">
              ·{" "}
              {theme?.customImage
                ? "custom"
                : `${theme?.era ?? ""} ${theme?.genre ?? ""}`.trim()}
            </span>
          ) : (
            <span className="text-white/50">· default</span>
          )}
        </span>
        <span className="text-white/50">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-white/60">Era</span>
              <select
                className="input !py-1.5 text-sm"
                value={era}
                onChange={(e) => setEra(e.target.value)}
              >
                {ERAS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-white/60">Genre</span>
              <select
                className="input !py-1.5 text-sm"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              >
                {GENRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary !px-3 !py-1.5 text-sm"
              disabled={busy}
              onClick={() => applyProcedural(era, genre, theme?.seed)}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn-ghost !px-3 !py-1.5 text-sm"
              disabled={busy}
              onClick={onRandomize}
              title="Reroll the pattern with a new random seed"
            >
              Randomize
            </button>
            {hasTheme ? (
              <button
                type="button"
                className="btn-ghost !px-3 !py-1.5 text-sm"
                disabled={busy}
                onClick={() => apply(null)}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="mb-1 text-xs text-white/60">
              Or upload a party photo
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onUpload}
              disabled={busy}
              className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-brand-500"
            />
            <p className="mt-1 text-xs text-white/40">
              Resized to ~1600px and darkened so the UI stays readable.
            </p>
          </div>

          {err ? <p className="text-xs text-red-400">{err}</p> : null}
          {busy ? <p className="text-xs text-white/50">Applying…</p> : null}
        </div>
      ) : null}
    </div>
  );
}
