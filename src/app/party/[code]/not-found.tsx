import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl font-bold">Party not found</h1>
      <p className="mt-3 text-white/60">
        The code didn&apos;t match any active party. Parties live in memory on
        the server for now and can disappear on cold starts — ask your host for
        a fresh code.
      </p>
      <Link href="/" className="btn-primary mt-6 inline-flex">
        Back home
      </Link>
    </main>
  );
}
