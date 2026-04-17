import Link from "next/link";
import JoinForm from "@/components/JoinForm";
import CreatePartyForm from "@/components/CreatePartyForm";
import UserMenu from "@/components/UserMenu";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function Home() {
  const user = await getSessionUser();
  const showAdmin = user && isAdminEmail(user.email);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600">
            <span aria-hidden>♪</span>
          </span>
          Jukebox
        </Link>
        <div className="flex items-center gap-3">
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
      </header>

      <section className="mb-12">
        <h1 className="text-4xl font-bold leading-tight md:text-6xl">
          Your party&apos;s{" "}
          <span className="bg-gradient-to-r from-brand-400 to-pink-400 bg-clip-text text-transparent">
            group playlist
          </span>
          , live from YouTube.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/70">
          Start a party, share the QR code, and let anyone in the room queue up
          YouTube videos. Upvote the bangers. The host can skip or yank songs.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-2 text-xl font-semibold">Start a party</h2>
          <p className="mb-4 text-sm text-white/60">
            You&apos;ll get a private code to share and admin controls to skip
            or remove tracks. Sign in for a free 30-day Pro trial.
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
        <div className="grid gap-6 md:grid-cols-2">
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
              30-day free trial
            </div>
            <div>
              <h3 className="text-lg font-bold">Pro</h3>
              <p className="text-3xl font-bold">
                $4.99
                <span className="text-base font-normal text-white/50">
                  /mo
                </span>
              </p>
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
        </div>
      </section>

      <footer className="mt-16 text-center text-sm text-white/40">
        <p>v1 · real-time push &amp; sign-in coming soon. Have fun out there.</p>
      </footer>
    </main>
  );
}
