import type { LaunchItemResponse, LaunchListResponse } from "@nova-lumina/api-client";
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
import styles from "./launches-view.module.css";

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
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.list.eyebrow}</p>
          <h1 className={styles.title}>{messages.list.title}</h1>
        </div>
        <p className={styles.intro}>{messages.list.intro}</p>
      </header>

      {response.availability === "unavailable" ? (
        <Unavailable messages={messages} response={response} />
      ) : (
        <>
          <FreshnessBanner messages={messages.list} response={response} />
          <section aria-labelledby="launch-list-heading" className={styles.snapshot}>
            <div className={styles.snapshotHeader}>
              <p className={styles.sectionEyebrow}>{messages.list.eyebrow}</p>
              <h2 className={styles.snapshotTitle} id="launch-list-heading">
                {messages.list.currentSnapshotTitle}
              </h2>
              <p className={styles.snapshotCount}>
                {formatCountMessage(
                  messages.list.snapshotCount,
                  response.returned_launch_count,
                  locale,
                  { total: formatLocaleNumber(response.total_launch_count, locale) },
                )}
              </p>
            </div>
            <div className={styles.launchList}>
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

      <Link className={styles.backLink} href="/now">
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
    <article className={styles.launch}>
      <div className={styles.launchRail}>
        <p className={styles.status}>{launch.status.abbreviation}</p>
        <span className={styles.statusName}>{launch.status.name}</span>
        <p className={styles.updated}>
          {messages.list.providerRecordUpdatedLabel}{" "}
          <time dateTime={launch.timing.provider_updated_at}>
            {launch.timing.provider_updated_at}
          </time>
        </p>
      </div>
      <div className={styles.launchBody}>
        <h3 className={styles.launchTitle}>
          <Link href={`/now/launches/${launch.launch_id}`}>{launch.name}</Link>
        </h3>
        <Schedule launch={launch} messages={messages.schedule} />
        {launch.timing.countdown_eligible ? (
          <LaunchCountdown
            locale={locale}
            messages={messages.countdown}
            targetUtc={launch.timing.net_utc}
          />
        ) : null}
        <dl className={styles.facts}>
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
      </div>
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
    <div className={styles.schedule}>
      <p className={styles.schedulePrimary}>
        {exact ? messages.scheduledNet : messages.scheduleReference}:{" "}
        {exact ? (
          <time dateTime={launch.timing.net_utc}>{launch.timing.net_utc}</time>
        ) : (
          launch.timing.net_utc.slice(0, 10)
        )}
      </p>
      <p className={styles.scheduleDetail}>
        {formatMessageTemplate(messages.sourcePrecision, {
          abbreviation: launch.timing.precision_abbreviation,
          countdown: launch.timing.countdown_eligible
            ? messages.countdownEligibleList
            : messages.countdownIneligibleList,
          precision: launch.timing.precision_name,
        })}
      </p>
      {launch.timing.window_start_utc === null || launch.timing.window_end_utc === null ? null : (
        <p className={styles.window}>
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
      className={styles.freshness}
      data-state={response.availability}
      role="status"
    >
      <p className={styles.freshnessTitle}>
        {response.availability === "stale" ? messages.staleSnapshot : messages.freshSnapshot}
      </p>
      <p className={styles.freshnessCopy}>
        {formatMessageTemplate(messages.retrievedCache, {
          retrievedAt: response.freshness.retrieved_at ?? messages.unrecordedTime,
        })}{" "}
        {formatMessageTemplate(messages.latestRecordUpdate, {
          updatedAt:
            response.freshness.snapshot_latest_updated_utc ?? messages.latestRecordNotRecorded,
        })}
      </p>
      {response.freshness.last_refresh_failure_code === null ? null : (
        <p className={styles.failure}>
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
    <section aria-labelledby="launch-source-heading" className={styles.source}>
      <h2 className={styles.sourceTitle} id="launch-source-heading">
        {messages.sourceTitle}
      </h2>
      <div>
        <p className={styles.sourceCopy}>{response.source.attribution_text}</p>
        <p className={styles.sourceLinks}>
          <External href={response.source.official_documentation_url}>
            {messages.sourceDocumentation}
          </External>
          <External href={response.source.terms_url}>{messages.providerInformation}</External>
        </p>
      </div>
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
      className={styles.unavailable}
      role="status"
    >
      <h2 id="launch-unavailable-heading">{messages.list.unavailableTitle}</h2>
      <p>{detail}</p>
      <p className={styles.unavailableNote}>{messages.list.noBrowserProviderRequest}</p>
    </section>
  );
}

function TransportUnavailable({ messages }: Readonly<{ messages: LaunchCenterMessages["list"] }>) {
  return (
    <section aria-labelledby="launch-transport-heading" className={styles.transport} role="status">
      <h1 id="launch-transport-heading">{messages.transportTitle}</h1>
      <p>{messages.transportDescription}</p>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function External({ children, href }: Readonly<{ children: string; href: string }>) {
  return (
    <a className={styles.external} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}
