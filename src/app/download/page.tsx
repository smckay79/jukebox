import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download Jukebox Player for Android TV & Fire TV",
  description:
    "Install the Jukebox Player app on your Android TV, Fire TV Stick, or Chromecast with Google TV using the Downloader app.",
};

export default function DownloadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-10 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600">
            <span aria-hidden>♪</span>
          </span>
          Jukebox
        </Link>
        <Link href="/" className="text-sm text-white/40 hover:text-white/70">
          ← Back
        </Link>
      </header>

      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 text-4xl shadow-lg shadow-brand-600/30">
          <span aria-hidden>📺</span>
        </div>
        <h1 className="text-3xl font-bold md:text-5xl">
          Get{" "}
          <span className="bg-gradient-to-r from-brand-400 to-pink-400 bg-clip-text text-transparent">
            Jukebox Player
          </span>{" "}
          on your TV
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
          Turn your Android TV, Fire TV Stick, or Chromecast with Google TV into
          a party jukebox. Install in under 2 minutes using the Downloader app.
        </p>
      </section>

      {/* What you need */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-bold">What you&apos;ll need</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card flex flex-col items-center gap-3 p-5 text-center">
            <span className="text-3xl">📡</span>
            <div>
              <p className="font-semibold">A streaming device</p>
              <p className="text-xs text-white/50">
                Fire TV Stick, Android TV, Chromecast w/ Google TV, or NVIDIA
                Shield
              </p>
            </div>
          </div>
          <div className="card flex flex-col items-center gap-3 p-5 text-center">
            <span className="text-3xl">⬇️</span>
            <div>
              <p className="font-semibold">Downloader app</p>
              <p className="text-xs text-white/50">
                Free app for sideloading — available on Amazon &amp; Google Play
              </p>
            </div>
          </div>
          <div className="card flex flex-col items-center gap-3 p-5 text-center">
            <span className="text-3xl">🔢</span>
            <div>
              <p className="font-semibold">Downloader Code</p>
              <p className="text-xs text-white/50">
                Enter this code in the Downloader app to install Jukebox
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Downloader code callout */}
      <section className="mb-10">
        <div className="card relative overflow-hidden border border-brand-500/30 bg-gradient-to-br from-brand-900/40 to-brand-800/10 p-8 text-center">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-brand-400">
            Downloader Code
          </p>
          <p className="text-6xl font-black tracking-wider text-white md:text-7xl">
            3932241
          </p>
          <p className="mt-3 text-sm text-white/50">
            Enter this code in the Downloader app on your TV
          </p>
        </div>
      </section>

      {/* Step by step */}
      <section className="mb-12">
        <h2 className="mb-6 text-xl font-bold">
          Step-by-step installation
        </h2>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold">
                1
              </span>
              <h3 className="text-lg font-semibold">
                Install the Downloader app
              </h3>
            </div>
            <div className="ml-11 space-y-3 text-sm text-white/70">
              <p>
                <strong className="text-white/90">Fire TV Stick:</strong>{" "}
                Search &quot;Downloader&quot; in the Amazon Appstore, or visit{" "}
                <a
                  href="https://www.amazon.com/dp/B01N0BP507"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 underline decoration-brand-400/30 hover:decoration-brand-400"
                >
                  amazon.com/dp/B01N0BP507
                </a>
              </p>
              <p>
                <strong className="text-white/90">
                  Android TV / Chromecast / Shield:
                </strong>{" "}
                Search &quot;Downloader by AFTVnews&quot; in the Google Play
                Store
              </p>
              <div className="mt-2 flex items-center gap-4">
                <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-lg">🛒</span>
                  <span className="text-xs text-white/50">Amazon Appstore</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-lg">▶️</span>
                  <span className="text-xs text-white/50">Google Play</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold">
                2
              </span>
              <h3 className="text-lg font-semibold">
                Enable &quot;Install unknown apps&quot;
              </h3>
            </div>
            <div className="ml-11 space-y-3 text-sm text-white/70">
              <p>
                <strong className="text-white/90">Fire TV:</strong> Go to{" "}
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
                  Settings → My Fire TV → Developer Options
                </span>{" "}
                → turn on{" "}
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
                  Install unknown apps
                </span>{" "}
                for Downloader
              </p>
              <p>
                <strong className="text-white/90">Android TV:</strong> Go to{" "}
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
                  Settings → Security &amp; restrictions
                </span>{" "}
                → enable{" "}
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
                  Unknown sources
                </span>{" "}
                for Downloader
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold">
                3
              </span>
              <h3 className="text-lg font-semibold">
                Open Downloader and enter the code
              </h3>
            </div>
            <div className="ml-11 space-y-3 text-sm text-white/70">
              <p>
                Open the Downloader app on your TV. You&apos;ll see a field to
                enter a URL or code.
              </p>
              <p>
                Type in the code{" "}
                <span className="rounded bg-brand-600/30 px-2 py-1 font-mono text-base font-bold text-brand-400">
                  3932241
                </span>{" "}
                and press <strong className="text-white/90">Go</strong>.
              </p>
              <p>
                The Jukebox Player APK will download automatically.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold">
                4
              </span>
              <h3 className="text-lg font-semibold">Install &amp; launch</h3>
            </div>
            <div className="ml-11 space-y-3 text-sm text-white/70">
              <p>
                Once the download finishes, tap{" "}
                <strong className="text-white/90">Install</strong> when
                prompted.
              </p>
              <p>
                After installation, open{" "}
                <strong className="text-white/90">Jukebox Player</strong> from
                your apps list. Enter your party code and you&apos;re live!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Supported devices */}
      <section className="mb-12">
        <h2 className="mb-4 text-xl font-bold">Supported devices</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: "🔥", name: "Fire TV Stick" },
            { icon: "🔥", name: "Fire TV Cube" },
            { icon: "📺", name: "Android TV" },
            { icon: "📡", name: "Chromecast w/ Google TV" },
            { icon: "🛡️", name: "NVIDIA Shield" },
            { icon: "📺", name: "Xiaomi Mi Box" },
            { icon: "📺", name: "Sony Smart TV" },
            { icon: "📺", name: "TCL / Hisense" },
          ].map((device) => (
            <div
              key={device.name}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-3"
            >
              <span className="text-lg">{device.icon}</span>
              <span className="text-xs font-medium text-white/70">
                {device.name}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-12">
        <h2 className="mb-4 text-xl font-bold">Troubleshooting</h2>
        <div className="space-y-3">
          <details className="card group cursor-pointer p-4">
            <summary className="flex items-center justify-between font-medium">
              I don&apos;t see &quot;Developer Options&quot; on Fire TV
              <span className="text-white/30 transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <p className="mt-3 text-sm text-white/60">
              Go to{" "}
              <span className="font-mono text-xs">
                Settings → My Fire TV → About
              </span>{" "}
              and click on your device name 7 times. Developer Options will then
              appear in the My Fire TV menu.
            </p>
          </details>
          <details className="card group cursor-pointer p-4">
            <summary className="flex items-center justify-between font-medium">
              The code doesn&apos;t work in Downloader
              <span className="text-white/30 transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <p className="mt-3 text-sm text-white/60">
              Make sure you&apos;re on the Home/Browser tab in Downloader (not
              the Files tab). If the code still doesn&apos;t work, try entering
              the direct URL instead. Contact us for the latest download link.
            </p>
          </details>
          <details className="card group cursor-pointer p-4">
            <summary className="flex items-center justify-between font-medium">
              &quot;App not installed&quot; error
              <span className="text-white/30 transition-transform group-open:rotate-180">
                ▾
              </span>
            </summary>
            <p className="mt-3 text-sm text-white/60">
              Make sure you enabled &quot;Install unknown apps&quot; for the
              Downloader app (Step 2). If you previously installed an older
              version, uninstall it first, then try again.
            </p>
          </details>
        </div>
      </section>

      <footer className="text-center text-sm text-white/40">
        <p>
          Jukebox Player v0.1.0 · Android TV &amp; Fire TV ·{" "}
          <Link href="/" className="underline hover:text-white/60">
            Back to Jukebox
          </Link>
        </p>
      </footer>
    </main>
  );
}
