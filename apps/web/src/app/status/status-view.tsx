import Link from "next/link";

import type { FoundationStatus, ProviderStatus } from "../../lib/server/foundation-status";

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

      <ProviderStatusSection provider={status.provider} />

      <p>
        <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/">
          Return to the Lumina foundation home page
        </Link>
      </p>
    </article>
  );
}

function ProviderStatusSection({ provider }: Readonly<{ provider: ProviderStatus }>) {
  return (
    <section aria-labelledby="provider-status-heading" className="space-y-4">
      <h2 className="text-xl font-semibold" id="provider-status-heading">
        Provider status
      </h2>
      {provider.kind === "unavailable" ? (
        <p className="leading-7 text-[var(--muted)]">Provider status unavailable.</p>
      ) : (
        <div className="space-y-6">
          {provider.data.providers.map((entry) => (
            <article
              className="space-y-4 border border-[var(--border)] p-4"
              key={entry.provider_code}
            >
              <h3 className="text-lg font-semibold">{entry.source_name}</h3>
              <p className="leading-7 text-[var(--muted)]">{entry.attribution_text}</p>
              <p className="flex flex-wrap gap-x-4 gap-y-2 leading-7">
                <a
                  className="inline-flex min-h-11 items-center text-[var(--link)] underline"
                  href={entry.official_documentation_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Official documentation
                </a>
                <a
                  className="inline-flex min-h-11 items-center text-[var(--link)] underline"
                  href={entry.terms_or_licence_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Acknowledgment and usage
                </a>
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <StatusField label="Provider code" value={entry.provider_code} />
                <StatusField
                  label="Provider state"
                  value={entry.enabled ? "Enabled" : "Disabled"}
                />
                <StatusField label="Circuit" value={circuitLabel(entry.circuit_state)} />
                <StatusField label="Cache state" value={cacheLabel(entry)} />
                <TimestampField label="Last successful refresh" value={entry.last_success_at} />
                <TimestampField label="Accepted snapshot fetched" value={entry.cache_fetched_at} />
                <TimestampField label="Fresh until" value={entry.cache_fresh_until} />
                <TimestampField label="Stale until" value={entry.cache_stale_until} />
                <TimestampField label="Next planned attempt" value={entry.next_sync_at} />
                <TimestampField label="Next circuit probe" value={entry.next_probe_at} />
                <StatusField
                  label="Last refresh failure"
                  value={entry.last_failure_code ?? "None recorded"}
                />
                <StatusField
                  label="Sync lease"
                  value={entry.sync_lease_active ? "Active" : "Not active"}
                />
              </dl>
              <div>
                <h4 className="font-medium">Durable counters</h4>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <StatusField
                    label="Cycles started"
                    value={String(entry.metrics.sync_cycles_started)}
                  />
                  <StatusField
                    label="Successful cycles"
                    value={String(entry.metrics.sync_successes)}
                  />
                  <StatusField
                    label="Upstream failures"
                    value={String(entry.metrics.sync_upstream_failures)}
                  />
                  <StatusField label="HTTP requests" value={String(entry.metrics.http_requests)} />
                  <StatusField label="HTTP retries" value={String(entry.metrics.http_retries)} />
                  <StatusField
                    label="Schema failures"
                    value={String(entry.metrics.schema_failures)}
                  />
                  <StatusField label="Quarantines" value={String(entry.metrics.quarantines)} />
                  <StatusField
                    label="Stale fallbacks"
                    value={String(entry.metrics.stale_fallbacks)}
                  />
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusField({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{value}</dd>
    </div>
  );
}

function TimestampField({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">
        {value === null ? "Not recorded" : <time dateTime={value}>{value}</time>}
      </dd>
    </div>
  );
}

function circuitLabel(value: "closed" | "open" | "half_open"): string {
  if (value === "half_open") return "Half-open";
  return value === "closed" ? "Closed" : "Open";
}

function cacheLabel(
  entry: Readonly<{
    cache_active: boolean;
    cache_state: "missing" | "fresh" | "stale" | "expired";
    enabled: boolean;
  }>,
): string {
  const labels = {
    missing: "No accepted cache",
    fresh: "Fresh",
    stale: "Stale",
    expired: "Expired",
  } as const;
  const label = labels[entry.cache_state];
  if (!entry.enabled && !entry.cache_active && entry.cache_state !== "missing") {
    return `${label}; historical only while disabled`;
  }
  return label;
}
