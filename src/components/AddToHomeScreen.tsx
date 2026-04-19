"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "videojam_a2hs_dismissed";

export default function AddToHomeScreen() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(ios);

    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, "1");
    setShowIOSGuide(false);
  }, []);

  if (isStandalone || dismissed) return null;

  const canInstall = !!deferredPrompt;

  if (!canInstall && !isIOS) return null;

  return (
    <>
      <button
        onClick={canInstall ? install : () => setShowIOSGuide(true)}
        className="btn-ghost flex items-center gap-1.5 text-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
        </svg>
        Install App
      </button>

      {showIOSGuide ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIOSGuide(false);
          }}
        >
          <div className="w-full max-w-sm animate-slide-up rounded-2xl bg-zinc-900 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-pink-500 text-2xl shadow-lg shadow-brand-600/30">
              <span aria-hidden>♪</span>
            </div>
            <h3 className="mb-1 text-lg font-bold">Add VideoJam to Home Screen</h3>
            <p className="mb-5 text-sm text-white/50">
              Get the full-screen app experience
            </p>
            <ol className="mb-6 space-y-4 text-left text-sm">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold">
                  1
                </span>
                <span className="text-white/80">
                  Tap the{" "}
                  <span className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 font-medium text-white">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M13.75 7h-3V3.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0L6.2 4.74a.75.75 0 0 0 1.1 1.02l1.95-2.1V7h-3A2.25 2.25 0 0 0 4 9.25v7.5A2.25 2.25 0 0 0 6.25 19h7.5A2.25 2.25 0 0 0 16 16.75v-7.5A2.25 2.25 0 0 0 13.75 7Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Share
                  </span>{" "}
                  button in Safari
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold">
                  2
                </span>
                <span className="text-white/80">
                  Scroll down and tap{" "}
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-white">
                    Add to Home Screen
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-white/10 text-xs font-bold">
                  3
                </span>
                <span className="text-white/80">
                  Tap{" "}
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-white">
                    Add
                  </span>{" "}
                  to confirm
                </span>
              </li>
            </ol>
            <div className="flex gap-3">
              <button
                onClick={dismiss}
                className="flex-1 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/20"
              >
                Don&apos;t show again
              </button>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="flex-1 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-500"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
