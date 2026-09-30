import type { NearEarthResponse } from "@nova-lumina/api-client";
import Link from "next/link";

import {
  formatCountMessage,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { NearEarthMessages, SpaceNowMessages } from "../../../lib/i18n/messages/types";
import type { NowNearEarthOutcome } from "../../../lib/server/space-now";
import {
  NASA_ASTEROIDS_NEOWS_NAME,
  NASA_JPL_NAME,
  NASA_NEOWS_NAME,
  NEOWS_NAME,
} from "../../../lib/space-now/provider-display";
import styles from "../live-data-detail.module.css";

type NearEarthViewProps = Readonly<{
  locale: PublishedLocale;
  messages: NearEarthMessages;
  outcome: NowNearEarthOutcome;
  retrievalMessages: SpaceNowMessages["retrieval"];
}>;

export function NearEarthView({
  locale,
  messages,
  outcome,
  retrievalMessages,
}: NearEarthViewProps) {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <p className={styles.intro}>
          {formatMessageTemplate(messages.intro, {
            provider: NASA_ASTEROIDS_NEOWS_NAME,
          })}
        </p>
      </header>

      {outcome.kind === "ok" ? (
        <NearEarthData
          locale={locale}
          messages={messages}
          response={outcome.data}
          retrievalMessages={retrievalMessages}
        />
      ) : (
        <UnavailableNearEarth messages={messages} retrievalMessages={retrievalMessages} />
      )}
    </article>
  );
}

function NearEarthData({
  locale,
  messages,
  response,
  retrievalMessages,
}: Readonly<{
  locale: PublishedLocale;
  messages: NearEarthMessages;
  response: NearEarthResponse;
  retrievalMessages: SpaceNowMessages["retrieval"];
}>) {
  if (response.availability === "unavailable") {
    return (
      <UnavailableNearEarth
        messages={messages}
        response={response}
        retrievalMessages={retrievalMessages}
      />
    );
  }

  const window = response.window;
  if (window === null)
    return (
      <UnavailableNearEarth
        messages={messages}
        response={response}
        retrievalMessages={retrievalMessages}
      />
    );
  const showingMore = response.total_encounter_count > response.returned_encounter_count;

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
          {formatMessageTemplate(
            response.availability === "stale"
              ? messages.snapshot.staleDescription
              : messages.snapshot.freshDescription,
            { provider: NEOWS_NAME },
          )}
        </p>
      </section>

      <section aria-labelledby="near-earth-window-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="near-earth-window-heading">
            {messages.window.title}
          </h2>
        </div>
        <div className={styles.sectionBody}>
          <p className={styles.bodyCopy}>
            {formatMessageTemplate(messages.window.range, {
              endDate: window.end_date,
              startDate: window.start_date,
            })}
          </p>
          <p className={styles.quietCopy}>
            {response.total_encounter_count === 0
              ? formatMessageTemplate(messages.window.empty, { provider: NEOWS_NAME })
              : showingMore
                ? formatMessageTemplate(messages.window.capped, {
                    returned: formatLocaleNumber(response.returned_encounter_count, locale),
                    total: formatLocaleNumber(response.total_encounter_count, locale),
                  })
                : formatCountMessage(
                    messages.window.listed,
                    response.total_encounter_count,
                    locale,
                  )}
          </p>
        </div>
      </section>

      {response.encounters.length === 0 ? null : (
        <EncounterTable
          encounters={response.encounters}
          locale={locale}
          messages={messages.table}
        />
      )}

      <section aria-labelledby="near-earth-uncertainty-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="near-earth-uncertainty-heading">
            {messages.prediction.title}
          </h2>
        </div>
        <div className={styles.sectionBody}>
          <p className={styles.bodyCopy}>
            {formatMessageTemplate(messages.prediction.uncertainty, { provider: NEOWS_NAME })}
          </p>
          <p className={styles.bodyCopy}>
            {formatMessageTemplate(messages.prediction.classification, {
              authority: NASA_JPL_NAME,
            })}
          </p>
          <p className={styles.bodyCopy}>
            {formatMessageTemplate(messages.prediction.updates, { authority: NASA_JPL_NAME })}
          </p>
        </div>
      </section>

      <FreshnessDetails messages={retrievalMessages} response={response} />
      <SourceDetails messages={messages.source} response={response} />
    </div>
  );
}

