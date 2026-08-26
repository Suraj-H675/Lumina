import Link from "next/link";

/**
 * Public not-found experience for unknown catalogue slugs. Raw API error
 * bodies never surface here.
 */
export function ObjectNotFoundView({ slug }: Readonly<{ slug: string }>) {
  return (
    <section aria-labelledby="object-not-found-title" className="mx-auto max-w-2xl space-y-6 py-10">
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">404</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" id="object-not-found-title">
        Object not found
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        Lumina has no catalogue object at <span className="font-mono">/objects/{slug}</span>. It may
        be added later as reviewed data grows — try searching instead.
      </p>
      <Link
        className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
        href="/explore"
      >
        Browse the catalogue
      </Link>
    </section>
  );
}
