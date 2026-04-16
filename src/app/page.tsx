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
            or remove tracks. Sign in for unlimited party length.
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

      <footer className="mt-16 text-center text-sm text-white/40">
        <p>v1 · real-time push &amp; sign-in coming soon. Have fun out there.</p>
      </footer>
    </main>
  );
}
