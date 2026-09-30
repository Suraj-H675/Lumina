import Link from "next/link";

import { formatMessageTemplate } from "../../lib/i18n/format";
import type { StatusMessages } from "../../lib/i18n/messages/types";
import type { ApiStatus, ProviderStatus } from "../../lib/server/api-status";
import styles from "../../components/trust-surfaces.module.css";

export function StatusView({
  messages,
  status,
}: Readonly<{ messages: StatusMessages; status: ApiStatus }>) {
  const copy = statusStateMessages(status.kind, messages);
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title} id="status-title">
            {messages.title}
          </h1>
        </div>
        <div aria-labelledby="api-status-heading" className={styles.statusLead} role="status">
          <h2 className={styles.statusHeading} id="api-status-heading">
            {copy.heading}
          </h2>
          <p className={styles.statusDetail}>{copy.detail}</p>
        </div>
      </header>

      {status.meta === null ? null : (
        <section aria-labelledby="contract-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle} id="contract-heading">
              {messages.contract.heading}
            </h2>
          </div>
          <dl className={styles.contract}>
            <div>
              <dt>{messages.contract.applicationVersionLabel}</dt>
              <dd>{status.meta.application_version}</dd>
            </div>
            <div>
              <dt>{messages.contract.apiVersionLabel}</dt>
              <dd>{status.meta.api_version}</dd>
            </div>
          </dl>
        </section>
      )}

      <ProviderStatusSection messages={messages} provider={status.provider} />

      <Link className={styles.returnLink} href="/">
        {messages.returnHome}
      </Link>
    </article>
  );
}

function ProviderStatusSection({
  messages,
  provider,
}: Readonly<{ messages: StatusMessages; provider: ProviderStatus }>) {
  return (
    <section aria-labelledby="provider-status-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="provider-status-heading">
          {messages.provider.heading}
        </h2>
      </div>
      {provider.kind === "unavailable" ? (
        <p className={styles.providerUnavailable}>{messages.provider.unavailable}</p>
      ) : (
        <div className={styles.providerList}>
          {provider.data.providers.map((entry) => (
            <article className={styles.provider} key={entry.provider_code}>
              <h3 className={styles.providerTitle}>{entry.source_name}</h3>
              <div className={styles.providerBody}>
                <p className={styles.providerAttribution}>{entry.attribution_text}</p>
                <p className={styles.providerLinks}>
                  <a
                    className={`${styles.link} min-h-11`}
                    href={entry.official_documentation_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {messages.provider.officialDocumentation}
                  </a>
                  <a
                    className={`${styles.link} min-h-11`}
                    href={entry.terms_or_licence_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {messages.provider.acknowledgmentAndUsage}
                  </a>
                </p>
                <dl className={styles.statusGrid}>
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
                <div className={styles.counterBlock}>
                  <h4 className={styles.counterTitle}>{messages.provider.counters.heading}</h4>
                  <dl className={styles.counterGrid}>
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
    <div className={styles.statusField}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TimestampField({
  label,
  messages,
  value,
}: Readonly<{ label: string; messages: StatusMessages; value: string | null }>) {
  return (
    <div className={styles.statusField}>
      <dt>{label}</dt>
      <dd>
        {value === null ? messages.provider.notRecorded : <time dateTime={value}>{value}</time>}
      </dd>
    </div>
  );
}

function statusStateMessages(kind: ApiStatus["kind"], messages: StatusMessages) {
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
