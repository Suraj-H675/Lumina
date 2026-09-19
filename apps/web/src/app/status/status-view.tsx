import Link from "next/link";

import { formatMessageTemplate } from "../../lib/i18n/format";
import type { StatusMessages } from "../../lib/i18n/messages/types";
import type { FoundationStatus, ProviderStatus } from "../../lib/server/foundation-status";

export function StatusView({
  messages,
  status,
}: Readonly<{ messages: StatusMessages; status: FoundationStatus }>) {
  const copy = statusStateMessages(status.kind, messages);
  return (
    <article className="max-w-3xl space-y-10">
      <section aria-labelledby="status-title" className="space-y-6">
        <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl"
          id="status-title"
        >
          {messages.title}
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
            {messages.contract.heading}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-medium">{messages.contract.applicationVersionLabel}</dt>
              <dd className="text-[var(--muted)]">{status.meta.application_version}</dd>
            </div>
            <div>
              <dt className="font-medium">{messages.contract.apiVersionLabel}</dt>
              <dd className="text-[var(--muted)]">{status.meta.api_version}</dd>
            </div>
          </dl>
        </section>
      )}

      <ProviderStatusSection messages={messages} provider={status.provider} />

      <p>
        <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/">
          {messages.returnHome}
        </Link>
      </p>
    </article>
  );
}

function ProviderStatusSection({
  messages,
  provider,
}: Readonly<{ messages: StatusMessages; provider: ProviderStatus }>) {
  return (
    <section aria-labelledby="provider-status-heading" className="space-y-4">
      <h2 className="text-xl font-semibold" id="provider-status-heading">
        {messages.provider.heading}
      </h2>
      {provider.kind === "unavailable" ? (
        <p className="leading-7 text-[var(--muted)]">{messages.provider.unavailable}</p>
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
                  {messages.provider.officialDocumentation}
                </a>
                <a
                  className="inline-flex min-h-11 items-center text-[var(--link)] underline"
                  href={entry.terms_or_licence_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {messages.provider.acknowledgmentAndUsage}
                </a>
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <StatusField
                  label={messages.provider.labels.providerCode}
                  value={entry.provider_code}
                />
                <StatusField
                  label={messages.provider.labels.providerState}
                  value={
                    entry.enabled
                      ? messages.provider.state.enabled
                      : messages.provider.state.disabled
                  }
                />
                <StatusField
                  label={messages.provider.labels.circuit}
                  value={circuitLabel(entry.circuit_state, messages)}
                />
                <StatusField
                  label={messages.provider.labels.cacheState}
                  value={cacheLabel(entry, messages)}
                />
                <TimestampField
                  label={messages.provider.labels.lastSuccessfulRefresh}
                  messages={messages}
                  value={entry.last_success_at}
                />
                <TimestampField
                  label={messages.provider.labels.acceptedSnapshotFetched}
                  messages={messages}
                  value={entry.cache_fetched_at}
                />
                <TimestampField
                  label={messages.provider.labels.freshUntil}
                  messages={messages}
                  value={entry.cache_fresh_until}
                />
                <TimestampField
                  label={messages.provider.labels.staleUntil}
                  messages={messages}
                  value={entry.cache_stale_until}
                />
                <TimestampField
                  label={messages.provider.labels.nextPlannedAttempt}
                  messages={messages}
                  value={entry.next_sync_at}
                />
                <TimestampField
                  label={messages.provider.labels.nextCircuitProbe}
                  messages={messages}
                  value={entry.next_probe_at}
                />
                <StatusField
                  label={messages.provider.labels.lastRefreshFailure}
                  value={entry.last_failure_code ?? messages.provider.noneRecorded}
                />
                <StatusField
                  label={messages.provider.labels.syncLease}
                  value={
                    entry.sync_lease_active
                      ? messages.provider.lease.active
                      : messages.provider.lease.notActive
                  }
                />
              </dl>
              <div>
                <h4 className="font-medium">{messages.provider.counters.heading}</h4>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <StatusField
                    label={messages.provider.counters.cyclesStarted}
                    value={String(entry.metrics.sync_cycles_started)}
                  />
                  <StatusField
                    label={messages.provider.counters.successfulCycles}
                    value={String(entry.metrics.sync_successes)}
                  />
                  <StatusField
                    label={messages.provider.counters.upstreamFailures}
                    value={String(entry.metrics.sync_upstream_failures)}
                  />
                  <StatusField
                    label={messages.provider.counters.httpRequests}
                    value={String(entry.metrics.http_requests)}
                  />
                  <StatusField
                    label={messages.provider.counters.httpRetries}
                    value={String(entry.metrics.http_retries)}
                  />
                  <StatusField
                    label={messages.provider.counters.schemaFailures}
                    value={String(entry.metrics.schema_failures)}
                  />
                  <StatusField
                    label={messages.provider.counters.quarantines}
                    value={String(entry.metrics.quarantines)}
                  />
                  <StatusField
                    label={messages.provider.counters.staleFallbacks}
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

function TimestampField({
  label,
  messages,
  value,
}: Readonly<{ label: string; messages: StatusMessages; value: string | null }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">
        {value === null ? messages.provider.notRecorded : <time dateTime={value}>{value}</time>}
      </dd>
    </div>
  );
}

function statusStateMessages(kind: FoundationStatus["kind"], messages: StatusMessages) {
  switch (kind) {
    case "available-unconfirmed":
      return messages.states.availableUnconfirmed;
    case "not-ready":
      return messages.states.notReady;
    case "ready":
      return messages.states.ready;
    case "unavailable":
      return messages.states.unavailable;
  }
}

function circuitLabel(value: "closed" | "open" | "half_open", messages: StatusMessages): string {
  if (value === "half_open") return messages.provider.circuit.halfOpen;
  return value === "closed" ? messages.provider.circuit.closed : messages.provider.circuit.open;
}

function cacheLabel(
  entry: Readonly<{
    cache_active: boolean;
    cache_state: "missing" | "fresh" | "stale" | "expired";
    enabled: boolean;
  }>,
  messages: StatusMessages,
): string {
  const labels = {
    expired: messages.provider.cache.expired,
    fresh: messages.provider.cache.fresh,
    missing: messages.provider.cache.missing,
    stale: messages.provider.cache.stale,
  } as const;
  const label = labels[entry.cache_state];
  if (!entry.enabled && !entry.cache_active && entry.cache_state !== "missing") {
    return formatMessageTemplate(messages.provider.cache.historicalOnlyWhileDisabled, {
      cacheLabel: label,
    });
  }
  return label;
}
