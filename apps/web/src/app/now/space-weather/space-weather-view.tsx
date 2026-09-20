import type { SpaceWeatherResponse } from "@lumina/api-client";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SpaceWeatherMessages } from "../../../lib/i18n/messages/types";
import { NOAA_NAME, NOAA_SWPC_NAME, SWPC_NAME } from "../../../lib/space-now/provider-display";
import type { NowSpaceWeatherOutcome } from "../../../lib/server/space-now";

export function SpaceWeatherView({
  locale,
  messages,
  outcome,
}: Readonly<{
  locale: PublishedLocale;
  messages: SpaceWeatherMessages;
  outcome: NowSpaceWeatherOutcome;
}>) {
  return (
    <article className="max-w-6xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          {formatMessageTemplate(messages.intro, { provider: NOAA_NAME })}
        </p>
      </header>

      {outcome.kind === "ok" ? (
        <SpaceWeatherData locale={locale} messages={messages} response={outcome.data} />
      ) : (
        <UnavailableSpaceWeather messages={messages} />
      )}
    </article>
  );
}

function SpaceWeatherData({
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: SpaceWeatherMessages;
  response: SpaceWeatherResponse;
}>) {
  if (response.availability === "unavailable") {
    return <UnavailableSpaceWeather messages={messages} response={response} />;
  }

  return (
    <div className="space-y-10">
      <section
        aria-live="polite"
        className={
          response.availability === "stale"
            ? "space-y-3 border-l-4 border-[var(--focus)] bg-[var(--surface)] p-5"
            : "space-y-3 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-5"
        }
        role="status"
      >
        <h2 className="text-xl font-semibold">
          {response.availability === "stale"
            ? messages.snapshot.staleTitle
            : messages.snapshot.freshTitle}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.snapshot.description, {
            provider: NOAA_NAME,
          })}
        </p>
      </section>

      <CurrentScales messages={messages.scales} response={response} />
      <KpSection locale={locale} messages={messages.kp} response={response} />
      <SolarWindSection locale={locale} messages={messages.solarWind} response={response} />
      <NotificationsSection messages={messages.notifications} response={response} />
      <ImpactsSection messages={messages.impacts} response={response} />
      <AuroraSection messages={messages.aurora} response={response} />
      <FreshnessDetails messages={messages.freshness} response={response} />
      <SourceDetails messages={messages.source} response={response} />
    </div>
  );
}

function CurrentScales({
  messages,
  response,
}: Readonly<{ messages: SpaceWeatherMessages["scales"]; response: SpaceWeatherResponse }>) {
  const scales = response.scales;
  return (
    <section aria-labelledby="space-weather-scales-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-scales-heading">
          {formatMessageTemplate(messages.title, { provider: NOAA_NAME })}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, { provider: NOAA_NAME })}
        </p>
      </div>
      {scales === null ? (
        <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.unavailable, { provider: NOAA_NAME })}
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <ScaleCard
              code="R"
              label={messages.families.radioBlackout}
              messages={messages}
              value={scales.radio_blackout}
            />
            <ScaleCard
              code="S"
              label={messages.families.solarRadiation}
              messages={messages}
              value={scales.solar_radiation}
            />
            <ScaleCard
              code="G"
              label={messages.families.geomagnetic}
              messages={messages}
              value={scales.geomagnetic}
            />
          </div>
          <p className="text-sm leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.sourceTime, {
              date: scales.date_text,
              provider: NOAA_NAME,
              time: scales.time_text,
            })}
          </p>
        </>
      )}
    </section>
  );
}

function ScaleCard({
  code,
  label,
  messages,
  value,
}: Readonly<{
  code: "G" | "R" | "S";
  label: string;
  messages: SpaceWeatherMessages["scales"];
  value: NonNullable<SpaceWeatherResponse["scales"]>["geomagnetic"];
}>) {
  return (
    <article className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-semibold">{label}</h3>
      <p className="text-2xl font-semibold">
        {code}
        {value.level} — {value.text ?? messages.noSourceDescription}
      </p>
      <p className="text-sm leading-7 text-[var(--muted)]">
        {formatMessageTemplate(messages.familyContext, {
          code,
          provider: NOAA_NAME,
        })}
      </p>
    </article>
  );
}