function EncounterTable({
  encounters,
  locale,
  messages,
}: Readonly<{
  encounters: NearEarthResponse["encounters"];
  locale: PublishedLocale;
  messages: NearEarthMessages["table"];
}>) {
  return (
    <section aria-labelledby="near-earth-encounters-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="near-earth-encounters-heading">
          {messages.heading}
        </h2>
        <p className={styles.sectionDescription}>{messages.context}</p>
      </div>
      <div className={styles.sectionBody}>
        <div className={styles.tableWrap} tabIndex={0}>
          <table className={`${styles.table} ${styles.tableWide}`}>
            <caption className="sr-only">
              {formatMessageTemplate(messages.caption, { provider: NASA_NEOWS_NAME })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{messages.object}</th>
                <th scope="col">
                  {formatMessageTemplate(messages.approachTime, { provider: NASA_NEOWS_NAME })}
                </th>
                <th scope="col">{messages.nominalMissDistance}</th>
                <th scope="col">{messages.nominalLunarDistance}</th>
                <th scope="col">{messages.relativeVelocity}</th>
                <th scope="col">{messages.diameterRange}</th>
                <th scope="col">{messages.classification}</th>
                <th scope="col">{messages.absoluteMagnitude}</th>
              </tr>
            </thead>
            <tbody>
              {encounters.map((encounter) => (
                <tr key={encounter.encounter_id}>
                  <th scope="row">
                    <span>{encounter.name}</span>
                    <span className={styles.subvalue}>
                      {formatMessageTemplate(messages.objectReference, {
                        id: encounter.neo_reference_id,
                      })}
                    </span>
                  </th>
                  <td>{encounter.approach_time_text}</td>
                  <td className={styles.dataValue}>
                    {formatNearEarthNumber(encounter.nominal_distance_km, locale)}
                  </td>
                  <td className={styles.dataValue}>
                    {formatNearEarthNumber(encounter.nominal_distance_lunar, locale)}
                  </td>
                  <td className={styles.dataValue}>
                    {formatNearEarthNumber(encounter.relative_velocity_km_s, locale)}
                  </td>
                  <td className={styles.dataValue}>
                    {formatNearEarthNumber(encounter.estimated_diameter_min_m, locale)}–
                    {formatNearEarthNumber(encounter.estimated_diameter_max_m, locale)}
                  </td>
                  <td>
                    {formatMessageTemplate(messages.hazardousLabel, {
                      value: encounter.is_potentially_hazardous_asteroid
                        ? messages.yes
                        : messages.no,
                    })}
                  </td>
                  <td className={styles.dataValue}>
                    {formatNearEarthNumber(encounter.absolute_magnitude_h, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FreshnessDetails({
  messages,
  response,
}: Readonly<{
  messages: SpaceNowMessages["retrieval"];
  response: NearEarthResponse;
}>) {
  const freshness = response.freshness;
  return (
    <section aria-labelledby="near-earth-freshness-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="near-earth-freshness-heading">
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
}: Readonly<{ messages: NearEarthMessages["source"]; response: NearEarthResponse }>) {
  const source = response.source;
  return (
    <section aria-labelledby="near-earth-source-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="near-earth-source-heading">
          {messages.title}
        </h2>
      </div>
      <div className={styles.sourceBlock}>
        <p>{source.attribution_text}</p>
        <div className={styles.actions}>
          <a
            className={styles.link}
            href={source.official_documentation_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {formatMessageTemplate(messages.officialDocumentation, {
              sourceName: source.name,
            })}
          </a>
        </div>
      </div>
    </section>
  );
}

function UnavailableNearEarth({
  messages,
  response,
  retrievalMessages,
}: Readonly<{
  messages: NearEarthMessages;
  response?: NearEarthResponse;
  retrievalMessages: SpaceNowMessages["retrieval"];
}>) {
  const detail = unavailableMessage(response?.unavailable_reason, messages.unavailable);

  return (
    <section aria-labelledby="near-earth-unavailable-heading" className={styles.stack}>
      <div aria-live="polite" className={styles.statePanel} role="status">
        <h2 id="near-earth-unavailable-heading">{messages.unavailable.title}</h2>
        <p>{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails messages={retrievalMessages} response={response} />
          <SourceDetails messages={messages.source} response={response} />
        </>
      )}
      <Link className={styles.link} href="/now">
        {messages.unavailable.returnToSpaceNow}
      </Link>
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

function unavailableMessage(
  reason: NearEarthResponse["unavailable_reason"] | undefined,
  messages: NearEarthMessages["unavailable"],
): string {
  if (reason === "provider_disabled") return messages.providerDisabled;
  if (reason === "no_cached_content") return messages.noCachedContent;
  if (reason === "cached_content_expired") return messages.cachedContentExpired;
  return messages.generic;
}

function formatNearEarthNumber(value: number, locale: PublishedLocale): string {
  return formatLocaleNumber(value, locale, { maximumFractionDigits: 6 });
}
