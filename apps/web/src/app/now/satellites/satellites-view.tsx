import type { SatelliteItemResponse, SatelliteListResponse } from "@nova-lumina/api-client";
import Link from "next/link";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SatelliteMessages } from "../../../lib/i18n/messages/types";
import {
  CELESTRAK_NAME,
  SATELLITE_STATIONS_GROUP_NAME,
  SATELLITE_VISUAL_GROUP_NAME,
  SGP4_NAME,
} from "../../../lib/space-now/provider-display";
import type { NowSatellitesOutcome } from "../../../lib/server/space-now";
import styles from "../live-data-detail.module.css";
import { SatellitePassFinder } from "./satellite-pass-finder";

const ELEMENT_WARNING_HOURS = 24;
const PREDICTION_WINDOW_HOURS = 24;
const MAXIMUM_ELEMENT_OFFSET_HOURS = 72;

export function SatellitesView({
  locale,
  messages,
  outcome,
}: Readonly<{
  locale: PublishedLocale;
  messages: SatelliteMessages;
  outcome: NowSatellitesOutcome;
}>) {
  if (outcome.kind !== "ok") return <TransportUnavailable messages={messages.transport} />;
  const response = outcome.data;
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <p className={styles.intro}>
          {formatMessageTemplate(messages.intro, {
            propagationModel: SGP4_NAME,
            provider: CELESTRAK_NAME,
            stationsGroup: SATELLITE_STATIONS_GROUP_NAME,
            visualGroup: SATELLITE_VISUAL_GROUP_NAME,
          })}
        </p>
      </header>

      {response.availability === "unavailable" ? (
        <Unavailable messages={messages.unavailable} response={response} />
      ) : (
        <>
          <Freshness messages={messages.snapshot} response={response} />
          <SatellitePassFinder
            locale={locale}
            messages={messages.passFinder}
            satellites={response.satellites}
          />
          <SatelliteList locale={locale} messages={messages.satellites} response={response} />
          <SourceDetails locale={locale} messages={messages.source} response={response} />
        </>
      )}

      <Link className={styles.link} href="/now">
        {messages.backToSpaceNow}
      </Link>
    </article>
  );
}

function Freshness({
  messages,
  response,
}: Readonly<{ messages: SatelliteMessages["snapshot"]; response: SatelliteListResponse }>) {
  return (
    <section
      aria-live="polite"
      className={styles.freshness}
      data-state={response.availability}
      role="status"
    >
      <p className={styles.freshnessTitle}>
        {response.availability === "stale" ? messages.staleTitle : messages.freshTitle}
      </p>
      <div>
        <p className={styles.freshnessCopy}>
          {formatMessageTemplate(messages.summary, {
            latestEpoch:
              response.freshness.snapshot_latest_epoch_utc ?? messages.latestEpochNotRecorded,
            retrievedAt: response.freshness.retrieved_at ?? messages.unrecordedTime,
          })}
        </p>
        {response.freshness.last_refresh_failure_code === null ? null : (
          <p className={styles.freshnessCopy}>
            {formatMessageTemplate(messages.lastFailure, {
              code: response.freshness.last_refresh_failure_code,
            })}
          </p>
        )}
      </div>
    </section>
  );
}

function SatelliteList({
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: SatelliteMessages["satellites"];
  response: SatelliteListResponse;
}>) {
  return (
    <section aria-labelledby="satellite-list-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="satellite-list-heading">
          {messages.heading}
        </h2>
        <p className={styles.sectionDescription}>
          {formatMessageTemplate(messages.count, {
            returned: formatLocaleNumber(response.returned_satellite_count, locale),
            stationsGroup: SATELLITE_STATIONS_GROUP_NAME,
            total: formatLocaleNumber(response.total_satellite_count, locale),
            visualGroup: SATELLITE_VISUAL_GROUP_NAME,
          })}
        </p>
      </div>
      <div className={styles.ruledGrid}>
        {response.satellites.map((satellite) => (
          <SatelliteCard
            key={satellite.catalog_number}
            locale={locale}
            messages={messages}
            satellite={satellite}
          />
        ))}
      </div>
    </section>
  );
}

