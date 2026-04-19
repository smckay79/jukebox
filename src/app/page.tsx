import Link from "next/link";
import JoinForm from "@/components/JoinForm";
import CreatePartyForm from "@/components/CreatePartyForm";
import UserMenu from "@/components/UserMenu";
import RandomBackground from "@/components/RandomBackground";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function Home() {
  const user = await getSessionUser();
  const showAdmin = user && isAdminEmail(user.email);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <RandomBackground />
      {/* Mobile header: sign-in row first, then centered logo */}
      <header className="mb-10">
        <div className="flex items-center justify-end gap-3 md:hidden mb-3">
          {showAdmin && (
            <Link
              href="/admin"
              className="text-sm text-white/40 hover:text-white/70"
            >
              Admin
            </Link>
          )}
          <UserMenu nextPath="/" />
        </div>
        <div className="flex items-center justify-center md:justify-between">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-web.png"
              alt="VideoJam"
              className="w-[260px] md:w-[500px]"
            />
          </Link>
          {/* Desktop-only sign-in */}
          <div className="hidden md:flex items-center gap-3">
            {showAdmin && (
              <Link
                href="/admin"
                className="text-sm text-white/40 hover:text-white/70"
              >
                Admin
              </Link>
            )}
            <UserMenu nextPath="/" />
          </div>
        </div>
      </header>

      <section className="mb-12 text-center md:text-left">
        <h1 className="text-4xl font-bold leading-tight md:text-6xl">
          Where Everybody
          <br />
          <span className="bg-gradient-to-r from-brand-400 to-pink-400 bg-clip-text text-transparent">
            Is The VJ!
          </span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/70 mx-auto md:mx-0">
          Start a party, share the QR code, and let anyone in the room queue up
          YouTube videos. Upvote the bangers. The host can skip or yank songs.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-2 text-xl font-semibold">Start a party</h2>
          <p className="mb-4 text-sm text-white/60">
            You&apos;ll get a private code to share and admin controls to skip
            or remove tracks. Sign in for a free 7-day Pro trial.
          </p>
          <CreatePartyForm />
        </div>

        <div className="card p-6">
          <h2 className="mb-2 text-xl font-semibold">Join a party</h2>
          <p className="mb-4 text-sm text-white/60">
            Got a code from a friend? Drop it here.
          </p>
          <JoinForm />
        </div>
      </div>

      <section className="mt-16">
        <h2 className="mb-6 text-center text-2xl font-bold">
          Free to start, Pro when you&apos;re ready
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="card space-y-4 p-6">
            <div>
              <h3 className="text-lg font-bold">Free</h3>
              <p className="text-3xl font-bold">
                $0
                <span className="text-base font-normal text-white/50">/mo</span>
              </p>
            </div>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-white/30">—</span>
                Create parties
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-white/30">—</span>
                Search &amp; add songs
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-white/30">—</span>
                1-hour party limit
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-white/30">—</span>
                Basic backgrounds
              </li>
            </ul>
          </div>

          <div className="card relative space-y-4 border border-brand-500/30 bg-gradient-to-br from-brand-900/30 to-brand-800/10 p-6">
            <div className="absolute -top-3 right-4 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold">
              Introductory pricing
            </div>
            <div>
              <h3 className="text-lg font-bold">Pro</h3>
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
            </div>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                Unlimited party time
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                Saved playlists &amp; pre-load parties
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                Import YouTube playlists
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                Bumper videos between songs
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                Queue upvoting
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                Custom backgrounds &amp; logos
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                Scrolling marquee messages
              </li>
            </ul>
          </div>

          <div className="card relative space-y-4 border border-emerald-500/30 bg-gradient-to-br from-emerald-900/20 to-emerald-800/10 p-6">
            <div className="absolute -top-3 right-4 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold">
              Best value
            </div>
            <div>
              <h3 className="text-lg font-bold">Lifetime</h3>
              <p className="text-3xl font-bold">
                $74.99
                <span className="text-base font-normal text-white/50">
                  {" "}one-time
                </span>
              </p>
              <p className="mt-1 text-xs text-white/40">
                Pay once, party forever
              </p>
            </div>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-400">✓</span>
                Everything in Pro
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-400">✓</span>
                No recurring payments
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-400">✓</span>
                All future updates included
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="mb-6 text-center text-2xl font-bold">
          Play on any screen
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card flex flex-col items-center gap-3 p-6 text-center">
            <span className="text-3xl">📺</span>
            <div>
              <p className="font-semibold">Android TV &amp; Fire TV</p>
              <p className="mt-1 text-xs text-white/50">
                Sideload the native VideoJam Player app on Fire TV Stick, Chromecast, or any Android TV device.
              </p>
            </div>
            <Link
              href="/download"
              className="mt-auto rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500"
            >
              Get the TV app
            </Link>
          </div>
          <div className="card flex flex-col items-center gap-3 p-6 text-center">
            <span className="text-3xl">🍎</span>
            <div>
              <p className="font-semibold">iPhone &amp; iPad</p>
              <p className="mt-1 text-xs text-white/50">
                Add VideoJam to your Home Screen for a full-screen app experience — no App Store needed.
              </p>
            </div>
            <Link
              href="/download#ios"
              className="mt-auto rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
            >
              Install instructions
            </Link>
          </div>
          <div className="card flex flex-col items-center gap-3 p-6 text-center">
            <span className="text-3xl">🖥️</span>
            <div>
              <p className="font-semibold">Desktop &amp; Laptop</p>
              <p className="mt-1 text-xs text-white/50">
                Use TV Mode to fullscreen the player and AirPlay or cast it to any screen.
              </p>
            </div>
            <span className="mt-auto rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-white/40">
              Just open VideoJam in your browser
            </span>
          </div>
        </div>
      </section>

      <footer className="mt-16 text-center text-sm text-white/40">
        <p>VideoJam · Where Everybody Is The VJ!</p>
      </footer>
    </main>
  );
}
