import type { ApodResponse } from "@nova-lumina/api-client";
import Link from "next/link";

import type { SpaceNowMessages } from "../../lib/i18n/messages/types";
import type { NowApodOutcome } from "../../lib/server/space-now";
import styles from "./space-now-view.module.css";

export function SpaceNowView({
  messages,
  outcome,
}: Readonly<{ messages: SpaceNowMessages; outcome: NowApodOutcome }>) {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <p className={styles.intro}>{messages.intro}</p>
      </header>

      {outcome.kind === "ok" ? (
        <DailyVisual messages={messages} response={outcome.data} />
      ) : (
        <UnavailableDailyVisual messages={messages} />
      )}
      <div className={styles.feeds}>
        <LaunchNavigation messages={messages.navigation.launches} />
        <SatelliteNavigation messages={messages.navigation.satellites} />
        <NearEarthNavigation messages={messages.navigation.nearEarth} />
        <SpaceWeatherNavigation messages={messages.navigation.spaceWeather} />
      </div>
    </article>
  );
}

function LaunchNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["launches"] }>) {
  return (
    <section aria-labelledby="launch-navigation-heading" className={styles.feed}>
      <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
      <h2 className={styles.feedTitle} id="launch-navigation-heading">
        {messages.title}
      </h2>
      <p className={styles.feedDescription}>{messages.description}</p>
      <Link className={styles.feedLink} href="/now/launches">
        {messages.action}
      </Link>
    </section>
  );
}

function SatelliteNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["satellites"] }>) {
  return (
    <section aria-labelledby="satellite-navigation-heading" className={styles.feed}>
      <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
      <h2 className={styles.feedTitle} id="satellite-navigation-heading">
        {messages.title}
      </h2>
      <p className={styles.feedDescription}>{messages.description}</p>
      <Link className={styles.feedLink} href="/now/satellites">
        {messages.action}
      </Link>
    </section>
  );
}

function NearEarthNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["nearEarth"] }>) {
  return (
    <section aria-labelledby="near-earth-navigation-heading" className={styles.feed}>
      <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
      <h2 className={styles.feedTitle} id="near-earth-navigation-heading">
        {messages.title}
      </h2>
      <p className={styles.feedDescription}>{messages.description}</p>
      <Link className={styles.feedLink} href="/now/near-earth">
        {messages.action}
      </Link>
    </section>
  );
}

function SpaceWeatherNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["spaceWeather"] }>) {
  return (
    <section aria-labelledby="space-weather-navigation-heading" className={styles.feed}>
      <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
      <h2 className={styles.feedTitle} id="space-weather-navigation-heading">
        {messages.title}
      </h2>
      <p className={styles.feedDescription}>{messages.description}</p>
      <Link className={styles.feedLink} href="/now/space-weather">
        {messages.action}
      </Link>
    </section>
  );
}