function SatelliteCard({
  locale,
  messages,
  satellite,
}: Readonly<{
  locale: PublishedLocale;
  messages: SatelliteMessages["satellites"];
  satellite: SatelliteItemResponse;
}>) {
  return (
    <article className={styles.ruledItem}>
      <div>
        <h3 className={styles.cardTitle}>{satellite.name}</h3>
        <p className={styles.cardCopy}>
          {formatMessageTemplate(messages.noradReference, {
            catalogNumber: satellite.catalog_number,
          })}
        </p>
      </div>
      <dl className={styles.definitionList}>
        <Fact label={messages.labels.groups} value={satellite.groups.join(", ")} />
        <Fact label={messages.labels.elementEpoch} value={satellite.element_epoch_utc} />
        <Fact
          label={messages.labels.elementAge}
          value={formatMessageTemplate(messages.elementAgeValue, {
            hours: formatLocaleFixedNumber(satellite.element_age_hours, 1, locale),
          })}
        />
        <Fact
          label={messages.labels.passRuntime}
          value={
            satellite.pass_prediction_runtime_supported
              ? messages.runtimeSupported
              : messages.runtimeNotSupported
          }
        />
      </dl>
      {satellite.stale_element_warning ? (
        <p className={styles.warning}>
          {formatMessageTemplate(messages.staleWarning, {
            hours: formatLocaleNumber(ELEMENT_WARNING_HOURS, locale),
          })}
        </p>
      ) : null}
    </article>
  );
}

function SourceDetails({
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: SatelliteMessages["source"];
  response: SatelliteListResponse;
}>) {
  return (
    <section aria-labelledby="satellite-source-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="satellite-source-heading">
          {messages.title}
        </h2>
      </div>
      <div className={styles.sourceBlock}>
        <p>{response.source.attribution_text}</p>
        <p>
          {formatMessageTemplate(messages.limitations, {
            maximumOffsetHours: formatLocaleNumber(MAXIMUM_ELEMENT_OFFSET_HOURS, locale),
            propagationModel: SGP4_NAME,
            warningHours: formatLocaleNumber(ELEMENT_WARNING_HOURS, locale),
            windowHours: formatLocaleNumber(PREDICTION_WINDOW_HOURS, locale),
          })}
        </p>
        <div className={styles.actions}>
          <External href={response.source.official_documentation_url}>
            {formatMessageTemplate(messages.documentation, { provider: CELESTRAK_NAME })}
          </External>
          <External href={response.source.terms_url}>
            {formatMessageTemplate(messages.usagePolicy, { provider: CELESTRAK_NAME })}
          </External>
        </div>
      </div>
    </section>
  );
}

function Unavailable({
  messages,
  response,
}: Readonly<{ messages: SatelliteMessages["unavailable"]; response: SatelliteListResponse }>) {
  const detail = unavailableMessage(response.unavailable_reason, messages);
  return (
    <section className={styles.statePanel} role="status">
      <h2>{messages.title}</h2>
      <p>{detail}</p>
      <p>
        {formatMessageTemplate(messages.noBrowserProviderRequest, { provider: CELESTRAK_NAME })}
      </p>
    </section>
  );
}

function TransportUnavailable({
  messages,
}: Readonly<{ messages: SatelliteMessages["transport"] }>) {
  return (
    <section className={styles.statePanel} role="status">
      <h1>{messages.title}</h1>
      <p>{messages.description}</p>
    </section>
  );
}

function unavailableMessage(
  reason: SatelliteListResponse["unavailable_reason"],
  messages: SatelliteMessages["unavailable"],
): string {
  if (reason === "provider_disabled") {
    return formatMessageTemplate(messages.providerDisabled, { provider: CELESTRAK_NAME });
  }
  if (reason === "cached_content_expired") return messages.cachedContentExpired;
  return messages.noCachedContent;
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function External({ children, href }: Readonly<{ children: string; href: string }>) {
  return (
    <a className={styles.link} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}
