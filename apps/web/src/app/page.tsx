import Link from "next/link";

export default function HomePage() {
  return (
    <article className="space-y-12">
      <section aria-labelledby="foundation-title" className="max-w-3xl space-y-6">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
          Foundation status
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl"
          id="foundation-title"
        >
          Lumina is under construction
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Lumina is being built as a free, visual, scientifically grounded place to explore,
          understand, observe, and experiment with space. Its first public capability is live: a
          small, provenance-first astronomical catalogue you can search and open right now.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/explore"
          >
            Explore the catalogue
          </Link>
          <Link
            className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
            href="/status"
          >
            Check the API foundation status
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="about-heading"
        className="max-w-3xl space-y-4 border-t border-[var(--border)] pt-8"
        id="about"
      >
        <h2
          className="text-2xl font-semibold tracking-tight text-[var(--foreground)]"
          id="about-heading"
        >
          About Lumina
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          The intended project will connect visual exploration, authored learning, deterministic
          simulations, real-sky observation, and personal progress. Each future capability will be
          introduced only when its data, assumptions, and limitations can be presented honestly.
        </p>
      </section>
    </article>
  );
}