function DailyVisual({
  messages,
  response,
}: Readonly<{ messages: SpaceNowMessages; response: ApodResponse }>) {
  if (response.availability === "unavailable" || response.content === null) {
    return <UnavailableDailyVisual messages={messages} response={response} />;
  }

  const content = response.content;
  const pageUrl = fixedApodPageUrl(content.date, content.apod_page_url);
  const mediaLabel =
    content.media_type === "image"
      ? messages.dailyVisual.mediaTypes.image
      : messages.dailyVisual.mediaTypes.video;
  const actionLabel =
    content.media_type === "image"
      ? messages.dailyVisual.actions.image
      : messages.dailyVisual.actions.video;

  return (
    <section aria-labelledby="daily-visual-heading" className={styles.dailySection}>
      <div
        aria-live="polite"
        className={styles.freshnessBanner}
        data-state={response.availability}
        role="status"
      >
        <p className={styles.freshnessTitle}>
          {response.availability === "stale"
            ? messages.dailyVisual.staleSnapshot
            : messages.dailyVisual.freshSnapshot}
        </p>
        <p className={styles.freshnessDescription}>{messages.dailyVisual.freshnessDescription}</p>
      </div>

      <div className={styles.feature}>
        <div className={styles.featureMain}>
          <p className={styles.sectionEyebrow}>{messages.dailyVisual.eyebrow}</p>
          <h2 className={styles.featureTitle} id="daily-visual-heading">
            {content.title}
          </h2>
          <h3 className={styles.aboutTitle}>{messages.dailyVisual.aboutTitle}</h3>
          <p className={styles.explanation}>{content.explanation}</p>
        </div>

        <aside className={styles.featureMeta}>
          <dl className={styles.metaGrid}>
            <div>
              <dt>{messages.dailyVisual.contentDateLabel}</dt>
              <dd>
                <time dateTime={content.date}>{content.date}</time>
              </dd>
            </div>
            <div>
              <dt>{messages.dailyVisual.mediaTypeLabel}</dt>
              <dd>{mediaLabel}</dd>
            </div>
          </dl>
          {pageUrl === null ? (
            <p className={styles.invalidLink}>{messages.dailyVisual.invalidOfficialLink}</p>
          ) : (
            <a
              className={styles.officialLink}
              href={pageUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {actionLabel}
            </a>
          )}
          <p className={styles.mediaNotice}>{messages.dailyVisual.externalMediaNotice}</p>
          {content.copyright === null ? null : (
            <p className={styles.copyright}>
              <strong>{messages.dailyVisual.copyrightLabel}</strong> {content.copyright}
            </p>
          )}
        </aside>
      </div>

      <div className={styles.provenance}>
        <FreshnessDetails messages={messages.retrieval} response={response} />
        <SourceDetails messages={messages.source} response={response} />
      </div>
    </section>
  );
}

function FreshnessDetails({
  messages,
  response,
}: Readonly<{ messages: SpaceNowMessages["retrieval"]; response: ApodResponse }>) {
  const freshness = response.freshness;
  return (
    <section aria-labelledby="freshness-heading" className={styles.provenanceSection}>
      <h2 className={styles.provenanceTitle} id="freshness-heading">
        {messages.title}
      </h2>
      <dl className={styles.retrievalGrid}>
        <div>
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
          <dt>{messages.lastFailureLabel}</dt>
          <dd>{freshness.last_refresh_failure_code ?? messages.noneRecorded}</dd>
        </div>
      </dl>
    </section>
  );
}

function SourceDetails({
  messages,
  response,
}: Readonly<{ messages: SpaceNowMessages["source"]; response: ApodResponse }>) {
  const source = response.source;
  return (
    <section aria-labelledby="source-heading" className={styles.provenanceSection}>
      <h2 className={styles.provenanceTitle} id="source-heading">
        {messages.title}
      </h2>
      <p className={styles.sourceCopy}>{source.attribution_text}</p>
      <p className={styles.sourceLinks}>
        <ExternalLink href={source.official_url}>{messages.officialPage}</ExternalLink>
        <ExternalLink href={source.api_documentation_url}>{messages.apiDocumentation}</ExternalLink>
        <ExternalLink href={source.media_usage_url}>{messages.mediaGuidance}</ExternalLink>
      </p>
    </section>
  );
}

function UnavailableDailyVisual({
  messages,
  response,
}: Readonly<{ messages: SpaceNowMessages; response?: ApodResponse }>) {
  const reason = response?.unavailable_reason;
  const detail =
    reason === "provider_disabled"
      ? messages.unavailable.providerDisabled
      : reason === "no_cached_content"
        ? messages.unavailable.noCachedContent
        : reason === "cached_content_expired"
          ? messages.unavailable.cachedContentExpired
          : messages.unavailable.generic;

  return (
    <section aria-labelledby="daily-visual-unavailable-heading" className={styles.dailySection}>
      <div aria-live="polite" className={styles.unavailable} role="status">
        <h2 id="daily-visual-unavailable-heading">{messages.unavailable.title}</h2>
        <p>{detail}</p>
      </div>
      {response === undefined ? null : (
        <div className={styles.provenance}>
          <FreshnessDetails messages={messages.retrieval} response={response} />
          <SourceDetails messages={messages.source} response={response} />
        </div>
      )}
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
      <dt>{label}</dt>
      <dd>{value === null ? notRecorded : <time dateTime={value}>{value}</time>}</dd>
    </div>
  );
}

function ExternalLink({ children, href }: Readonly<{ children: string; href: string }>) {
  return (
    <a className={styles.externalLink} href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  );
}

function fixedApodPageUrl(date: string, suppliedUrl: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (match === null) return null;
  const expected = `https://apod.nasa.gov/apod/ap${match[1]!.slice(2)}${match[2]}${match[3]}.html`;
  return suppliedUrl === expected ? expected : null;
}
