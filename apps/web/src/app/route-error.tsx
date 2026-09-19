"use client";

type RouteErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function RouteError({ error, reset }: RouteErrorProps) {
  void error;

  return (
    <section aria-labelledby="route-error-title" className="max-w-2xl space-y-4" role="alert">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]" id="route-error-title">
        This part of Lumina could not load
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        Try again. If the problem continues, return to the foundation home page.
      </p>
      <button
        className="min-h-11 border border-[var(--border-strong)] bg-[var(--surface)] px-4 font-medium text-[var(--foreground)]"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
