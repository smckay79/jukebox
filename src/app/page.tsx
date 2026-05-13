import Link from "next/link";
import RandomBackground from "@/components/RandomBackground";
import LandingForm from "@/components/LandingForm";
import CreatePartyForm from "@/components/CreatePartyForm";
import UserMenu from "@/components/UserMenu";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export default async function Home() {
  const user = await getSessionUser();
  const showAdmin = user && isAdminEmail(user.email);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <RandomBackground />

      <div className="mb-4 flex items-center justify-between">
        {showAdmin && (
          <Link
            href="/admin"
            className="text-sm text-white/40 hover:text-white/70"
          >
            Admin
          </Link>
        )}
        {!showAdmin && <div />}
        <UserMenu nextPath="/" />
      </div>

      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-web.png"
          alt="VideoJam"
          className="w-[90%] md:w-[500px]"
        />
      </div>

      {!user && (
        <>
          <section className="mt-8 text-center">
            <h1 className="text-3xl font-bold leading-tight md:text-5xl">
              Coming Soon
            </h1>
            <p className="mt-1 text-lg font-medium bg-gradient-to-r from-brand-400 to-pink-400 bg-clip-text text-transparent">
              Where Everybody Is The VJ!
            </p>
          </section>

          <section className="mt-8 space-y-4">
            {/* 1 — QR / Phone */}
            <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex-shrink-0 rounded-lg bg-brand-600/20 p-3 text-brand-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
                  <path fillRule="evenodd" d="M3 4.875C3 3.839 3.84 3 4.875 3h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 0 1 3 9.375v-4.5Zm4.5 0h-2.25v2.25H7.5V4.875Zm-4.5 9.75C3 13.589 3.84 12.75 4.875 12.75h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 0 1 3 19.125v-4.5Zm4.5 0h-2.25v2.25H7.5v-2.25Zm8.625-9.75c0-1.036.84-1.875 1.875-1.875h4.5C21.16 3 22 3.84 22 4.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5a1.875 1.875 0 0 1-1.875-1.875v-4.5Zm4.5 0H18v2.25h2.625V4.875ZM12.75 12.75a.75.75 0 0 1 .75.75v.75h.75a.75.75 0 0 1 0 1.5h-.75v3a.75.75 0 0 1-1.5 0v-3h-.75a.75.75 0 0 1 0-1.5h.75v-.75a.75.75 0 0 1 .75-.75Zm3 2.25a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-3Zm1.5.75v1.5H18.75v-1.5h-1.5Z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm leading-relaxed text-white/80 md:text-base">
                <strong className="text-white">VideoJam</strong> is the party app
                that finally kills the aux cord argument &mdash; a collaborative
                YouTube jukebox where the host spins up a room in seconds, shares a
                QR code, and everyone at the party gets a say in what plays next.
              </p>
            </div>

            {/* 2 — Guests / People */}
            <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex-shrink-0 rounded-lg bg-pink-600/20 p-3 text-pink-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
                  <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  <path fillRule="evenodd" d="M3.087 9a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .53.22l.5.5.5-.5a.75.75 0 0 1 .53-.22h1.5a.75.75 0 0 1 0 1.5h-1.19l-.81.81a.75.75 0 0 1-1.06 0l-.81-.81H3.837a.75.75 0 0 1-.75-.75Zm14.25 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.19l-.81.81a.75.75 0 0 1-1.06 0l-.81-.81h-1.19a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .53.22l.5.5.28-.28Z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm leading-relaxed text-white/80 md:text-base">
                <strong className="text-white">Guests</strong> jump in from their
                phones to search, queue, and upvote their favorites straight to the
                big screen, while the host keeps control with the ability to skip or
                drop tracks they&apos;re not feeling.
              </p>
            </div>

            {/* 3 — No sign-up */}
            <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex-shrink-0 rounded-lg bg-emerald-600/20 p-3 text-emerald-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
                  <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm leading-relaxed text-white/80 md:text-base">
                <strong className="text-white">No sign-up, no fuss</strong> &mdash;
                just scan and start jamming.
              </p>
            </div>

            {/* 4 — Any occasion */}
            <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex-shrink-0 rounded-lg bg-amber-600/20 p-3 text-amber-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
                  <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
                </svg>
              </div>
              <p className="text-sm leading-relaxed text-white/80 md:text-base">
                <strong className="text-white">Whether</strong> it&apos;s a house
                party, a backyard barbecue, a bar night, or a wedding,{" "}
                <strong className="text-white">VideoJam</strong> turns any screen
                into a crowd-powered music video stage where the playlist belongs to
                everyone in the room.
              </p>
            </div>
          </section>
        </>
      )}

      <section className="mt-10 space-y-8">
        {user ? (
          <div className="card p-6">
            <h2 className="mb-2 text-xl font-semibold">Start a party</h2>
            <p className="mb-4 text-sm text-white/60">
              Create a room and share the QR code with your guests.
            </p>
            <CreatePartyForm />
          </div>
        ) : null}
        <LandingForm isLoggedIn={!!user} />
      </section>

      <footer className="mt-16 text-center text-sm text-white/40">
        <p>VideoJam &middot; Where Everybody Is The VJ!</p>
      </footer>
    </main>
  );
}
