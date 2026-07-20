"use client";

import { useEffect, useRef, useState } from "react";
import ThemePicker from "./ThemePicker";
import type { PartyTheme, PublicParty, Sponsor } from "@/lib/types";

interface MatchSearchResult {
  title: string;
  channelTitle: string;
  thumbnail: string;
}

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
  triggerType?: string;
  triggerMatch?: string;
}

export default function SettingsMenu({
  theme,
  marquee,
  country,
  bumperCount,
  code,
  adminKey,
  party,
  onSetTheme,
  onSetMarquee,
  onSetCountry,
  onAddBumper,
  onRemoveBumper,
  onListBumpers,
  onPartyUpdated,
  isPro = true,
}: {
  theme?: PartyTheme;
  marquee?: string;
  country?: string;
  bumperCount?: number;
  code: string;
  adminKey: string;
  party: PublicParty;
  onSetTheme: (next: PartyTheme | null) => Promise<string | null>;
  onSetMarquee: (text: string) => Promise<string | null>;
  onSetCountry: (next: string | null) => Promise<string | null>;
  onAddBumper: (url: string, triggerType?: "random" | "match", triggerMatch?: string) => Promise<string | null>;
  onRemoveBumper: (videoId: string) => Promise<string | null>;
  onListBumpers: () => Promise<BumperEntry[]>;
  onPartyUpdated: (party: PublicParty) => void;
  isPro?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(marquee ?? "");
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [countryBusy, setCountryBusy] = useState(false);
  const [countryFlash, setCountryFlash] = useState(false);
  const [countryErr, setCountryErr] = useState<string | null>(null);

  // Bumper add form state
  const [bumperUrl, setBumperUrl] = useState("");
  const [bumperTrigger, setBumperTrigger] = useState<"random" | "match">("random");
  const [bumperMatch, setBumperMatch] = useState("");
  const [bumperBusy, setBumperBusy] = useState(false);
  const [bumperErr, setBumperErr] = useState<string | null>(null);
  const [bumperFlash, setBumperFlash] = useState(false);

  // Match search state
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResults, setMatchResults] = useState<MatchSearchResult[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchFocused, setMatchFocused] = useState(false);
  const matchAbortRef = useRef<AbortController | null>(null);
  const matchWrapRef = useRef<HTMLDivElement | null>(null);

  // Bumper list state
  const [bumpers, setBumpers] = useState<BumperEntry[]>([]);
  const [bumpersLoaded, setBumpersLoaded] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Sponsor state
  const [sponsorUploading, setSponsorUploading] = useState(false);
  const [sponsorErr, setSponsorErr] = useState<string | null>(null);
  const [sponsorRemoving, setSponsorRemoving] = useState<string | null>(null);
  const sponsorFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(marquee ?? "");
  }, [marquee]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Load bumper list when modal opens
  useEffect(() => {
    if (!open) {
      setBumpersLoaded(false);
      return;
    }
    let cancelled = false;
    onListBumpers().then((list) => {
      if (!cancelled) {
        setBumpers(list);
        setBumpersLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, [open, onListBumpers]);

  // Debounced YouTube search for the match keyword field
  useEffect(() => {
    const q = matchQuery.trim();
    if (!q || bumperTrigger !== "match") {
      matchAbortRef.current?.abort();
      setMatchResults([]);
      setMatchLoading(false);
      return;
    }
    const t = setTimeout(async () => {
      matchAbortRef.current?.abort();
      const ctl = new AbortController();
      matchAbortRef.current = ctl;
      setMatchLoading(true);
      try {
        const qs = new URLSearchParams({ q });
        if (country) qs.set("country", country);
        const res = await fetch(`/api/search?${qs.toString()}`, {
          signal: ctl.signal,
        });
        if (!res.ok) { setMatchResults([]); return; }
        const data = await res.json();
        setMatchResults(
          (data.results ?? []).slice(0, 6).map((r: Record<string, string>) => ({
            title: r.title,
            channelTitle: r.channelTitle,
            thumbnail: r.thumbnail,
          })),
        );
      } catch {
        setMatchResults([]);
      } finally {
        setMatchLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [matchQuery, bumperTrigger, country]);

  // Close match dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (matchWrapRef.current && !matchWrapRef.current.contains(e.target as Node)) {
        setMatchFocused(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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

  async function addBumper() {
    setBumperBusy(true);
    setBumperErr(null);
    const triggerType = bumperTrigger;
    const triggerMatch = bumperTrigger === "match" ? bumperMatch.trim() : undefined;
    if (bumperTrigger === "match" && !triggerMatch) {
      setBumperErr("Enter a keyword to match against song titles");
      setBumperBusy(false);
      return;
    }
    const e = await onAddBumper(bumperUrl.trim(), triggerType, triggerMatch);
    setBumperBusy(false);
    if (e) {
      setBumperErr(e);
    } else {
      setBumperUrl("");
      setBumperMatch("");
      setMatchQuery("");
      setMatchResults([]);
      setBumperTrigger("random");
      setBumperFlash(true);
      setTimeout(() => setBumperFlash(false), 1200);
      // Refresh the list
      const list = await onListBumpers();
      setBumpers(list);
    }
  }

  async function removeBumper(videoId: string) {
    setRemovingId(videoId);
    await onRemoveBumper(videoId);
    setBumpers((prev) => prev.filter((b) => b.videoId !== videoId));
    setRemovingId(null);
  }

  async function handleSponsorFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size before uploading (5MB limit for data URL)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setSponsorErr(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
      return;
    }

    setSponsorUploading(true);
    setSponsorErr(null);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const imageUrl = evt.target?.result as string;
        const title = file.name.replace(/\.[^/.]+$/, "").slice(0, 100);

        try {
          const res = await fetch(`/api/party/${code}/sponsors/add`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-admin-key": adminKey,
            },
            body: JSON.stringify({ imageUrl, title }),
          });

          const data = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string; party?: PublicParty };
          if (!res.ok) {
            setSponsorErr(data.error ?? "Failed to add sponsor");
            setSponsorUploading(false);
            return;
          }

          if (data.party) {
            onPartyUpdated(data.party);
          }
          if (sponsorFileRef.current) sponsorFileRef.current.value = "";
        } catch (err) {
          setSponsorErr("Network error - please try again");
          console.error("Sponsor upload error:", err);
        } finally {
          setSponsorUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setSponsorErr("Failed to read file");
      setSponsorUploading(false);
    }
  }

  async function removeSponsor(sponsorId: string) {
    setSponsorRemoving(sponsorId);
    setSponsorErr(null);
    try {
      const res = await fetch(`/api/party/${code}/sponsors/remove`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ sponsorId }),
      });

      const data = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string; party?: PublicParty };
      if (!res.ok) {
        setSponsorErr(data.error ?? "Failed to remove sponsor");
        setSponsorRemoving(null);
        return;
      }

      if (data.party) {
        onPartyUpdated(data.party);
      }
      setSponsorRemoving(null);
    } catch (err) {
      setSponsorErr("Network error - please try again");
      console.error("Sponsor removal error:", err);
      setSponsorRemoving(null);
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
              <ThemePicker theme={theme} onApply={onSetTheme} isPro={isPro} />
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

            {isPro ? (
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
            ) : (
            <section className="mt-5 space-y-1 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Scrolling message
                <span className="ml-2 rounded-full bg-brand-600/30 px-2 py-0.5 text-[10px] font-medium text-brand-300">
                  Pro
                </span>
              </h3>
              <p className="text-xs text-white/40">
                Upgrade to show a scrolling message on the TV view.
              </p>
            </section>
            )}

            {isPro ? (
            <section className="mt-5 space-y-3 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Bumper videos
                {(bumperCount ?? 0) > 0 ? (
                  <span className="ml-1 font-normal text-white/40">
                    ({bumperCount})
                  </span>
                ) : null}
              </h3>
              <p className="text-xs text-white/50">
                Short clips that play between songs — intros, hype reels,
                funny clips. Add a YouTube link and choose when it plays.
              </p>

              {/* Add bumper form */}
              <div className="space-y-2 rounded-lg bg-white/5 p-3">
                <input
                  value={bumperUrl}
                  onChange={(e) => setBumperUrl(e.target.value)}
                  placeholder="Paste a YouTube link"
                  className="input w-full text-sm"
                />
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-white/50">Plays:</span>
                  <button
                    type="button"
                    className={
                      "rounded-full px-3 py-1 text-xs font-medium transition " +
                      (bumperTrigger === "random"
                        ? "bg-brand-600 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/20")
                    }
                    onClick={() => setBumperTrigger("random")}
                  >
                    Randomly
                  </button>
                  <button
                    type="button"
                    className={
                      "rounded-full px-3 py-1 text-xs font-medium transition " +
                      (bumperTrigger === "match"
                        ? "bg-brand-600 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/20")
                    }
                    onClick={() => setBumperTrigger("match")}
                  >
                    Before matching songs
                  </button>
                </div>
                {bumperTrigger === "match" ? (
                  <div ref={matchWrapRef} className="relative">
                    <div className="flex items-center gap-2">
                      <input
                        value={matchQuery}
                        onChange={(e) => {
                          setMatchQuery(e.target.value);
                          setBumperMatch(e.target.value);
                        }}
                        onFocus={() => setMatchFocused(true)}
                        placeholder="Search for an artist or song..."
                        className="input w-full text-sm"
                        autoComplete="off"
                      />
                    </div>
                    {bumperMatch && bumperMatch !== matchQuery ? (
                      <p className="mt-1 text-[10px] text-brand-300">
                        Matching: &quot;{bumperMatch}&quot;
                      </p>
                    ) : null}
                    {matchFocused && (matchLoading || matchResults.length > 0) ? (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-white/10 bg-[#0c0718]/95 p-1 shadow-xl backdrop-blur">
                        {matchLoading ? (
                          <p className="px-2 py-1 text-xs text-white/50">Searching...</p>
                        ) : null}
                        {matchResults.map((r, i) => (
                          <button
                            key={i}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-white/10"
                            onClick={() => {
                              setBumperMatch(r.channelTitle);
                              setMatchQuery(r.channelTitle);
                              setMatchFocused(false);
                              setMatchResults([]);
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={r.thumbnail}
                              alt=""
                              className="h-8 w-14 flex-shrink-0 rounded object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-white/90">
                                {r.title}
                              </p>
                              <p className="truncate text-[10px] text-white/50">
                                {r.channelTitle}
                              </p>
                            </div>
                            <span className="flex-shrink-0 rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                              Use &quot;{r.channelTitle}&quot;
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex items-center justify-between">
                  <div>
                    {bumperFlash ? (
                      <span className="text-xs text-emerald-300">Added!</span>
                    ) : null}
                    {bumperErr ? (
                      <span className="text-xs text-red-400">{bumperErr}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn-primary !px-3 !py-1.5 text-sm"
                    disabled={bumperBusy || !bumperUrl.trim()}
                    onClick={addBumper}
                  >
                    {bumperBusy ? "Adding…" : "Add bumper"}
                  </button>
                </div>
              </div>

              {/* Bumper list */}
              {bumpersLoaded && bumpers.length > 0 ? (
                <div className="space-y-1">
                  {bumpers.map((b) => (
                    <div
                      key={b.videoId}
                      className="flex items-center gap-2 rounded-lg bg-white/5 p-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={b.thumbnail}
                        alt=""
                        className="h-9 w-16 flex-shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-white/90">
                          {b.title}
                        </p>
                        <p className="text-[10px] text-white/40">
                          {b.triggerType === "match" && b.triggerMatch
                            ? `Before "${b.triggerMatch}"`
                            : "Random (~30%)"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="flex-shrink-0 rounded px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-red-400"
                        disabled={removingId === b.videoId}
                        onClick={() => removeBumper(b.videoId)}
                        title="Remove bumper"
                      >
                        {removingId === b.videoId ? "…" : "✕"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : bumpersLoaded && bumpers.length === 0 ? (
                <p className="text-xs text-white/30">No bumpers yet.</p>
              ) : null}
            </section>
            ) : (
            <section className="mt-5 space-y-1 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Bumper videos
                <span className="ml-2 rounded-full bg-brand-600/30 px-2 py-0.5 text-[10px] font-medium text-brand-300">
                  Pro
                </span>
              </h3>
              <p className="text-xs text-white/40">
                Upgrade to add short clips that play between songs.
              </p>
            </section>
            )}

            {isPro ? (
            <section className="mt-5 space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Sponsors
              </h3>
              <p className="text-xs text-white/50">
                Upload logos that rotate on the party display screen.
              </p>
              {sponsorErr && <p className="text-xs text-red-400">{sponsorErr}</p>}
              <button
                type="button"
                onClick={() => sponsorFileRef.current?.click()}
                disabled={sponsorUploading || (party.sponsors?.length ?? 0) >= 10}
                className="btn-primary w-full !py-2 text-sm"
              >
                {sponsorUploading ? "Uploading…" : "Upload logo"}
              </button>
              <input
                ref={sponsorFileRef}
                type="file"
                accept="image/*"
                onChange={handleSponsorFileSelect}
                className="hidden"
              />
              <p className="text-xs text-white/40">
                {(party.sponsors?.length ?? 0)}/10 sponsors
              </p>
              {(party.sponsors?.length ?? 0) > 0 ? (
                <ul className="space-y-2 mt-2">
                  {party.sponsors!.map((sponsor) => (
                    <li
                      key={sponsor.id}
                      className="flex items-center gap-2 rounded bg-white/5 p-2"
                    >
                      <img
                        src={sponsor.imageUrl}
                        alt={sponsor.title || "Sponsor"}
                        className="h-8 w-auto flex-shrink-0 rounded"
                      />
                      <div className="min-w-0 flex-1 text-xs text-white/70 truncate">
                        {sponsor.title || "Sponsor"}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSponsor(sponsor.id)}
                        disabled={sponsorRemoving === sponsor.id}
                        className="rounded bg-white/10 px-2 py-1 text-white/70 hover:bg-red-600/60 hover:text-white text-xs"
                      >
                        {sponsorRemoving === sponsor.id ? "…" : "✕"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            ) : (
            <section className="mt-5 space-y-1 border-t border-white/10 pt-4">
              <h3 className="text-sm font-semibold text-white/80">
                Sponsors
                <span className="ml-2 rounded-full bg-brand-600/30 px-2 py-0.5 text-[10px] font-medium text-brand-300">
                  Pro
                </span>
              </h3>
              <p className="text-xs text-white/40">
                Upgrade to display rotating sponsor logos on the party screen.
              </p>
            </section>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
