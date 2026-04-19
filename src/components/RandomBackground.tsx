"use client";

import { useEffect, useState } from "react";
import Background from "./Background";
import { ERAS, GENRES } from "@/lib/background";
import type { PartyTheme } from "@/lib/types";

export default function RandomBackground() {
  const [theme, setTheme] = useState<PartyTheme | null>(null);

  useEffect(() => {
    const era = ERAS[Math.floor(Math.random() * ERAS.length)].id;
    const genre = GENRES[Math.floor(Math.random() * GENRES.length)].id;
    const seed = Math.floor(Math.random() * 100000);
    setTheme({ era, genre, seed });
  }, []);

  if (!theme) return null;
  return <Background theme={theme} />;
}
