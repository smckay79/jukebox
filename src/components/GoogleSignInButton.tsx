"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/lib/types";

// Minimal subset of the Google Identity Services client types we touch.
type GoogleAccountsId = {
  initialize: (opts: {
    client_id: string;
    callback: (resp: { credential: string }) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    el: HTMLElement,
    opts: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      type?: "standard" | "icon";
      shape?: "rectangular" | "pill" | "circle" | "square";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      width?: number | string;
      logo_alignment?: "left" | "center";
    },
  ) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

// Idempotent loader — the GSI script is added once per page lifetime.
let gsiReadyPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiReadyPromise) return gsiReadyPromise;
  gsiReadyPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load gsi"));
    document.head.appendChild(s);
  });
  return gsiReadyPromise;
}

export default function GoogleSignInButton({
  onSignedIn,
  clientId,
}: {
  onSignedIn: (user: PublicUser) => void;
  // The OAuth 2.0 Web Client ID from Google Cloud Console. Passed in from
  // the page so it can come from NEXT_PUBLIC_GOOGLE_CLIENT_ID without this
  // component needing to know about env vars.
  clientId: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCredential = useCallback(
    async (resp: { credential: string }) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential: resp.credential }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError((data as { error?: string }).error ?? "Sign-in failed");
          return;
        }
        onSignedIn((data as { user: PublicUser }).user);
      } catch {
        setError("Network error — try again?");
      } finally {
        setBusy(false);
      }
    },
    [onSignedIn],
  );

  useEffect(() => {
    if (!clientId) {
      setError(
        "Google sign-in isn't configured (missing NEXT_PUBLIC_GOOGLE_CLIENT_ID).",
      );
      return;
    }
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled) return;
        const g = window.google?.accounts?.id;
        if (!g || !hostRef.current) return;
        g.initialize({
          client_id: clientId,
          callback: onCredential,
          ux_mode: "popup",
          // FedCM is the new browser-level identity API; letting GIS use it
          // where available avoids the "third-party cookies" friction.
          use_fedcm_for_prompt: true,
        });
        g.renderButton(hostRef.current, {
          theme: "filled_blue",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 280,
        });
      })
      .catch(() => {
        setError("Couldn't load Google sign-in.");
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={hostRef} aria-label="Sign in with Google" />
      {busy ? <p className="text-xs text-white/60">Signing in…</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
