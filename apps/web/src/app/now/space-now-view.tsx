import type { ApodResponse } from "@lumina/api-client";

import type { NowApodOutcome } from "../../lib/server/space-now";

export function SpaceNowView({ outcome }: Readonly<{ outcome: NowApodOutcome }>) {
  return (
    <article className="max-w-4xl space-y-10">
      <header className="max-w-2xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          Space Now
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Space Now</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          One carefully sourced Daily Visual from NASA Astronomy Picture of the Day, with its
          content date, credit, and Lumina retrieval state kept distinct.
        </p>
      </header>

      {outcome.kind === "ok" ? <DailyVisual response={outcome.data} /> : <UnavailableDailyVisual />}
    </article>
  );
}

function DailyVisual({ response }: Readonly<{ response: ApodResponse }>) {
  if (response.availability === "unavailable" || response.content === null) {
    return <UnavailableDailyVisual response={response} />;
  }

  const content = response.content;
  const pageUrl = fixedApodPageUrl(content.date, content.apod_page_url);
  const mediaLabel = content.media_type === "image" ? "Image" : "Video";
  const actionLabel =
    content.media_type === "image" ? "View today's APOD image" : "Watch today's APOD video";

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
            ? "Stale Daily Visual snapshot"
            : "Fresh Daily Visual snapshot"}
        </p>
        <p className="leading-7 text-[var(--muted)]">
          Freshness describes when Lumina last retrieved and validated this snapshot; it does not
          describe when the underlying image or video was created.
        </p>
      </div>

      <div className="space-y-5 border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
        <div className="space-y-3">
          <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
            Daily Visual
          </p>
          <h2 className="text-3xl font-semibold tracking-tight" id="daily-visual-heading">
            {content.title}
          </h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">APOD content date</dt>
              <dd className="text-[var(--muted)]">
                <time dateTime={content.date}>{content.date}</time>
              </dd>
            </div>
            <div>
              <dt className="font-medium">Media type</dt>
              <dd className="text-[var(--muted)]">{mediaLabel}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 border-t border-[var(--border)] pt-5">
          <h3 className="text-xl font-semibold">About this APOD</h3>
          <p className="whitespace-pre-line leading-8 text-[var(--muted)]">{content.explanation}</p>
        </div>

        {content.copyright === null ? null : (
          <p className="border-t border-[var(--border)] pt-5 text-sm leading-7 text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">Copyright / credit:</span>{" "}
            {content.copyright}
          </p>
        )}

        <div className="border-t border-[var(--border)] pt-5">
          {pageUrl === null ? (
            <p className="leading-7 text-[var(--muted)]">
              The official APOD page link is unavailable because the date-derived destination did
              not pass Lumina&apos;s fixed-origin check.
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
            Lumina does not automatically load or redistribute the external media. The official APOD
            page is opened only when you choose the action above.
          </p>
        </div>
      </div>

      <FreshnessDetails response={response} />
      <SourceDetails response={response} />
    </section>
  );
}

function FreshnessDetails({ response }: Readonly<{ response: ApodResponse }>) {
  const freshness = response.freshness;
  return (
    <section aria-labelledby="freshness-heading" className="space-y-4">
      <h2 className="text-xl font-semibold" id="freshness-heading">
        Lumina retrieval state
      </h2>
      <dl className="grid gap-4 border border-[var(--border)] p-5 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Cache state</dt>
          <dd className="text-[var(--muted)]">{freshness.cache_state}</dd>
        </div>
        <TimestampField label="Retrieved at (UTC)" value={freshness.retrieved_at} />
        <TimestampField label="Fresh until (UTC)" value={freshness.fresh_until} />
        <TimestampField label="Stale grace ends (UTC)" value={freshness.stale_until} />
        <div>
          <dt className="font-medium">Last safe refresh failure</dt>
          <dd className="text-[var(--muted)]">
            {freshness.last_refresh_failure_code ?? "None recorded"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function SourceDetails({ response }: Readonly<{ response: ApodResponse }>) {
  const source = response.source;
  return (
    <section aria-labelledby="source-heading" className="space-y-4">
      <h2 className="text-xl font-semibold" id="source-heading">
        Source and credit
      </h2>
      <div className="space-y-4 border border-[var(--border)] p-5">
        <p className="leading-7 text-[var(--muted)]">{source.attribution_text}</p>
        <p className="flex flex-wrap gap-x-5 gap-y-2 leading-7">
          <ExternalLink href={source.official_url}>Official APOD page</ExternalLink>
          <ExternalLink href={source.api_documentation_url}>NASA Open APIs</ExternalLink>
          <ExternalLink href={source.media_usage_url}>NASA media guidance</ExternalLink>
        </p>
      </div>
    </section>
  );
}

function UnavailableDailyVisual({ response }: Readonly<{ response?: ApodResponse }>) {
  const reason = response?.unavailable_reason;
  const detail =
    reason === "provider_disabled"
      ? "The Daily Visual provider is disabled."
      : reason === "no_cached_content"
        ? "No validated Daily Visual snapshot is available yet."
        : reason === "cached_content_expired"
          ? "The cached Daily Visual snapshot has expired."
          : "The Daily Visual could not be loaded from Lumina right now.";

  return (
    <section aria-labelledby="daily-visual-unavailable-heading" className="space-y-5">
      <div
        aria-live="polite"
        className="space-y-3 border-l-4 border-[var(--border-strong)] bg-[var(--surface)] p-5"
        role="status"
      >
        <h2 className="text-2xl font-semibold" id="daily-visual-unavailable-heading">
          Daily Visual is currently unavailable.
        </h2>
        <p className="leading-7 text-[var(--muted)]">{detail}</p>
      </div>
      {response === undefined ? null : (
        <>
          <FreshnessDetails response={response} />
          <SourceDetails response={response} />
        </>
      )}
    </section>
  );
}

function TimestampField({ label, value }: Readonly<{ label: string; value: string | null }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">
        {value === null ? "Not recorded" : <time dateTime={value}>{value}</time>}
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
