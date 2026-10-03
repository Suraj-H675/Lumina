import type { Metadata } from "next";
import Link from "next/link";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SystemScaleCompareMessages } from "../../../lib/i18n/messages/types";
import {
  SYSTEM_COMPARE_DEFINITION,
  SYSTEM_COMPARE_DISTANCE_UNIT,
  SYSTEM_COMPARE_ITEMS,
  systemCompareItemById,
} from "../../../lib/visualizations/system-scale-compare";
import styles from "../system-exploration.module.css";
import { SystemScaleCompareExplorer } from "./system-scale-compare-explorer";

export function createSystemScaleCompareMetadata(messages: SystemScaleCompareMessages): Metadata {
  return {
    alternates: { canonical: "/explore/system-compare" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default function SystemScaleComparePage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SystemScaleCompareMessages }>) {
  const defaults = SYSTEM_COMPARE_DEFINITION.default_item_ids.map((id) =>
    systemCompareItemById(id)!,
  );
  const formattedReferenceCount = formatLocaleNumber(SYSTEM_COMPARE_ITEMS.length, locale);

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
            <dt>{messages.model.title}</dt>
            <dd>{SYSTEM_COMPARE_DEFINITION.model_version}</dd>
          </div>
          <div className={styles.heroFact}>
            <dt>{messages.inventory.title}</dt>
            <dd>{formattedReferenceCount}</dd>
          </div>
        </dl>
      </header>

      <SystemScaleCompareExplorer locale={locale} messages={messages.explorer} />
      <DefaultComparison
        defaults={defaults}
        locale={locale}
        messages={messages.defaultComparison}
      />
      <ModelDisclosure messages={messages.model} />
      <ReferenceInventory locale={locale} messages={messages.inventory} />
    </div>
  );
}

function DefaultComparison({
  defaults,
  locale,
  messages,
}: Readonly<{
  defaults: NonNullable<ReturnType<typeof systemCompareItemById>>[];
  locale: PublishedLocale;
  messages: SystemScaleCompareMessages["defaultComparison"];
}>) {
  const [solar, exoplanet, voyager] = defaults;
  return (
    <section aria-labelledby="default-system-compare-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="default-system-compare-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionSummary}>
          {formatMessageTemplate(messages.description, {
            exoplanet: exoplanet!.name,
            solar: solar!.name,
            voyager: voyager!.name,
          })}
        </p>
      </div>
      <div className={`${styles.tableWrap} ${styles.sectionBody}`} tabIndex={0}>
        <table className={styles.table} style={{ minWidth: "52rem" }}>
          <thead>
            <tr>
              <th>{messages.headers.reference}</th>
              <th>{messages.headers.scientificQuantity}</th>
              <th>{messages.headers.value}</th>
              <th>
                {formatMessageTemplate(messages.headers.earthMultiple, {
                  unit: SYSTEM_COMPARE_DISTANCE_UNIT,
                })}
              </th>
            </tr>
          </thead>
          <tbody>
            {defaults.map((item) => (
              <tr key={item.id}>
                <th>{item.name}</th>
                <td>{item.quantity_label}</td>
                <td className={styles.dataValue}>
                  {formatLocaleFixedNumber(item.value_au, 6, locale)} {SYSTEM_COMPARE_DISTANCE_UNIT}
                </td>
                <td className={styles.dataValue}>
                  {formatLocaleFixedNumber(item.earth_reference_ratio, 3, locale)}×
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelDisclosure({
  messages,
}: Readonly<{ messages: SystemScaleCompareMessages["model"] }>) {
  return (
    <section aria-labelledby="system-compare-model-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="system-compare-model-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionSummary}>{messages.description}</p>
      </div>
      <div className={`${styles.modelGrid} ${styles.sectionBody}`}>
        <DisclosureList
          title={messages.assumptionsTitle}
          values={SYSTEM_COMPARE_DEFINITION.assumptions}
        />
        <DisclosureList
          title={messages.limitationsTitle}
          values={SYSTEM_COMPARE_DEFINITION.limitations}
        />
      </div>
    </section>
  );
}

function ReferenceInventory({
  locale,
  messages,
}: Readonly<{
  locale: PublishedLocale;
  messages: SystemScaleCompareMessages["inventory"];
}>) {
  const formattedCount = formatLocaleNumber(SYSTEM_COMPARE_ITEMS.length, locale);
  return (
    <section aria-labelledby="reference-inventory-heading" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="reference-inventory-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionSummary}>
          {formatMessageTemplate(messages.description, { count: formattedCount })}
        </p>
      </div>
      <details className={`${styles.inventoryDetails} ${styles.sectionBody}`}>
        <summary className={styles.inventorySummary}>
          {formatMessageTemplate(messages.summary, {
            count: formattedCount,
            unit: SYSTEM_COMPARE_DISTANCE_UNIT,
          })}
        </summary>
        <div className={styles.tableWrap} tabIndex={0}>
          <table className={styles.table} style={{ minWidth: "58rem" }}>
            <thead>
              <tr>
                <th>{messages.headers.group}</th>
                <th>{messages.headers.reference}</th>
                <th>{messages.headers.quantity}</th>
                <th>
                  {formatMessageTemplate(messages.headers.value, {
                    unit: SYSTEM_COMPARE_DISTANCE_UNIT,
                  })}
                </th>
                <th>{messages.headers.source}</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_COMPARE_ITEMS.map((item) => (
                <tr key={item.id}>
                  <td>{item.group_label}</td>
                  <th>{item.name}</th>
                  <td>{item.quantity_label}</td>
                  <td className={styles.dataValue}>
                    {formatLocaleFixedNumber(item.value_au, 6, locale)}
                  </td>
                  <td>
                    <a className={styles.inlineLink} href={item.source.url} rel="noreferrer">
                      {item.source.label}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function DisclosureList({
  title,
  values,
}: Readonly<{ title: string; values: ReadonlyArray<string> }>) {
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
