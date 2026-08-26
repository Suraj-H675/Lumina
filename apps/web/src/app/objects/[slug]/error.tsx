"use client";

import { useEffect } from "react";

export default function ObjectRouteError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section aria-labelledby="object-error-title" className="mx-auto max-w-2xl space-y-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" id="object-error-title">
        This page could not be loaded
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        Something went wrong while opening this object. No diagnostic detail is exposed here.
      </p>
      <button
        className="inline-flex min-h-11 items-center rounded-sm border border-[var(--border-strong)] bg-[var(--surface)] px-4 font-medium text-[var(--foreground)]"
        onClick={() => reset()}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
