"use client";

import { useMemo } from "react";
import { buildBackgroundStyle } from "@/lib/background";
import type { PartyTheme } from "@/lib/types";

// Full-viewport layer sitting behind the app content. When the party has no
// theme set, renders nothing so the default body gradient shows through.
export default function Background({ theme }: { theme?: PartyTheme }) {
  const style = useMemo(() => buildBackgroundStyle(theme), [theme]);
  if (!style) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={style}
    />
  );
}
