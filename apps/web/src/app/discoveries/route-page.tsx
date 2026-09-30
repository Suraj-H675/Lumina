import type { Metadata } from "next";
import Link from "next/link";

import {
  loadReviewedDiscoveries,
  type DiscoveryConfirmationState,
} from "../../lib/discoveries/content";
import type { DiscoveriesMessages } from "../../lib/i18n/messages/types";
import styles from "./discoveries-page.module.css";

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
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <div className={styles.heroAside}>
          <p className={styles.intro}>{messages.intro}</p>
          <p className={styles.reviewedAt}>
            {bundleReviewedPrefix}
            <time dateTime={bundle.reviewed_at}>{bundle.reviewed_at}</time>
            {bundleReviewedSuffix}
          </p>
        </div>
      </header>

      <section aria-labelledby="reviewed-discoveries-heading" className={styles.archive}>
        <div className={styles.archiveHeader}>
          <h2 className={styles.archiveTitle} id="reviewed-discoveries-heading">
            {messages.currentSetTitle}
          </h2>
        </div>
        <div className={styles.archiveList}>
          {bundle.entries.map((entry) => (
            <article className={styles.entry} key={entry.id}>
              <div className={styles.entryRail}>
                <div>
                  <p className={styles.entryEyebrow}>{entry.content_type}</p>
                  <p className={styles.entryDate}>
                    {messages.publishedLabel} {entry.publication_date}
                  </p>
                </div>
                <dl className={styles.facts}>
                  <Fact
                    label={messages.confirmationStateLabel}
                    value={confirmationLabel(entry.independent_confirmation_state, messages)}
                  />
                  <Fact
                    label={messages.eventDateLabel}
                    value={entry.event_date ?? messages.noSeparateEventDate}
                  />
                </dl>
              </div>
              <div className={styles.entryBody}>
                <h3 className={styles.entryTitle}>{entry.title}</h3>
                <p className={styles.summary}>{entry.summary}</p>
                <div className={styles.why}>
                  <h4>{messages.whyItMattersTitle}</h4>
                  <p>{entry.why_it_matters}</p>
                </div>
                <div className={styles.sources}>
                  <h4>{messages.reviewedSourcesTitle}</h4>
                  <ul className={styles.sourceList}>
                    {entry.sources.map((source) => (
                      <li key={source.url}>
                        <a
                          className={styles.sourceLink}
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
              </div>
            </article>
          ))}
        </div>
      </section>
      <Link className={styles.backLink} href="/">
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
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
