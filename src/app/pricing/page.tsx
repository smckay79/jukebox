import Link from "next/link";

export const metadata = { title: "Jukebox Pro — Pricing" };

const FREE_FEATURES = [
  "Create parties",
  "Search & add songs",
  "1-hour party limit",
  "Basic backgrounds",
];

const PRO_FEATURES = [
  "Unlimited party time",
  "Saved playlists & pre-load parties",
  "Import YouTube playlists",
  "Bumper videos between songs",
  "Queue upvoting",
  "Custom backgrounds & logos",
  "Scrolling marquee messages",
  "Custom party codes (coming soon)",
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-4">
        <Link
          href="/"
          className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
        >
          Jukebox
        </Link>
      </div>
      <h1 className="mb-2 text-3xl font-bold">Pick your plan</h1>
      <p className="mb-10 text-white/60">
        Start with a free 30-day trial of everything. After that, upgrade to
        keep the party going.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Free tier */}
        <div className="card space-y-4 p-6">
          <div>
            <h2 className="text-lg font-bold">Free</h2>
            <p className="text-3xl font-bold">
              $0<span className="text-base font-normal text-white/50">/mo</span>
            </p>
          </div>
          <ul className="space-y-2 text-sm text-white/70">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-white/30">—</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro tier */}
        <div className="card relative space-y-4 border border-brand-500/30 bg-gradient-to-br from-brand-900/30 to-brand-800/10 p-6">
          <div className="absolute -top-3 right-4 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold">
            Recommended
          </div>
          <div>
            <h2 className="text-lg font-bold">Pro</h2>
            <div className="mt-1 flex items-baseline gap-4">
              <div>
                <p className="text-3xl font-bold">
                  $4.99
                  <span className="text-base font-normal text-white/50">
                    /mo
                  </span>
                </p>
              </div>
              <div className="border-l border-white/10 pl-4">
                <p className="text-3xl font-bold">
                  $39.99
                  <span className="text-base font-normal text-white/50">
                    /yr
                  </span>
                </p>
                <p className="text-xs text-emerald-400">Save 33%</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/40">
              30-day free trial included
            </p>
          </div>
          <ul className="space-y-2 text-sm text-white/70">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button
            className="btn-primary w-full text-center"
            disabled
          >
            Coming soon
          </button>
          <p className="text-center text-xs text-white/40">
            Payment processing is being set up. In the meantime, contact us
            for early access.
          </p>
        </div>
      </div>
    </main>
  );
}
