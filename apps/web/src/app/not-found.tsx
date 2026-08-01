import Link from "next/link";

export default function NotFound() {
  return (
    <section aria-labelledby="not-found-title" className="max-w-2xl space-y-4">
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">404</p>
      <h1 className="text-2xl font-semibold text-[var(--foreground)]" id="not-found-title">
        Page not found
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        This address is not part of the Lumina foundation yet.
      </p>
      <Link
        className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
        href="/"
      >
        Return to the Lumina foundation home page
      </Link>
    </section>
  );
}
