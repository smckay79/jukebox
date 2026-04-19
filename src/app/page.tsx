import Link from "next/link";
import RandomBackground from "@/components/RandomBackground";
import LandingForm from "@/components/LandingForm";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function Home() {
  const user = await getSessionUser();
  const showAdmin = user && isAdminEmail(user.email);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <RandomBackground />

      {showAdmin && (
        <div className="mb-4 flex justify-end">
          <Link
            href="/admin"
            className="text-sm text-white/40 hover:text-white/70"
          >
            Admin
          </Link>
        </div>
      )}

      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-web.png"
          alt="VideoJam"
          className="w-[90%] md:w-[500px]"
        />
      </div>

      <section className="mt-8 text-center">
        <h1 className="text-3xl font-bold leading-tight md:text-5xl">
          Coming Soon
        </h1>
        <p className="mt-1 text-lg font-medium bg-gradient-to-r from-brand-400 to-pink-400 bg-clip-text text-transparent">
          Where Everybody Is The VJ!
        </p>
      </section>

      <section className="mt-8">
        <p className="text-sm leading-relaxed text-white/70 md:text-base">
          VideoJam is the party app that finally kills the aux cord argument
          &mdash; a collaborative YouTube jukebox where the host spins up a room
          in seconds, shares a QR code, and everyone at the party gets a say in
          what plays next. Guests jump in from their phones to search, queue, and
          upvote their favorites straight to the big screen, while the host keeps
          control with the ability to skip or drop tracks they&apos;re not
          feeling. No sign-up, no fuss &mdash; just scan and start jamming.
          Whether it&apos;s a house party, a backyard barbecue, a bar night, or
          a wedding, VideoJam turns any screen into a crowd-powered music video
          stage where the playlist belongs to everyone in the room.
        </p>
      </section>

      <section className="mt-10">
        <LandingForm />
      </section>

      <footer className="mt-16 text-center text-sm text-white/40">
        <p>VideoJam &middot; Where Everybody Is The VJ!</p>
      </footer>
    </main>
  );
}
