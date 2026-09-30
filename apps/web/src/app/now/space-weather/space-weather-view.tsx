import type { SpaceWeatherResponse } from "@nova-lumina/api-client";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SpaceWeatherMessages } from "../../../lib/i18n/messages/types";
import { NOAA_NAME, NOAA_SWPC_NAME, SWPC_NAME } from "../../../lib/space-now/provider-display";
import type { NowSpaceWeatherOutcome } from "../../../lib/server/space-now";
import styles from "../live-data-detail.module.css";

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
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <p className={styles.intro}>
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
    <div className={styles.stack}>
      <section
        aria-live="polite"
        className={styles.freshness}
        data-state={response.availability}
        role="status"
      >
        <h2 className={styles.freshnessTitle}>
          {response.availability === "stale"
            ? messages.snapshot.staleTitle
            : messages.snapshot.freshTitle}
        </h2>
        <p className={styles.freshnessCopy}>
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
    <section aria-labelledby="space-weather-scales-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-scales-heading">
          {formatMessageTemplate(messages.title, { provider: NOAA_NAME })}
        </h2>
        <p className={styles.sectionDescription}>
          {formatMessageTemplate(messages.description, { provider: NOAA_NAME })}
        </p>
      </div>
      <div className={styles.sectionBody}>
        {scales === null ? (
          <div className={styles.statePanel}>
            <p>{formatMessageTemplate(messages.unavailable, { provider: NOAA_NAME })}</p>
          </div>
        ) : (
          <>
            <div className={styles.ruledGrid}>
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
            <p className={styles.quietCopy}>
              {formatMessageTemplate(messages.sourceTime, {
                date: scales.date_text,
                provider: NOAA_NAME,
                time: scales.time_text,
              })}
            </p>
          </>
        )}
      </div>
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
    <article className={styles.ruledItem}>
      <p className={styles.cardLabel}>{label}</p>
      <p className={styles.cardMetric}>
        {code}
        {value.level} — {value.text ?? messages.noSourceDescription}
      </p>
      <p className={styles.cardCopy}>
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
    <section aria-labelledby="space-weather-kp-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-kp-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionDescription}>
          {formatMessageTemplate(messages.description, { provider: NOAA_NAME })}
        </p>
      </div>
      <div className={styles.sectionBody}>
        <div className={styles.ruledGridTwo}>
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
        <h3 className={styles.cardTitle}>{messages.forecast.heading}</h3>
        {forecast.length === 0 ? (
          <div className={styles.statePanel}>
            <p>{messages.forecast.empty}</p>
          </div>
        ) : (
          <div className={styles.tableWrap} tabIndex={0}>
            <table className={`${styles.table} ${styles.tableMedium}`}>
              <caption className="sr-only">
                {formatMessageTemplate(messages.forecast.caption, { provider: NOAA_NAME })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    {formatMessageTemplate(messages.forecast.headers.time, {
                      provider: NOAA_NAME,
                    })}
                  </th>
                  <th scope="col">{messages.forecast.headers.kp}</th>
                  <th scope="col">
                    {formatMessageTemplate(messages.forecast.headers.scale, {
                      provider: NOAA_NAME,
                    })}
                  </th>
                  <th scope="col">{messages.forecast.headers.statusColumn}</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((row) => (
                  <tr key={`${row.time_text}-${row.kp}`}>
                    <td>{row.time_text}</td>
                    <td className={styles.dataValue}>{formatSpaceWeatherNumber(row.kp, locale)}</td>
                    <td>{row.noaa_scale ?? messages.notReported}</td>
                    <td>{kpForecastStatusLabel(row.status, messages)}</td>
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
    <article className={styles.ruledItem}>
      <h3 className={styles.cardTitle}>{label}</h3>
      {value === null ? (
        <p className={styles.cardCopy}>{messages.notReportedInSnapshot}</p>
      ) : (
        <dl className={styles.definitionList}>
          <div>
            <dt>{messages.labels.kp}</dt>
            <dd>{formatSpaceWeatherNumber(value.kp, locale)}</dd>
          </div>
          <div>
            <dt>{messages.labels.providerStatus}</dt>
            <dd>{kpStatusLabel(value.status, messages)}</dd>
          </div>
          <div>
            <dt>{formatMessageTemplate(messages.labels.productTime, { provider: NOAA_NAME })}</dt>
            <dd>{value.time_text}</dd>
          </div>
          <div>
            <dt>{formatMessageTemplate(messages.labels.scaleField, { provider: NOAA_NAME })}</dt>
            <dd>{value.noaa_scale ?? messages.notReported}</dd>
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
    <section aria-labelledby="space-weather-solar-wind-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-solar-wind-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionDescription}>
          {formatMessageTemplate(messages.description, { provider: SWPC_NAME })}
        </p>
      </div>
      <div className={styles.sectionBody}>
        {solarWind === null ? (
          <div className={styles.statePanel}>
            <p>{messages.unavailable}</p>
          </div>
        ) : (
          <dl className={styles.ruledGrid}>
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
      </div>
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
    <div className={styles.ruledItem}>
      <dt className={styles.cardLabel}>{label}</dt>
      <dd className={styles.cardMetric}>
        {value === null
          ? messages.notReported
          : formatSpaceWeatherNumber(value, locale) + " " + unit}
      </dd>
      <dd className={styles.cardCopy}>
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
    <section aria-labelledby="space-weather-notifications-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-notifications-heading">
          {formatMessageTemplate(messages.title, { provider: SWPC_NAME })}
        </h2>
        <p className={styles.sectionDescription}>{messages.description}</p>
      </div>
      <div className={styles.sectionBody}>
        {response.latest_notifications.length === 0 ? (
          <div className={styles.statePanel}>
            <p>{messages.empty}</p>
          </div>
        ) : (
          <ol className={styles.notificationList}>
            {response.latest_notifications.map((notification, index) => (
              <li
                className={styles.notification}
                key={`${notification.issue_time_text}-${notification.product_id}-${index}`}
              >
                <h3 className={styles.notificationHeader}>{notification.product_id}</h3>
                <p className={styles.notificationMeta}>
                  {formatMessageTemplate(messages.issueTime, {
                    time: notification.issue_time_text,
                  })}
                </p>
                <p className={styles.notificationMessage}>{notification.message}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ImpactsSection({
  messages,
  response,
}: Readonly<{ messages: SpaceWeatherMessages["impacts"]; response: SpaceWeatherResponse }>) {
  return (
    <section aria-labelledby="space-weather-impacts-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-impacts-heading">
          {formatMessageTemplate(messages.title, { provider: NOAA_NAME })}
        </h2>
        <p className={styles.sectionDescription}>
          {formatMessageTemplate(messages.description, { provider: NOAA_NAME })}
        </p>
      </div>
      <ul className={styles.ruledGrid}>
        {response.impacts.map((impact) => (
          <li className={styles.ruledItem} key={impact.family}>
            <h3 className={styles.cardTitle}>
              {formatMessageTemplate(messages.familyHeading, { family: impact.family })}
            </h3>
            <p className={styles.cardCopy}>{impact.summary}</p>
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
    <section aria-labelledby="space-weather-aurora-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-aurora-heading">
          {messages.title}
        </h2>
      </div>
      <div className={styles.sectionBody}>
        <p className={styles.bodyCopy}>{response.aurora.explanation}</p>
        <div className={styles.actions}>
          <a
            className={styles.link}
            href={response.aurora.official_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {response.aurora.label}
          </a>
        </div>
      </div>
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
    <section aria-labelledby="space-weather-freshness-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-freshness-heading">
          {messages.title}
        </h2>
      </div>
      <dl className={styles.factGrid}>
        <div className={styles.fact}>
          <dt>{messages.cacheStateLabel}</dt>
          <dd>{messages.cacheStates[freshness.cache_state]}</dd>
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
    <section aria-labelledby="space-weather-source-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="space-weather-source-heading">
          {messages.title}
        </h2>
      </div>
      <div className={styles.sourceBlock}>
        <p>{response.source.attribution_text}</p>
        <div className={styles.actions}>
          <ExternalLink href={response.source.official_documentation_url}>
            {formatMessageTemplate(messages.documentation, {
              sourceName: response.source.name,
            })}
          </ExternalLink>
        </div>
        <p>{formatMessageTemplate(messages.limitations, { provider: NOAA_SWPC_NAME })}</p>
        <div className={styles.actions}>
          <Link className={styles.link} href="/now">
            {messages.returnToSpaceNow}
          </Link>
        </div>
      </div>
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
    <section aria-labelledby="space-weather-unavailable-heading" className={styles.stack}>
      <div aria-live="polite" className={styles.statePanel} role="status">
        <h2 id="space-weather-unavailable-heading">{messages.unavailable.title}</h2>
        <p>{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails messages={messages.freshness} response={response} />
          <SourceDetails messages={messages.source} response={response} />
        </>
      )}
      {response === undefined ? (
        <Link className={styles.link} href="/now">
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
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value === null ? notRecorded : <time dateTime={value}>{value}</time>}</dd>
    </div>
  );
}

function ExternalLink({ children, href }: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <a className={styles.link} href={href} rel="noopener noreferrer" target="_blank">
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
