"use client";

type LearningErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function LearningError({ reset }: LearningErrorProps) {
  return (
    <section aria-labelledby="learning-error-heading" className="max-w-2xl space-y-4" role="alert">
      <h1 id="learning-error-heading">The learning path could not load</h1>
      <p className="leading-7 text-[var(--muted)]">
        The authored learning content is temporarily unavailable. Nothing was changed in your local
        progress.
      </p>
      <button
        className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
