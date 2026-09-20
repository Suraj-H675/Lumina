import type { ApodResponse } from "@lumina/api-client";
import Link from "next/link";

import type { SpaceNowMessages } from "../../lib/i18n/messages/types";
import type { NowApodOutcome } from "../../lib/server/space-now";

export function SpaceNowView({
  messages,
  outcome,
}: Readonly<{ messages: SpaceNowMessages; outcome: NowApodOutcome }>) {
  return (
    <article className="max-w-4xl space-y-10">
      <header className="max-w-2xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.intro}</p>
      </header>

      {outcome.kind === "ok" ? (
        <DailyVisual messages={messages} response={outcome.data} />
      ) : (
        <UnavailableDailyVisual messages={messages} />
      )}
      <LaunchNavigation messages={messages.navigation.launches} />
      <SatelliteNavigation messages={messages.navigation.satellites} />
      <NearEarthNavigation messages={messages.navigation.nearEarth} />
      <SpaceWeatherNavigation messages={messages.navigation.spaceWeather} />
    </article>
  );
}

function LaunchNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["launches"] }>) {
  return (
    <section
      aria-labelledby="launch-navigation-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
        {messages.eyebrow}
      </p>
      <h2 className="text-2xl font-semibold" id="launch-navigation-heading">
        {messages.title}
      </h2>
      <p className="max-w-2xl leading-7 text-[var(--muted)]">{messages.description}</p>
      <Link
        className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline underline-offset-4"
        href="/now/launches"
      >
        {messages.action}
      </Link>
    </section>
  );
}

function SatelliteNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["satellites"] }>) {
  return (
    <section
      aria-labelledby="satellite-navigation-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
        {messages.eyebrow}
      </p>
      <h2 className="text-2xl font-semibold" id="satellite-navigation-heading">
        {messages.title}
      </h2>
      <p className="max-w-2xl leading-7 text-[var(--muted)]">{messages.description}</p>
      <Link
        className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline underline-offset-4"
        href="/now/satellites"
      >
        {messages.action}
      </Link>
    </section>
  );
}

function NearEarthNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["nearEarth"] }>) {
  return (
    <section
      aria-labelledby="near-earth-navigation-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
        {messages.eyebrow}
      </p>
      <h2 className="text-2xl font-semibold" id="near-earth-navigation-heading">
        {messages.title}
      </h2>
      <p className="max-w-2xl leading-7 text-[var(--muted)]">{messages.description}</p>
      <Link
        className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline underline-offset-4"
        href="/now/near-earth"
      >
        {messages.action}
      </Link>
    </section>
  );
}

function SpaceWeatherNavigation({
  messages,
}: Readonly<{ messages: SpaceNowMessages["navigation"]["spaceWeather"] }>) {
  return (
    <section
      aria-labelledby="space-weather-navigation-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
        {messages.eyebrow}
      </p>
      <h2 className="text-2xl font-semibold" id="space-weather-navigation-heading">
        {messages.title}
      </h2>
      <p className="max-w-2xl leading-7 text-[var(--muted)]">{messages.description}</p>
      <Link
        className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline underline-offset-4"
        href="/now/space-weather"
      >
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
    <section aria-labelledby="daily-visual-heading" className="space-y-7">
      <div
        aria-live="polite"
        className={
          response.availability === "stale"
            ? "space-y-2 border-l-4 border-[var(--focus)] bg-[var(--surface)] p-4"
            : "space-y-2 border-l-4 border-[var(--accent)] bg-[var(--surface)] p-4"
        }
        role="status"
      >
        <p className="font-semibold">
          {response.availability === "stale"
            ? messages.dailyVisual.staleSnapshot
            : messages.dailyVisual.freshSnapshot}
        </p>
        <p className="leading-7 text-[var(--muted)]">{messages.dailyVisual.freshnessDescription}</p>
      </div>

      <div className="space-y-5 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
        <div className="space-y-3">
          <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
            {messages.dailyVisual.eyebrow}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight" id="daily-visual-heading">
            {content.title}
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">{messages.dailyVisual.contentDateLabel}</dt>
              <dd className="text-[var(--muted)]">
                <time dateTime={content.date}>{content.date}</time>
              </dd>
            </div>
            <div>
              <dt className="font-medium">{messages.dailyVisual.mediaTypeLabel}</dt>
              <dd className="text-[var(--muted)]">{mediaLabel}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 border-t border-[var(--border)] pt-5">
          <h3 className="text-xl font-semibold">{messages.dailyVisual.aboutTitle}</h3>
          <p className="whitespace-pre-line leading-8 text-[var(--muted)]">{content.explanation}</p>
        </div>

        {content.copyright === null ? null : (
          <p className="border-t border-[var(--border)] pt-5 text-sm leading-7 text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">
              {messages.dailyVisual.copyrightLabel}
            </span>{" "}
            {content.copyright}
          </p>
        )}

        <div className="border-t border-[var(--border)] pt-5">
          {pageUrl === null ? (
            <p className="leading-7 text-[var(--muted)]">
              {messages.dailyVisual.invalidOfficialLink}
            </p>
          ) : (
            <a
              className="inline-flex min-h-11 items-center border border-[var(--accent)] px-4 font-semibold text-[var(--link)] underline underline-offset-4"
              href={pageUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {actionLabel}
            </a>
          )}
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            {messages.dailyVisual.externalMediaNotice}
          </p>
        </div>
      </div>

      <FreshnessDetails messages={messages.retrieval} response={response} />
      <SourceDetails messages={messages.source} response={response} />
    </section>
  );
}

function FreshnessDetails({
  messages,
  response,
}: Readonly<{ messages: SpaceNowMessages["retrieval"]; response: ApodResponse }>) {
  const freshness = response.freshness;
  return (
    <section aria-labelledby="freshness-heading" className="space-y-4">
      <h2 className="text-xl font-semibold" id="freshness-heading">
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
}: Readonly<{ messages: SpaceNowMessages["source"]; response: ApodResponse }>) {
  const source = response.source;
  return (
    <section aria-labelledby="source-heading" className="space-y-4">
      <h2 className="text-xl font-semibold" id="source-heading">
        {messages.title}
      </h2>
      <div className="space-y-4 border border-[var(--border)] p-5">
        <p className="leading-7 text-[var(--muted)]">{source.attribution_text}</p>
        <p className="flex flex-wrap gap-x-5 gap-y-2 leading-7">
          <ExternalLink href={source.official_url}>{messages.officialPage}</ExternalLink>
          <ExternalLink href={source.api_documentation_url}>
            {messages.apiDocumentation}
          </ExternalLink>
          <ExternalLink href={source.media_usage_url}>{messages.mediaGuidance}</ExternalLink>
        </p>
      </div>
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
    <section aria-labelledby="daily-visual-unavailable-heading" className="space-y-5">
      <div
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="daily-visual-unavailable-heading">
          {messages.unavailable.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails messages={messages.retrieval} response={response} />
          <SourceDetails messages={messages.source} response={response} />
        </>
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
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">
        {value === null ? notRecorded : <time dateTime={value}>{value}</time>}
      </dd>
    </div>
  );
}

function ExternalLink({ children, href }: Readonly<{ children: string; href: string }>) {
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

function fixedApodPageUrl(date: string, suppliedUrl: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (match === null) return null;
  const expected = `https://apod.nasa.gov/apod/ap${match[1]!.slice(2)}${match[2]}${match[3]}.html`;
  return suppliedUrl === expected ? expected : null;
}
