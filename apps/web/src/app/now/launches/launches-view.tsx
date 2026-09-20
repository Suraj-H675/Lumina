import type { LaunchItemResponse, LaunchListResponse } from "@lumina/api-client";
import Link from "next/link";

import {
  formatCountMessage,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { LaunchCenterMessages } from "../../../lib/i18n/messages/types";
import type { NowLaunchesOutcome } from "../../../lib/server/space-now";
import { LaunchCountdown } from "./launch-countdown";

export function LaunchesView({
  locale,
  messages,
  outcome,
}: Readonly<{
  locale: PublishedLocale;
  messages: LaunchCenterMessages;
  outcome: NowLaunchesOutcome;
}>) {
  if (outcome.kind !== "ok") return <TransportUnavailable messages={messages.list} />;
  const response = outcome.data;
  return (
    <article className="max-w-5xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {messages.list.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.list.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.list.intro}</p>
      </header>

      {response.availability === "unavailable" ? (
        <Unavailable messages={messages} response={response} />
      ) : (
        <>
          <FreshnessBanner messages={messages.list} response={response} />
          <section aria-labelledby="launch-list-heading" className="space-y-5">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold" id="launch-list-heading">
                {messages.list.currentSnapshotTitle}
              </h2>
              <p className="text-sm leading-6 text-[var(--muted)]">
                {formatCountMessage(
                  messages.list.snapshotCount,
                  response.returned_launch_count,
                  locale,
                  { total: formatLocaleNumber(response.total_launch_count, locale) },
                )}
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {response.launches.map((launch) => (
                <LaunchCard
                  key={launch.launch_id}
                  launch={launch}
                  locale={locale}
                  messages={messages}
                />
              ))}
            </div>
          </section>
          <SourceDetails messages={messages.list} response={response} />
        </>
      )}

      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/now">
        {messages.list.backToSpaceNow}
      </Link>
    </article>
  );
}

function LaunchCard({
  launch,
  locale,
  messages,
}: Readonly<{
  launch: LaunchItemResponse;
  locale: PublishedLocale;
  messages: LaunchCenterMessages;
}>) {
  return (
    <article className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-[var(--accent)]">{launch.status.abbreviation}</span>
          <span className="text-[var(--muted)]">{launch.status.name}</span>
        </div>
        <h3 className="text-xl font-semibold leading-7">
          <Link
            className="text-[var(--link)] underline underline-offset-4"
            href={`/now/launches/${launch.launch_id}`}
          >
            {launch.name}
          </Link>
        </h3>
      </div>
      <Schedule launch={launch} messages={messages.schedule} />
      {launch.timing.countdown_eligible ? (
        <LaunchCountdown
          locale={locale}
          messages={messages.countdown}
          targetUtc={launch.timing.net_utc}
        />
      ) : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact
          label={messages.list.facts.vehicle}
          value={launch.vehicle?.full_name ?? messages.common.notProvided}
        />
        <Fact
          label={messages.list.facts.launchProvider}
          value={launch.agency?.name ?? messages.common.notProvided}
        />
        <Fact
          label={messages.list.facts.mission}
          value={launch.mission?.name ?? messages.common.notProvided}
        />
        <Fact
          label={messages.list.facts.site}
          value={launch.site?.pad_name ?? messages.common.notProvided}
        />
      </dl>
      <p className="text-sm text-[var(--muted)]">
        {messages.list.providerRecordUpdatedLabel}{" "}
        <time dateTime={launch.timing.provider_updated_at}>
          {launch.timing.provider_updated_at}
        </time>
      </p>
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
      <p className="font-medium">
        {exact ? messages.scheduledNet : messages.scheduleReference}:{" "}
        {exact ? (
          <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
        ) : (
          launch.timing.net_utc.slice(0, 10)
        )}
      </p>
      <p className="text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.sourcePrecision, {
          abbreviation: launch.timing.precision_abbreviation,
          countdown: launch.timing.countdown_eligible
            ? messages.countdownEligibleList
            : messages.countdownIneligibleList,
          precision: launch.timing.precision_name,
        })}
      </p>
      {launch.timing.window_start_utc === null || launch.timing.window_end_utc === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.window, {
            end: launch.timing.window_end_utc,
            start: launch.timing.window_start_utc,
          })}
        </p>
      )}
    </div>
  );
}

function FreshnessBanner({
  messages,
  response,
}: Readonly<{ messages: LaunchCenterMessages["list"]; response: LaunchListResponse }>) {
  return (
    <section
      aria-live="polite"
      className="space-y-2 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4"
      role="status"
    >
      <p className="font-semibold">
        {response.availability === "stale" ? messages.staleSnapshot : messages.freshSnapshot}
      </p>
      <p className="leading-7 text-[var(--muted)]">
        {formatMessageTemplate(messages.retrievedCache, {
          retrievedAt: response.freshness.retrieved_at ?? messages.unrecordedTime,
        })}{" "}
        {formatMessageTemplate(messages.latestRecordUpdate, {
          updatedAt:
            response.freshness.snapshot_latest_updated_utc ?? messages.latestRecordNotRecorded,
        })}
      </p>
      {response.freshness.last_refresh_failure_code === null ? null : (
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.lastSafeRefreshFailure, {
            code: response.freshness.last_refresh_failure_code,
          })}
        </p>
      )}
    </section>
  );
}

function SourceDetails({
  messages,
  response,
}: Readonly<{ messages: LaunchCenterMessages["list"]; response: LaunchListResponse }>) {
  return (
    <section
      aria-labelledby="launch-source-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <h2 className="text-xl font-semibold" id="launch-source-heading">
        {messages.sourceTitle}
      </h2>
      <p className="leading-7 text-[var(--muted)]">{response.source.attribution_text}</p>
      <p className="flex flex-wrap gap-x-5 gap-y-2">
        <External href={response.source.official_documentation_url}>
          {messages.sourceDocumentation}
        </External>
        <External href={response.source.terms_url}>{messages.providerInformation}</External>
      </p>
    </section>
  );
}

function Unavailable({
  messages,
  response,
}: Readonly<{ messages: LaunchCenterMessages; response: LaunchListResponse }>) {
  const reason = response.unavailable_reason;
  const detail =
    reason === "provider_disabled"
      ? messages.common.unavailableReasons.providerDisabled
      : reason === "cached_content_expired"
        ? messages.common.unavailableReasons.cachedContentExpired
        : messages.common.unavailableReasons.noValidatedSnapshot;
  return (
    <section
      aria-labelledby="launch-unavailable-heading"
      className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
      role="status"
    >
      <h2 className="text-2xl font-semibold" id="launch-unavailable-heading">
        {messages.list.unavailableTitle}
      </h2>
      <p className="leading-7 text-[var(--muted)]">{detail}</p>
      <p className="text-sm text-[var(--muted)]">{messages.list.noBrowserProviderRequest}</p>
    </section>
  );
}

function TransportUnavailable({ messages }: Readonly<{ messages: LaunchCenterMessages["list"] }>) {
  return (
    <section
      aria-labelledby="launch-transport-heading"
      className="max-w-2xl space-y-4"
      role="status"
    >
      <h1 className="text-3xl font-semibold" id="launch-transport-heading">
        {messages.transportTitle}
      </h1>
      <p className="leading-7 text-[var(--muted)]">{messages.transportDescription}</p>
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
