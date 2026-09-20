import type { SatelliteItemResponse, SatelliteListResponse } from "@lumina/api-client";
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
    <article className="max-w-6xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
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

      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
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
      className="space-y-2 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4"
      role="status"
    >
      <p className="font-semibold">
        {response.availability === "stale" ? messages.staleTitle : messages.freshTitle}
      </p>
      <p className="leading-7 text-[var(--muted)]">
        {formatMessageTemplate(messages.summary, {
          latestEpoch:
            response.freshness.snapshot_latest_epoch_utc ?? messages.latestEpochNotRecorded,
          retrievedAt: response.freshness.retrieved_at ?? messages.unrecordedTime,
        })}
      </p>
      {response.freshness.last_refresh_failure_code === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.lastFailure, {
            code: response.freshness.last_refresh_failure_code,
          })}
        </p>
      )}
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
    <section aria-labelledby="satellite-list-heading" className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold" id="satellite-list-heading">
          {messages.heading}
        </h2>
        <p className="text-sm leading-6 text-[var(--muted)]">
          {formatMessageTemplate(messages.count, {
            returned: formatLocaleNumber(response.returned_satellite_count, locale),
            stationsGroup: SATELLITE_STATIONS_GROUP_NAME,
            total: formatLocaleNumber(response.total_satellite_count, locale),
            visualGroup: SATELLITE_VISUAL_GROUP_NAME,
          })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
    <article className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-5">
      <div>
        <h3 className="text-lg font-semibold">{satellite.name}</h3>
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.noradReference, {
            catalogNumber: satellite.catalog_number,
          })}
        </p>
      </div>
      <dl className="space-y-2 text-sm">
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
        <p className="border-l-4 border-[var(--focus)] pl-3 text-sm leading-6 text-[var(--muted)]">
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
    <section
      aria-labelledby="satellite-source-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <h2 className="text-xl font-semibold" id="satellite-source-heading">
        {messages.title}
      </h2>
      <p className="max-w-3xl leading-7 text-[var(--muted)]">{response.source.attribution_text}</p>
      <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.limitations, {
          maximumOffsetHours: formatLocaleNumber(MAXIMUM_ELEMENT_OFFSET_HOURS, locale),
          propagationModel: SGP4_NAME,
          warningHours: formatLocaleNumber(ELEMENT_WARNING_HOURS, locale),
          windowHours: formatLocaleNumber(PREDICTION_WINDOW_HOURS, locale),
        })}
      </p>
      <div className="flex flex-wrap gap-4">
        <External href={response.source.official_documentation_url}>
          {formatMessageTemplate(messages.documentation, { provider: CELESTRAK_NAME })}
        </External>
        <External href={response.source.terms_url}>
          {formatMessageTemplate(messages.usagePolicy, { provider: CELESTRAK_NAME })}
        </External>
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
    <section className="space-y-3 border-l-4 border-[var(--border-strong)] p-5" role="status">
      <h2 className="text-2xl font-semibold">{messages.title}</h2>
      <p className="leading-7 text-[var(--muted)]">{detail}</p>
      <p className="text-sm text-[var(--muted)]">
        {formatMessageTemplate(messages.noBrowserProviderRequest, { provider: CELESTRAK_NAME })}
      </p>
    </section>
  );
}

function TransportUnavailable({
  messages,
}: Readonly<{ messages: SatelliteMessages["transport"] }>) {
  return (
    <section className="max-w-2xl space-y-4" role="status">
      <h1 className="text-3xl font-semibold">{messages.title}</h1>
      <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
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
      <dt className="font-medium">{label}</dt>
      <dd className="break-words text-[var(--muted)]">{value}</dd>
    </div>
  );
}

function External({ children, href }: Readonly<{ children: string; href: string }>) {
  return (
    <a
      className="inline-flex min-h-11 items-center text-[var(--link)] underline"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
