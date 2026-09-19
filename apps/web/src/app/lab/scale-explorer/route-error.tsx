"use client";

type ScaleExplorerErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function ScaleExplorerError({ error, reset }: ScaleExplorerErrorProps) {
  void error;

  return (
    <section
      aria-labelledby="scale-route-error-heading"
      className="max-w-2xl space-y-4"
      role="alert"
    >
      <h1 className="text-2xl font-semibold" id="scale-route-error-heading">
        Scale Explorer could not load
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        The curated model was not available for this request. Try again; no scientific fallback data
        was substituted.
      </p>
      <button
        className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 font-semibold"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
