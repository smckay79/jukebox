// Procedurally-generated party wallpaper. An era picks the palette + base
// gradient (disco warm tones, 80s neon, 90s grunge, etc.), a genre picks the
// pattern flavor (synthwave grid, graffiti shards, lightning bolts, ...),
// and a numeric seed re-rolls the pattern layout so "Randomize" gives the
// host fresh variations without changing the overall vibe.
import type { PartyTheme } from "./types";

export const ERAS = [
  { id: "70s", label: "70s · Disco" },
  { id: "80s", label: "80s · Neon" },
  { id: "90s", label: "90s · Grunge" },
  { id: "2000s", label: "2000s · Y2K" },
  { id: "2010s", label: "2010s · Indie" },
  { id: "2020s", label: "2020s · Vaporwave" },
] as const;

export const GENRES = [
  { id: "rock", label: "Rock" },
  { id: "pop", label: "Pop" },
  { id: "hiphop", label: "Hip-Hop" },
  { id: "electronic", label: "Electronic" },
  { id: "country", label: "Country" },
  { id: "rnb", label: "R&B" },
  { id: "metal", label: "Metal" },
  { id: "indie", label: "Indie" },
] as const;

export type EraId = (typeof ERAS)[number]["id"];
export type GenreId = (typeof GENRES)[number]["id"];

interface Palette {
  c1: string;
  c2: string;
  c3: string;
  accent: string;
  bg: string;
}

const PALETTES: Record<EraId, Palette> = {
  "70s": {
    c1: "#c96f3a",
    c2: "#8b5a2b",
    c3: "#e9c46a",
    accent: "#f4a261",
    bg: "#2a1608",
  },
  "80s": {
    c1: "#ff2bd6",
    c2: "#00e5ff",
    c3: "#ff6ec7",
    accent: "#a855f7",
    bg: "#0f0726",
  },
  "90s": {
    c1: "#3f7a5e",
    c2: "#6a4a7a",
    c3: "#b8864a",
    accent: "#c04c4c",
    bg: "#0e1a1b",
  },
  "2000s": {
    c1: "#3b82f6",
    c2: "#94a3b8",
    c3: "#06b6d4",
    accent: "#a3e635",
    bg: "#020617",
  },
  "2010s": {
    c1: "#ff6b9d",
    c2: "#c06c84",
    c3: "#f8bbd0",
    accent: "#6c5b7b",
    bg: "#1a0e16",
  },
  "2020s": {
    c1: "#a18cd1",
    c2: "#fbc2eb",
    c3: "#fad0c4",
    accent: "#ffd3a5",
    bg: "#1e1033",
  },
};

function isEra(x: string | undefined): x is EraId {
  return !!x && ERAS.some((e) => e.id === x);
}
function isGenre(x: string | undefined): x is GenreId {
  return !!x && GENRES.some((g) => g.id === x);
}

// Seeded PRNG so "Randomize" reproduces the same wallpaper across viewers
// once the seed is persisted on the party.
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGradient(era: EraId): string {
  const p = PALETTES[era];
  // Dark base with two soft color washes pulled from the palette.
  return `radial-gradient(ellipse 80% 60% at 20% 0%, ${p.c1}44, transparent 60%), radial-gradient(ellipse 70% 50% at 90% 100%, ${p.c2}33, transparent 60%), linear-gradient(160deg, ${p.bg} 0%, #000 100%)`;
}

// ---------- SVG pattern builders ----------
const TILE = 400;

