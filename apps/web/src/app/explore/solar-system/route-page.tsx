import type { Metadata } from "next";
import Link from "next/link";

import { formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SolarSystemDistanceMessages } from "../../../lib/i18n/messages/types";
import {
  SOLAR_SYSTEM_DEFINITION,
  SOLAR_SYSTEM_PROVIDER_NAME,
  SOLAR_SYSTEM_SOURCES,
} from "../../../lib/visualizations/solar-system-distance";
import styles from "../system-exploration.module.css";
import { SolarSystemDistanceExplorer } from "./solar-system-distance-explorer";

export function createSolarSystemDistanceMetadata(messages: SolarSystemDistanceMessages): Metadata {
  return {
    alternates: { canonical: "/explore/solar-system" },
    title: messages.metadataTitle,
    description: messages.metadataDescription,
  };
}

export default function SolarSystemPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SolarSystemDistanceMessages }>) {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <Link className={styles.backLink} href="/explore">
            {messages.backToExplore}
          </Link>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
          <p className={styles.intro}>
            {formatMessageTemplate(messages.intro, { provider: SOLAR_SYSTEM_PROVIDER_NAME })}
          </p>
        </div>
        <dl className={styles.heroRail}>
          <div className={styles.heroFact}>
            <dt>{messages.model.title}</dt>
            <dd>{SOLAR_SYSTEM_DEFINITION.model_version}</dd>
          </div>
          <div className={styles.heroFact}>
            <dt>{messages.sources.title}</dt>
            <dd>{SOLAR_SYSTEM_PROVIDER_NAME}</dd>
          </div>
        </dl>
      </header>

      <SolarSystemDistanceExplorer locale={locale} messages={messages.explorer} />

      <section aria-labelledby="model-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="model-heading">
            {messages.model.title}
          </h2>
          <p className={styles.sectionSummary}>{messages.model.description}</p>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.modelGrid}>
            <ModelList
              title={messages.model.assumptionsTitle}
              values={SOLAR_SYSTEM_DEFINITION.assumptions}
            />
            <ModelList
              title={messages.model.limitationsTitle}
              values={SOLAR_SYSTEM_DEFINITION.limitations}
            />
          </div>
          <dl className={styles.formulaGrid}>
            <div className={styles.formula}>
              <dt>{messages.model.logMappingLabel}</dt>
              <dd>{SOLAR_SYSTEM_DEFINITION.calculation.log_distance}</dd>
            </div>
            <div className={styles.formula}>
              <dt>{messages.model.linearMappingLabel}</dt>
              <dd>{SOLAR_SYSTEM_DEFINITION.calculation.linear_distance}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="sources-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} id="sources-heading">
            {messages.sources.title}
          </h2>
          <p className={styles.sectionSummary}>{messages.sources.description}</p>
        </div>
        <ul className={`${styles.sourceList} ${styles.sectionBody}`}>
          {SOLAR_SYSTEM_SOURCES.map((source) => (
            <li className={styles.sourceItem} key={source.id}>
              <div>
                <a className={styles.sourceLink} href={source.url} rel="noreferrer">
                  {source.title}
                </a>
                <p className={styles.sourceOrg}>{source.organization_or_authors}</p>
              </div>
              <div>
                <p className={styles.sourceScope}>{source.claim_scope}</p>
                <p className={styles.sourceCitation}>{source.citation}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="next-comparison-heading" className={styles.continuation}>
        <h2 className={styles.sectionTitle} id="next-comparison-heading">
          {messages.continue.title}
        </h2>
        <div>
          <p className={styles.sectionSummary}>{messages.continue.description}</p>
          <div className={styles.actions}>
            <Link className={styles.actionLink} href="/lab/scale-explorer">
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
