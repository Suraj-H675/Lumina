export default function Loading() {
  return (
    <section aria-labelledby="loading-title" className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]" id="loading-title">
        Preparing Lumina
      </h1>
      <p className="leading-7 text-[var(--muted)]" role="status">
        The foundation page is loading. Please wait a moment.
      </p>
    </section>
  );
}