function buildPatternSvg(era: EraId, genre: GenreId, seed: number): string {
  const p = PALETTES[era];
  const rand = mulberry32(seed || 1);
  const shapes: string[] = [];

  const pick = (a: string, b: string) => (rand() < 0.5 ? a : b);

  switch (genre) {
    case "electronic": {
      // Synthwave-ish grid lines
      for (let i = 1; i < 16; i++) {
        const x = (i / 16) * TILE;
        shapes.push(
          `<line x1="${x}" y1="0" x2="${x}" y2="${TILE}" stroke="${p.c1}" stroke-opacity="0.14" stroke-width="1"/>`,
        );
      }
      for (let i = 1; i < 16; i++) {
        const y = (i / 16) * TILE;
        shapes.push(
          `<line x1="0" y1="${y}" x2="${TILE}" y2="${y}" stroke="${p.c2}" stroke-opacity="0.1" stroke-width="1"/>`,
        );
      }
      break;
    }
    case "pop": {
      // Starburst sparkles
      for (let i = 0; i < 18; i++) {
        const x = rand() * TILE;
        const y = rand() * TILE;
        const r = 2 + rand() * 4;
        const op = (0.35 + rand() * 0.4).toFixed(2);
        shapes.push(
          `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.c3}" fill-opacity="${op}"/>`,
        );
      }
      for (let i = 0; i < 6; i++) {
        const x = rand() * TILE;
        const y = rand() * TILE;
        const s = 10 + rand() * 18;
        shapes.push(
          `<path d="M ${x} ${y - s} L ${x + 2} ${y - 2} L ${x + s} ${y} L ${x + 2} ${y + 2} L ${x} ${y + s} L ${x - 2} ${y + 2} L ${x - s} ${y} L ${x - 2} ${y - 2} Z" fill="${p.accent}" fill-opacity="0.35"/>`,
        );
      }
      break;
    }
    case "rock": {
      // Lightning bolts
      for (let i = 0; i < 7; i++) {
        const x = rand() * TILE;
        const y = rand() * TILE;
        const s = 25 + rand() * 45;
        shapes.push(
          `<polygon points="${x},${y} ${x + s * 0.4},${y + s * 0.55} ${x + s * 0.15},${y + s * 0.6} ${x + s * 0.55},${y + s} ${x + s * 0.05},${y + s * 0.7} ${x + s * 0.25},${y + s * 0.6} ${x},${y + s * 0.5}" fill="${p.accent}" fill-opacity="0.28"/>`,
        );
      }
      break;
    }
    case "hiphop": {
      // Tilted graffiti shards
      for (let i = 0; i < 14; i++) {
        const x = rand() * TILE;
        const y = rand() * TILE;
        const w = 25 + rand() * 90;
        const h = 4 + rand() * 10;
        const rot = Math.floor(rand() * 360);
        shapes.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${pick(p.c1, p.accent)}" fill-opacity="0.32" transform="rotate(${rot} ${x} ${y})"/>`,
        );
      }
      break;
    }
    case "country": {
      // Rolling wave paths
      for (let i = 0; i < 6; i++) {
        const y = (i / 6) * TILE + (rand() - 0.5) * 40;
        const dy = (rand() - 0.5) * 60;
        shapes.push(
          `<path d="M 0 ${y} Q ${TILE / 4} ${y + dy}, ${TILE / 2} ${y} T ${TILE} ${y}" fill="none" stroke="${p.c3}" stroke-opacity="0.22" stroke-width="2"/>`,
        );
      }
      break;
    }
    case "rnb": {
      // Soft blurred blobs
      for (let i = 0; i < 6; i++) {
        const x = rand() * TILE;
        const y = rand() * TILE;
        const r = 50 + rand() * 90;
        shapes.push(
          `<circle cx="${x}" cy="${y}" r="${r}" fill="${pick(p.c1, p.c2)}" fill-opacity="0.14"/>`,
        );
      }
      break;
    }
    case "metal": {
      // Sharp dark triangles
      for (let i = 0; i < 10; i++) {
        const x = rand() * TILE;
        const y = rand() * TILE;
        const s = 18 + rand() * 42;
        shapes.push(
          `<polygon points="${x},${y} ${x + s},${y + s * 1.6} ${x - s},${y + s * 1.6}" fill="${p.accent}" fill-opacity="0.3"/>`,
        );
      }
      break;
    }
    case "indie":
    default: {
      // Minimal geometric dots + thin lines
      for (let i = 0; i < 28; i++) {
        const x = rand() * TILE;
        const y = rand() * TILE;
        shapes.push(
          `<circle cx="${x}" cy="${y}" r="2" fill="${p.c3}" fill-opacity="0.28"/>`,
        );
      }
      for (let i = 0; i < 3; i++) {
        const x1 = rand() * TILE;
        const y1 = rand() * TILE;
        const x2 = rand() * TILE;
        const y2 = rand() * TILE;
        shapes.push(
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.c1}" stroke-opacity="0.18" stroke-width="1"/>`,
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">${shapes.join("")}</svg>`;
}

function toDataUrl(svg: string): string {
  // encodeURIComponent avoids the need for btoa/Buffer and works in both
  // browser and Node contexts.
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `url("data:image/svg+xml;charset=utf-8,${encoded}")`;
}

// Returns inline style for a full-screen background div. Returns null when
// the theme has nothing to render (let the default body gradient show).
export function buildBackgroundStyle(
  theme: PartyTheme | undefined,
): React.CSSProperties | null {
  if (!theme) return null;
  if (theme.customImage) {
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("${theme.customImage}")`,
      backgroundSize: "cover, cover",
      backgroundPosition: "center, center",
      backgroundRepeat: "no-repeat, no-repeat",
    };
  }
  if (!isEra(theme.era) || !isGenre(theme.genre)) return null;
  const gradient = buildGradient(theme.era);
  const svg = buildPatternSvg(theme.era, theme.genre, theme.seed ?? 1);
  return {
    backgroundImage: `${toDataUrl(svg)}, ${gradient}`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: "400px 400px, 100% 100%",
    backgroundPosition: "0 0, 0 0",
  };
}
