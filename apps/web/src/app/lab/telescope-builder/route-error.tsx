"use client";

type TelescopeBuilderErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function TelescopeBuilderError({ error, reset }: TelescopeBuilderErrorProps) {
  void error;

  return (
    <section
      aria-labelledby="telescope-builder-route-error-heading"
      className="max-w-2xl space-y-4"
      role="alert"
    >
      <h1 className="text-2xl font-semibold" id="telescope-builder-route-error-heading">
        Telescope Builder could not load
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        The reviewed model was not available for this request. Try again; no scientific fallback
        data was substituted.
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
