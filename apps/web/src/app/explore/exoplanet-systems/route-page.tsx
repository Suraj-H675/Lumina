import type { Metadata } from "next";
import Link from "next/link";

import { formatLocaleNumber, formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { ExoplanetSystemsMessages } from "../../../lib/i18n/messages/types";
import {
  EXOPLANET_ARCHIVE_COLUMN_SET_NAME,
  EXOPLANET_ARCHIVE_TAP_NAME,
  EXOPLANET_DISTANCE_UNIT,
  EXOPLANET_RAW_SNAPSHOT,
  EXOPLANET_SYSTEM_DEFINITION,
} from "../../../lib/visualizations/exoplanet-systems";
import styles from "../system-exploration.module.css";
import { ExoplanetSystemExplorer } from "./exoplanet-system-explorer";

export function createExoplanetSystemsMetadata(messages: ExoplanetSystemsMessages): Metadata {
  return {
    alternates: { canonical: "/explore/exoplanet-systems" },
    title: messages.metadataTitle,
    description: formatMessageTemplate(messages.metadataDescription, {
      provider: EXOPLANET_RAW_SNAPSHOT.provider,
    }),
  };
}

export default function ExoplanetSystemsPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: ExoplanetSystemsMessages }>) {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/explore">
            {messages.backToExplore}
          </Link>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
          <p className={styles.intro}>{messages.intro}</p>
        </div>
        <dl className={styles.heroRail}>
          <div className={styles.heroFact}>
            <dt>{messages.provenance.providerLabel}</dt>
            <dd>{EXOPLANET_RAW_SNAPSHOT.provider}</dd>
          </div>
          <div className={styles.heroFact}>
            <dt>{messages.provenance.retrievedLabel}</dt>
            <dd>{EXOPLANET_RAW_SNAPSHOT.retrieved_at}</dd>
          </div>
        </dl>
      </header>

      <ExoplanetSystemExplorer locale={locale} messages={messages.explorer} />

      <section aria-labelledby="exoplanet-model-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="exoplanet-model-heading">
            {messages.model.title}
          </h2>
          <p className={styles.sectionSummary}>{messages.model.description}</p>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.modelGrid}>
            <ModelList
              title={messages.model.assumptionsTitle}
              values={EXOPLANET_SYSTEM_DEFINITION.assumptions}
            />
            <ModelList
              title={messages.model.limitationsTitle}
              values={EXOPLANET_SYSTEM_DEFINITION.limitations}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="exoplanet-provenance-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="exoplanet-provenance-heading">
            {messages.provenance.title}
          </h2>
          <p className={styles.sectionSummary}>
            {formatMessageTemplate(messages.provenance.description, {
              provider: EXOPLANET_RAW_SNAPSHOT.provider,
            })}
          </p>
        </div>
        <div className={styles.sectionBody}>
          <dl className={styles.provenanceGrid}>
            <ProvenanceFact
              label={messages.provenance.providerLabel}
              value={EXOPLANET_RAW_SNAPSHOT.provider}
            />
            <ProvenanceFact
              label={messages.provenance.archiveTableLabel}
              value={EXOPLANET_RAW_SNAPSHOT.table}
            />
            <ProvenanceFact
              label={messages.provenance.retrievedLabel}
              value={EXOPLANET_RAW_SNAPSHOT.retrieved_at}
            />
            <ProvenanceFact
              label={messages.provenance.bytesLabel}
              value={formatLocaleNumber(EXOPLANET_RAW_SNAPSHOT.bytes, locale, {
                useGrouping: false,
              })}
            />
            <div className={`${styles.provenanceFact} ${styles.provenanceFactWide}`}>
              <dt className={styles.factLabel}>{messages.provenance.shaLabel}</dt>
              <dd className={styles.factValue}>{EXOPLANET_RAW_SNAPSHOT.sha256}</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <a
              className={styles.actionLink}
              href={EXOPLANET_RAW_SNAPSHOT.documentation_url}
              rel="noreferrer"
            >
              {formatMessageTemplate(messages.provenance.tapDocumentation, {
                provider: EXOPLANET_RAW_SNAPSHOT.provider,
                tap: EXOPLANET_ARCHIVE_TAP_NAME,
              })}
            </a>
            <a
              className={styles.actionLink}
              href={EXOPLANET_RAW_SNAPSHOT.column_documentation_url}
              rel="noreferrer"
            >
              {formatMessageTemplate(messages.provenance.columnDocumentation, {
                columnSet: EXOPLANET_ARCHIVE_COLUMN_SET_NAME,
              })}
            </a>
          </div>
          <details className={styles.queryDetails}>
            <summary className={styles.querySummary}>
              {formatMessageTemplate(messages.provenance.querySummary, {
                tap: EXOPLANET_ARCHIVE_TAP_NAME,
              })}
            </summary>
            <p className={styles.queryText}>{EXOPLANET_RAW_SNAPSHOT.query}</p>
          </details>
        </div>
      </section>

      <section aria-labelledby="exoplanet-next-heading" className={styles.continuation}>
        <h2 className={styles.sectionTitle} id="exoplanet-next-heading">
          {messages.continue.title}
        </h2>
        <div>
          <p className={styles.sectionSummary}>
            {formatMessageTemplate(messages.continue.description, {
              unit: EXOPLANET_DISTANCE_UNIT,
            })}
          </p>
          <div className={styles.actions}>
            <Link className={styles.actionLink} href="/explore/solar-system">
              {messages.continue.action}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ModelList({ title, values }: Readonly<{ title: string; values: ReadonlyArray<string> }>) {
  return (
    <div className={styles.modelPanel}>
      <h3 className={styles.modelTitle}>{title}</h3>
      <ul className={styles.modelList}>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function ProvenanceFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.provenanceFact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}
