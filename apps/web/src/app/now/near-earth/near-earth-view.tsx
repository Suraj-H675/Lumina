import type { NearEarthResponse } from "@lumina/api-client";
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
    <article className="max-w-6xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
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
    <div className="space-y-8">
      <section
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-xl font-semibold">
          {response.availability === "stale"
            ? messages.snapshot.staleTitle
            : messages.snapshot.freshTitle}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(
            response.availability === "stale"
              ? messages.snapshot.staleDescription
              : messages.snapshot.freshDescription,
            { provider: NEOWS_NAME },
          )}
        </p>
      </section>

      <section aria-labelledby="near-earth-window-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="near-earth-window-heading">
          {messages.window.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.window.range, {
            endDate: window.end_date,
            startDate: window.start_date,
          })}
        </p>
        <p className="text-sm leading-7 text-[var(--muted)]">
          {response.total_encounter_count === 0
            ? formatMessageTemplate(messages.window.empty, { provider: NEOWS_NAME })
            : showingMore
              ? formatMessageTemplate(messages.window.capped, {
                  returned: formatLocaleNumber(response.returned_encounter_count, locale),
                  total: formatLocaleNumber(response.total_encounter_count, locale),
                })
              : formatCountMessage(messages.window.listed, response.total_encounter_count, locale)}
        </p>
      </section>

      {response.encounters.length === 0 ? null : (
        <EncounterTable
          encounters={response.encounters}
          locale={locale}
          messages={messages.table}
        />
      )}

      <section
        aria-labelledby="near-earth-uncertainty-heading"
        className="space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-2xl font-semibold" id="near-earth-uncertainty-heading">
          {messages.prediction.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.prediction.uncertainty, { provider: NEOWS_NAME })}
        </p>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.prediction.classification, {
            authority: NASA_JPL_NAME,
          })}
        </p>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.prediction.updates, { authority: NASA_JPL_NAME })}
        </p>
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
    <section aria-labelledby="near-earth-encounters-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="near-earth-encounters-heading">
        {messages.heading}
      </h2>
      <div className="overflow-x-auto border border-[var(--border)]" tabIndex={0}>
        <table className="min-w-[60rem] w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            {formatMessageTemplate(messages.caption, { provider: NASA_NEOWS_NAME })}
          </caption>
          <thead className="bg-[var(--surface)]">
            <tr>
              <th className="min-w-44 px-4 py-3 font-semibold" scope="col">
                {messages.object}
              </th>
              <th className="min-w-48 px-4 py-3 font-semibold" scope="col">
                {formatMessageTemplate(messages.approachTime, { provider: NASA_NEOWS_NAME })}
              </th>
              <th className="min-w-44 px-4 py-3 font-semibold" scope="col">
                {messages.nominalMissDistance}
              </th>
              <th className="min-w-40 px-4 py-3 font-semibold" scope="col">
                {messages.nominalLunarDistance}
              </th>
              <th className="min-w-36 px-4 py-3 font-semibold" scope="col">
                {messages.relativeVelocity}
              </th>
              <th className="min-w-48 px-4 py-3 font-semibold" scope="col">
                {messages.diameterRange}
              </th>
              <th className="min-w-48 px-4 py-3 font-semibold" scope="col">
                {messages.classification}
              </th>
              <th className="min-w-32 px-4 py-3 font-semibold" scope="col">
                {messages.absoluteMagnitude}
              </th>
            </tr>
          </thead>
          <tbody>
            {encounters.map((encounter) => (
              <tr
                className="border-t border-[var(--border)] align-top"
                key={encounter.encounter_id}
              >
                <th className="px-4 py-4 font-medium" scope="row">
                  <span className="block">{encounter.name}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {formatMessageTemplate(messages.objectReference, {
                      id: encounter.neo_reference_id,
                    })}
                  </span>
                </th>
                <td className="px-4 py-4 text-[var(--muted)]">{encounter.approach_time_text}</td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNearEarthNumber(encounter.nominal_distance_km, locale)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNearEarthNumber(encounter.nominal_distance_lunar, locale)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNearEarthNumber(encounter.relative_velocity_km_s, locale)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNearEarthNumber(encounter.estimated_diameter_min_m, locale)}–
                  {formatNearEarthNumber(encounter.estimated_diameter_max_m, locale)}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatMessageTemplate(messages.hazardousLabel, {
                    value: encounter.is_potentially_hazardous_asteroid ? messages.yes : messages.no,
                  })}
                </td>
                <td className="px-4 py-4 text-[var(--muted)]">
                  {formatNearEarthNumber(encounter.absolute_magnitude_h, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm leading-7 text-[var(--muted)]">{messages.context}</p>
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
    <section aria-labelledby="near-earth-freshness-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="near-earth-freshness-heading">
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
}: Readonly<{ messages: NearEarthMessages["source"]; response: NearEarthResponse }>) {
  const source = response.source;
  return (
    <section aria-labelledby="near-earth-source-heading" className="space-y-4">
      <h2 className="text-2xl font-semibold" id="near-earth-source-heading">
        {messages.title}
      </h2>
      <div className="space-y-4 border border-[var(--border)] p-5">
        <p className="leading-7 text-[var(--muted)]">{source.attribution_text}</p>
        <p>
          <a
            className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
            href={source.official_documentation_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            {formatMessageTemplate(messages.officialDocumentation, {
              sourceName: source.name,
            })}
          </a>
        </p>
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
    <section aria-labelledby="near-earth-unavailable-heading" className="space-y-6">
      <div
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="near-earth-unavailable-heading">
          {messages.unavailable.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails messages={retrievalMessages} response={response} />
          <SourceDetails messages={messages.source} response={response} />
        </>
      )}
      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
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
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">
        {value === null ? notRecorded : <time dateTime={value}>{value}</time>}
      </dd>
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
