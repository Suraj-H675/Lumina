import type { LaunchDetailResponse, LaunchItemResponse } from "@lumina/api-client";
import Link from "next/link";

import { formatLocaleList, formatMessageTemplate } from "../../../../lib/i18n/format";
import type { PublishedLocale } from "../../../../lib/i18n/locales";
import type { LaunchCenterMessages } from "../../../../lib/i18n/messages/types";
import type { NowLaunchDetailOutcome } from "../../../../lib/server/space-now";
import { LaunchCountdown } from "../launch-countdown";

export function LaunchDetailView({
  locale,
  messages,
  outcome,
}: Readonly<{
  locale: PublishedLocale;
  messages: LaunchCenterMessages;
  outcome: NowLaunchDetailOutcome;
}>) {
  if (outcome.kind !== "ok") return <TransportUnavailable messages={messages} />;
  if (outcome.data.availability === "unavailable" || outcome.data.launch === null) {
    return <Unavailable messages={messages} response={outcome.data} />;
  }
  const launch = outcome.data.launch;
  return (
    <article className="max-w-4xl space-y-10">
      <header className="space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {messages.common.spaceNowLaunchCenter}
        </p>
        <div className="space-y-2">
          <p className="font-semibold text-[var(--accent)]">
            {launch.status.abbreviation} · {launch.status.name}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{launch.name}</h1>
        </div>
        <Schedule launch={launch} messages={messages.schedule} />
        {launch.timing.countdown_eligible ? (
          <LaunchCountdown
            locale={locale}
            messages={messages.countdown}
            targetUtc={launch.timing.net_utc}
          />
        ) : null}
      </header>

      <section aria-labelledby="launch-facts-heading" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="launch-facts-heading">
          {messages.detail.factsTitle}
        </h2>
        <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
          <Fact
            label={messages.detail.labels.launchProvider}
            value={launch.agency?.name ?? messages.common.notProvidedBySource}
          />
          <Fact
            label={messages.detail.labels.vehicle}
            value={launch.vehicle?.full_name ?? messages.common.notProvidedBySource}
          />
          <Fact
            label={messages.detail.labels.vehicleVariant}
            value={launch.vehicle?.variant ?? messages.common.notProvidedBySource}
          />
          <Fact
            label={messages.detail.labels.launchPad}
            value={launch.site?.pad_name ?? messages.common.notProvidedBySource}
          />
          <Fact
            label={messages.detail.labels.location}
            value={launch.site?.location_name ?? messages.common.notProvidedBySource}
          />
          <Fact
            label={messages.detail.labels.country}
            value={launch.site?.country_name ?? messages.common.notProvidedBySource}
          />
        </dl>
      </section>

      {launch.mission === null ? null : (
        <section
          aria-labelledby="mission-heading"
          className="space-y-4 border border-[var(--border)] p-5 sm:p-7"
        >
          <h2 className="text-2xl font-semibold" id="mission-heading">
            {launch.mission.name}
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Fact
              label={messages.detail.labels.missionType}
              value={launch.mission.mission_type ?? messages.common.notProvided}
            />
            <Fact
              label={messages.detail.labels.destinationBody}
              value={launch.mission.destination_body ?? messages.common.notProvided}
            />
            <Fact
              label={messages.detail.labels.orbit}
              value={launch.mission.orbit_name ?? messages.common.notProvided}
            />
            <Fact
              label={messages.detail.labels.missionAgencies}
              value={
                launch.mission.agency_names.length === 0
                  ? messages.common.notProvided
                  : formatLocaleList(launch.mission.agency_names, locale)
              }
            />
          </dl>
          {launch.mission.description === null ? null : (
            <p className="leading-8 text-[var(--muted)]">{launch.mission.description}</p>
          )}
        </section>
      )}

      <section aria-labelledby="launch-actions-heading" className="space-y-4">
        <h2 className="text-xl font-semibold" id="launch-actions-heading">
          {messages.detail.sourceActionsTitle}
        </h2>
        <div className="flex flex-wrap gap-3">
          {launch.official_page_url === null ? null : (
            <External href={launch.official_page_url}>
              {messages.detail.officialLaunchPage}
            </External>
          )}
          {launch.official_webcast_url === null ? null : (
            <External href={launch.official_webcast_url}>
              {launch.webcast_live
                ? messages.detail.officialLiveWebcast
                : messages.detail.officialWebcast}
            </External>
          )}
          {launch.timing.calendar_eligible ? (
            <a
              className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline"
              href={`/now/launches/${launch.launch_id}/calendar`}
            >
              {messages.detail.addToCalendar}
            </a>
          ) : null}
        </div>
        {!launch.timing.calendar_eligible ? (
          <p className="text-sm leading-6 text-[var(--muted)]">
            {messages.detail.calendarWithheld}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="launch-provenance-heading"
        className="space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 className="text-xl font-semibold" id="launch-provenance-heading">
          {messages.detail.provenanceTitle}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{outcome.data.source.attribution_text}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact
            label={messages.detail.labels.ll2RecordUpdated}
            value={launch.timing.provider_updated_at}
          />
          <Fact
            label={messages.detail.labels.luminaRetrieved}
            value={outcome.data.freshness.retrieved_at ?? messages.common.notRecorded}
          />
          <Fact
            label={messages.detail.labels.cacheState}
            value={messages.common.cacheStates[outcome.data.freshness.cache_state]}
          />
          <Fact
            label={messages.detail.labels.lastRefreshFailure}
            value={outcome.data.freshness.last_refresh_failure_code ?? messages.common.noneRecorded}
          />
        </dl>
        <External href={outcome.data.source.official_documentation_url}>
          {messages.detail.sourceDocumentation}
        </External>
      </section>

      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline"
        href="/now/launches"
      >
        {messages.common.backToLaunchCenter}
      </Link>
    </article>
  );
}

function Schedule({
  launch,
  messages,
}: Readonly<{
  launch: LaunchItemResponse;
  messages: LaunchCenterMessages["schedule"];
}>) {
  const exact = launch.timing.precision_id <= 2;
  return (
    <div className="space-y-2 border-l-4 border-[var(--border-strong)] pl-4">
      <p className="text-lg font-medium">
        {exact ? `${messages.scheduledNet}: ` : `${messages.scheduleReference}: `}
        {exact ? (
          <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
        ) : (
          launch.timing.net_utc.slice(0, 10)
        )}
      </p>
      <p className="leading-7 text-[var(--muted)]">
        {formatMessageTemplate(messages.providerPrecision, {
          abbreviation: launch.timing.precision_abbreviation,
          countdown: launch.timing.countdown_eligible
            ? messages.countdownEligibleDetail
            : messages.countdownIneligibleDetail,
          precision: launch.timing.precision_name,
        })}
      </p>
      {launch.timing.window_start_utc === null || launch.timing.window_end_utc === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.launchWindow, {
            end: launch.timing.window_end_utc,
            start: launch.timing.window_start_utc,
          })}
        </p>
      )}
    </div>
  );
}

function Unavailable({
  messages,
  response,
}: Readonly<{ messages: LaunchCenterMessages; response: LaunchDetailResponse }>) {
  return (
    <section className="max-w-2xl space-y-5" role="status">
      <h1 className="text-3xl font-semibold">{messages.detail.unavailableTitle}</h1>
      <p className="leading-7 text-[var(--muted)]">
        {response.unavailable_reason === "provider_disabled"
          ? messages.common.unavailableReasons.providerDisabled
          : response.unavailable_reason === "cached_content_expired"
            ? messages.common.unavailableReasons.cachedContentExpired
            : messages.common.unavailableReasons.noValidatedSnapshot}
      </p>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline"
        href="/now/launches"
      >
        {messages.common.backToLaunchCenter}
      </Link>
    </section>
  );
}

function TransportUnavailable({ messages }: Readonly<{ messages: LaunchCenterMessages }>) {
  return (
    <section className="max-w-2xl space-y-5" role="status">
      <h1 className="text-3xl font-semibold">{messages.detail.transportTitle}</h1>
      <p className="leading-7 text-[var(--muted)]">{messages.detail.transportDescription}</p>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline"
        href="/now/launches"
      >
        {messages.common.backToLaunchCenter}
      </Link>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{value}</dd>
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