function KpSection({
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: SpaceWeatherMessages["kp"];
  response: SpaceWeatherResponse;
}>) {
  const { latest_observed: observed, latest_estimated: estimated, forecast } = response.kp;
  return (
    <section aria-labelledby="space-weather-kp-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-kp-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, { provider: NOAA_NAME })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <KpSummary
          label={messages.labels.latestObserved}
          locale={locale}
          messages={messages}
          value={observed}
        />
        <KpSummary
          label={messages.labels.latestEstimated}
          locale={locale}
          messages={messages}
          value={estimated}
        />
      </div>
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">{messages.forecast.heading}</h3>
        {forecast.length === 0 ? (
          <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
            {messages.forecast.empty}
          </p>
        ) : (
          <div className="overflow-x-auto border border-[var(--border)]" tabIndex={0}>
            <table className="min-w-[32rem] w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                {formatMessageTemplate(messages.forecast.caption, { provider: NOAA_NAME })}
              </caption>
              <thead className="bg-[var(--surface)]">
                <tr>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    {formatMessageTemplate(messages.forecast.headers.time, {
                      provider: NOAA_NAME,
                    })}
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    {messages.forecast.headers.kp}
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    {formatMessageTemplate(messages.forecast.headers.scale, {
                      provider: NOAA_NAME,
                    })}
                  </th>
                  <th className="px-4 py-3 font-semibold" scope="col">
                    {messages.forecast.headers.statusColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((row) => (
                  <tr
                    className="border-t border-[var(--border)]"
                    key={`${row.time_text}-${row.kp}`}
                  >
                    <td className="px-4 py-3 text-[var(--muted)]">{row.time_text}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatSpaceWeatherNumber(row.kp, locale)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {row.noaa_scale ?? messages.notReported}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {kpForecastStatusLabel(row.status, messages)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function KpSummary({
  label,
  locale,
  messages,
  value,
}: Readonly<{
  label: string;
  locale: PublishedLocale;
  messages: SpaceWeatherMessages["kp"];
  value: SpaceWeatherResponse["kp"]["latest_observed"];
}>) {
  return (
    <article className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-semibold">{label}</h3>
      {value === null ? (
        <p className="leading-7 text-[var(--muted)]">{messages.notReportedInSnapshot}</p>
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">{messages.labels.kp}</dt>
            <dd className="text-2xl font-semibold">{formatSpaceWeatherNumber(value.kp, locale)}</dd>
          </div>
          <div>
            <dt className="font-medium">{messages.labels.providerStatus}</dt>
            <dd className="text-[var(--muted)]">{kpStatusLabel(value.status, messages)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium">
              {formatMessageTemplate(messages.labels.productTime, { provider: NOAA_NAME })}
            </dt>
            <dd className="text-[var(--muted)]">{value.time_text}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium">
              {formatMessageTemplate(messages.labels.scaleField, { provider: NOAA_NAME })}
            </dt>
            <dd className="text-[var(--muted)]">{value.noaa_scale ?? messages.notReported}</dd>
          </div>
        </dl>
      )}
    </article>
  );
}

function SolarWindSection({
  locale,
  messages,
  response,
}: Readonly<{
  locale: PublishedLocale;
  messages: SpaceWeatherMessages["solarWind"];
  response: SpaceWeatherResponse;
}>) {
  const solarWind = response.solar_wind;
  return (
    <section aria-labelledby="space-weather-solar-wind-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-solar-wind-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, { provider: SWPC_NAME })}
        </p>
      </div>
      {solarWind === null ? (
        <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
          {messages.unavailable}
        </p>
      ) : (
        <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
          <MeasurementField
            label={messages.labels.protonSpeed}
            locale={locale}
            messages={messages}
            timestamp={solarWind.speed_time_utc}
            unit="km/s"
            value={solarWind.proton_speed_km_s}
          />
          <MeasurementField
            label={messages.labels.bt}
            locale={locale}
            messages={messages}
            timestamp={solarWind.field_time_utc}
            unit="nT"
            value={solarWind.bt_nt}
          />
          <MeasurementField
            label={messages.labels.bz}
            locale={locale}
            messages={messages}
            timestamp={solarWind.field_time_utc}
            unit="nT"
            value={solarWind.bz_gsm_nt}
          />
        </dl>
      )}
    </section>
  );
}

function MeasurementField({
  label,
  locale,
  messages,
  timestamp,
  unit,
  value,
}: Readonly<{
  label: string;
  locale: PublishedLocale;
  messages: SpaceWeatherMessages["solarWind"];
  timestamp: string | null;
  unit: string;
  value: number | null;
}>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-2xl font-semibold">
        {value === null
          ? messages.notReported
          : formatSpaceWeatherNumber(value, locale) + " " + unit}
      </dd>
      <dd className="mt-1 text-sm text-[var(--muted)]">
        {formatMessageTemplate(messages.sourceObservationTime, {
          time: timestamp ?? messages.notRecorded,
        })}
      </dd>
    </div>
  );
}

function NotificationsSection({
  messages,
  response,
}: Readonly<{
  messages: SpaceWeatherMessages["notifications"];
  response: SpaceWeatherResponse;
}>) {
  return (
    <section aria-labelledby="space-weather-notifications-heading" className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold" id="space-weather-notifications-heading">
          {formatMessageTemplate(messages.title, { provider: SWPC_NAME })}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      </div>
      {response.latest_notifications.length === 0 ? (
        <p className="border border-[var(--border)] p-5 leading-7 text-[var(--muted)]">
          {messages.empty}
        </p>
      ) : (
        <ol className="space-y-4">
          {response.latest_notifications.map((notification, index) => (
            <li
              className="space-y-2 border border-[var(--border)] bg-[var(--surface)] p-5"
              key={`${notification.issue_time_text}-${notification.product_id}-${index}`}
            >
              <h3 className="font-semibold">{notification.product_id}</h3>
              <p className="text-sm text-[var(--muted)]">
                {formatMessageTemplate(messages.issueTime, {
                  time: notification.issue_time_text,
                })}
              </p>
              <p className="whitespace-pre-line break-words leading-7">{notification.message}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ImpactsSection({
  messages,
  response,
}: Readonly<{ messages: SpaceWeatherMessages["impacts"]; response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-impacts-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-impacts-heading">
        {formatMessageTemplate(messages.title, { provider: NOAA_NAME })}
      </h2>
      <p className="leading-7 text-[var(--muted)]">
        {formatMessageTemplate(messages.description, { provider: NOAA_NAME })}
      </p>
      <ul className="grid gap-4 md:grid-cols-3">
        {response.impacts.map((impact) => (
          <li className="border border-[var(--border)] p-5" key={impact.family}>
            <h3 className="font-semibold">
              {formatMessageTemplate(messages.familyHeading, { family: impact.family })}
            </h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">{impact.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AuroraSection({
  messages,
  response,
}: Readonly<{ messages: SpaceWeatherMessages["aurora"]; response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-aurora-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-aurora-heading">
        {messages.title}
      </h2>
      <p className="leading-7 text-[var(--muted)]">{response.aurora.explanation}</p>
      <a
        className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline underline-offset-4"
        href={response.aurora.official_url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {response.aurora.label}
      </a>
    </section>
  );
}

function FreshnessDetails({
  messages,
  response,
}: Readonly<{
  messages: SpaceWeatherMessages["freshness"];
  response: SpaceWeatherResponse;
}>) {
  const freshness = response.freshness;
  return (
    <section aria-labelledby="space-weather-freshness-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-freshness-heading">
        {messages.title}
      </h2>
      <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
        <div>
          <dt className="font-medium">{messages.cacheStateLabel}</dt>
          <dd className="text-[var(--muted)]">{messages.cacheStates[freshness.cache_state]}</dd>
        </div>
        <TimestampField
          label={messages.retrievedAtLabel}
          notRecorded={messages.notRecorded}
          value={freshness.retrieved_at}
        />
        <TimestampField
          label={messages.freshUntilLabel}
          notRecorded={messages.notRecorded}
          value={freshness.fresh_until}
        />
        <TimestampField
          label={messages.staleUntilLabel}
          notRecorded={messages.notRecorded}
          value={freshness.stale_until}
        />
        <div>
          <dt className="font-medium">{messages.lastFailureLabel}</dt>
          <dd className="text-[var(--muted)]">
            {freshness.last_refresh_failure_code ?? messages.noneRecorded}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function SourceDetails({
  messages,
  response,
}: Readonly<{ messages: SpaceWeatherMessages["source"]; response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-source-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="space-weather-source-heading">
        {messages.title}
      </h2>
      <div className="space-y-4 border border-[var(--border)] p-5">
        <p className="leading-7 text-[var(--muted)]">{response.source.attribution_text}</p>
        <p>
          <ExternalLink href={response.source.official_documentation_url}>
            {formatMessageTemplate(messages.documentation, {
              sourceName: response.source.name,
            })}
          </ExternalLink>
        </p>
        <p className="text-sm leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.limitations, { provider: NOAA_SWPC_NAME })}
        </p>
      </div>
      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
        {messages.returnToSpaceNow}
      </Link>
    </section>
  );
}

function UnavailableSpaceWeather({
  messages,
  response,
}: Readonly<{
  messages: SpaceWeatherMessages;
  response?: SpaceWeatherResponse;
}>) {
  const detail = unavailableMessage(response?.unavailable_reason, messages.unavailable);

  return (
    <section aria-labelledby="space-weather-unavailable-heading" className="space-y-6">
      <div
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="space-weather-unavailable-heading">
          {messages.unavailable.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails messages={messages.freshness} response={response} />
          <SourceDetails messages={messages.source} response={response} />
        </>
      )}
      {response === undefined ? (
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href="/now"
        >
          {messages.source.returnToSpaceNow}
        </Link>
      ) : null}
    </section>
  );
}

function TimestampField({
  label,
  notRecorded,
  value,
}: Readonly<{ label: string; notRecorded: string; value: string | null }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">
        {value === null ? notRecorded : <time dateTime={value}>{value}</time>}
      </dd>
    </div>
  );
}

function ExternalLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <a
      className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function formatSpaceWeatherNumber(value: number, locale: PublishedLocale): string {
  return formatLocaleNumber(value, locale, {
    maximumFractionDigits: 20,
    useGrouping: false,
  });
}

function kpStatusLabel(
  status: NonNullable<SpaceWeatherResponse["kp"]["latest_observed"]>["status"],
  messages: SpaceWeatherMessages["kp"],
): string {
  if (status === "observed") return messages.statuses.observed;
  if (status === "estimated") return messages.statuses.estimated;
  if (status === "predicted") return messages.statuses.predicted;
  return messages.notReported;
}

function kpForecastStatusLabel(
  status: NonNullable<SpaceWeatherResponse["kp"]["latest_observed"]>["status"],
  messages: SpaceWeatherMessages["kp"],
): string {
  if (status === "observed") return messages.forecast.statuses.observed;
  if (status === "estimated") return messages.forecast.statuses.estimated;
  if (status === "predicted") return messages.forecast.statuses.predicted;
  return messages.notReported;
}

function unavailableMessage(
  reason: SpaceWeatherResponse["unavailable_reason"] | undefined,
  messages: SpaceWeatherMessages["unavailable"],
): string {
  if (reason === "provider_disabled") return messages.providerDisabled;
  if (reason === "no_cached_content") return messages.noCachedContent;
  if (reason === "cached_content_expired") return messages.cachedContentExpired;
  return messages.generic;
}
