import Link from "next/link";

import type { FoundationStatus } from "../../lib/server/foundation-status";

const statusCopy = {
  "available-unconfirmed": {
    heading: "API available, readiness unconfirmed",
    detail:
      "The API answered at least one request, but this page could not confirm both process and dependency readiness.",
  },
  "not-ready": {
    heading: "API available, dependency not ready",
    detail:
      "The API returned a not-ready response. The foundation remains usable, but its required dependency is not ready.",
  },
  ready: {
    heading: "API available and ready",
    detail: "The API process and its required database dependency both report ready.",
  },
  unavailable: {
    heading: "API unavailable",
    detail:
      "This page could not reach the API within its bounded requests. The Lumina foundation page remains available.",
  },
} as const;

export function StatusView({ status }: Readonly<{ status: FoundationStatus }>) {
  const copy = statusCopy[status.kind];
  return (
    <article className="max-w-3xl space-y-10">
      <section aria-labelledby="status-title" className="space-y-6">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
          Foundation status
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl"
          id="status-title"
        >
          Lumina API status
        </h1>
        <div
          aria-labelledby="api-status-heading"
          className="space-y-3 border-l-4 border-[var(--accent)] pl-4"
          role="status"
        >
          <h2 className="text-2xl font-semibold" id="api-status-heading">
            {copy.heading}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{copy.detail}</p>
        </div>
      </section>

      {status.meta === null ? null : (
        <section aria-labelledby="contract-heading" className="space-y-4">
          <h2 className="text-xl font-semibold" id="contract-heading">
            Reported contract
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-medium">Application version</dt>
              <dd className="text-[var(--muted)]">{status.meta.application_version}</dd>
            </div>
            <div>
              <dt className="font-medium">API version</dt>
              <dd className="text-[var(--muted)]">{status.meta.api_version}</dd>
            </div>
          </dl>
        </section>
      )}

      <p>
        <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/">
          Return to the Lumina foundation home page
        </Link>
      </p>
    </article>
  );
}
