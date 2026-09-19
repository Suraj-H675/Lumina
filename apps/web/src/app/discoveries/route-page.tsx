import type { Metadata } from "next";
import Link from "next/link";

import {
  loadReviewedDiscoveries,
  type DiscoveryConfirmationState,
} from "../../lib/discoveries/content";
import type { DiscoveriesMessages } from "../../lib/i18n/messages/types";

export function discoveriesMetadata(messages: DiscoveriesMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export function DiscoveriesRoute({ messages }: Readonly<{ messages: DiscoveriesMessages }>) {
  const bundle = loadReviewedDiscoveries();
  const reviewedAtToken = "{reviewedAt}";
  const reviewedAtIndex = messages.bundleReviewed.indexOf(reviewedAtToken);
  if (
    reviewedAtIndex < 0 ||
    messages.bundleReviewed.indexOf(reviewedAtToken, reviewedAtIndex + reviewedAtToken.length) >= 0
  ) {
    throw new TypeError(
      "Discoveries bundleReviewed message must contain exactly one {reviewedAt}.",
    );
  }
  const bundleReviewedPrefix = messages.bundleReviewed.slice(0, reviewedAtIndex);
  const bundleReviewedSuffix = messages.bundleReviewed.slice(
    reviewedAtIndex + reviewedAtToken.length,
  );

  return (
    <article className="max-w-5xl space-y-10">
      <header className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.intro}</p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          {bundleReviewedPrefix}
          <time dateTime={bundle.reviewed_at}>{bundle.reviewed_at}</time>
          {bundleReviewedSuffix}
        </p>
      </header>

      <section aria-labelledby="reviewed-discoveries-heading" className="space-y-5">
        <h2 className="text-2xl font-semibold" id="reviewed-discoveries-heading">
          {messages.currentSetTitle}
        </h2>{" "}
        <div className="grid gap-5 lg:grid-cols-2">
          {bundle.entries.map((entry) => (
            <article
              className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-5"
              key={entry.id}
            >
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--accent)]">
                  {entry.content_type} · {messages.publishedLabel} {entry.publication_date}
                </p>
                <h3 className="text-xl font-semibold leading-7">{entry.title}</h3>
              </div>
              <p className="leading-7 text-[var(--muted)]">{entry.summary}</p>
              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <h4 className="font-semibold">{messages.whyItMattersTitle}</h4>
                <p className="leading-7 text-[var(--muted)]">{entry.why_it_matters}</p>
              </div>
              <dl className="grid gap-3 text-sm">
                <Fact
                  label={messages.confirmationStateLabel}
                  value={confirmationLabel(entry.independent_confirmation_state, messages)}
                />
                <Fact
                  label={messages.eventDateLabel}
                  value={entry.event_date ?? messages.noSeparateEventDate}
                />
              </dl>
              <div className="space-y-2">
                <h4 className="font-semibold">{messages.reviewedSourcesTitle}</h4>
                <ul className="space-y-2">
                  {entry.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        className="inline-flex min-h-11 items-center text-[var(--link)] underline underline-offset-4"
                        href={source.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {source.organization}: {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
      <Link className="inline-flex min-h-11 items-center text-[var(--link)] underline" href="/">
        {messages.backToMissionControl}
      </Link>
    </article>
  );
}

function confirmationLabel(
  value: DiscoveryConfirmationState,
  messages: DiscoveriesMessages,
): string {
  if (value === "peer-reviewed-publication") return messages.confirmation.peerReviewedPublication;
  if (value === "independently-confirmed") return messages.confirmation.independentlyConfirmed;
  return messages.confirmation.officialPrimaryOnly;
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-medium">{label}</dt>
      <dd className="text-[var(--muted)]">{value}</dd>
    </div>
  );
}
