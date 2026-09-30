import type { Metadata } from "next";

import { ParticipateEnhanced } from "../../components/participate-enhanced";
import styles from "../../components/participate-experience.module.css";
import { ParticipateNoScript } from "../../components/participate-no-script";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { ParticipateMessages } from "../../lib/i18n/messages/types";
import { loadParticipate } from "../../lib/server/participate";

export function createParticipateMetadata(messages: ParticipateMessages): Metadata {
  return {
    alternates: { canonical: "/participate" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default async function ParticipatePage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: ParticipateMessages }>) {
  const outcome = await loadParticipate();
  if (outcome.kind !== "ok") {
    return (
      <article className={styles.unavailable}>
        <header className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{messages.eyebrow}</p>
            <h1 className={styles.title}>{messages.metadataTitle}</h1>
          </div>
        </header>
        <section
          aria-labelledby="participate-unavailable-heading"
          className={styles.unavailableMessage}
          role="alert"
        >
          <h2 id="participate-unavailable-heading">{messages.unavailable.title}</h2>
          <p>{messages.unavailable.description}</p>
        </section>
      </article>
    );
  }

  return (
    <>
      <ParticipateNoScript locale={locale} messages={messages} response={outcome.data} />
      <ParticipateEnhanced locale={locale} messages={messages} response={outcome.data} />
    </>
  );
}
