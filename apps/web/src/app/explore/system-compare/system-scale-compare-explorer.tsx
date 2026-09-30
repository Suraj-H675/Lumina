"use client";

import Link from "next/link";
import { useState } from "react";

import { formatLocaleFixedNumber, formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SystemScaleCompareMessages } from "../../../lib/i18n/messages/types";
import {
  SYSTEM_COMPARE_DEFINITION,
  SYSTEM_COMPARE_DISTANCE_UNIT,
  SYSTEM_COMPARE_EXOPLANET_ITEMS,
  SYSTEM_COMPARE_SOLAR_ITEMS,
  SYSTEM_COMPARE_TIME_SCALE,
  SYSTEM_COMPARE_VOYAGER_ITEMS,
  systemCompareItemById,
  systemComparePosition,
  type SystemCompareItem,
  type SystemCompareScaleMode,
} from "../../../lib/visualizations/system-scale-compare";
import styles from "../system-exploration.module.css";

export function SystemScaleCompareExplorer({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SystemScaleCompareMessages["explorer"] }>) {
  const [mode, setMode] = useState<SystemCompareScaleMode>("log");
  const [solarId, setSolarId] = useState("solar:earth");
  const [exoplanetId, setExoplanetId] = useState("exoplanet:kepler-452-b");
  const [voyagerId, setVoyagerId] = useState("voyager:2026");
  const selected = [solarId, exoplanetId, voyagerId].map((id) => systemCompareItemById(id)!);

  return (
    <div className={styles.instrumentStack}>
      <section aria-labelledby="system-scale-compare-heading" className={styles.instrument}>
        <div className={styles.instrumentHeader}>
          <div>
            <p className={styles.instrumentEyebrow}>
              {formatMessageTemplate(messages.modelEyebrow, {
                modelVersion: SYSTEM_COMPARE_DEFINITION.model_version,
              })}
            </p>
            <h2 className={styles.instrumentTitle} id="system-scale-compare-heading">
              {formatMessageTemplate(messages.title, { unit: SYSTEM_COMPARE_DISTANCE_UNIT })}
            </h2>
          </div>
          <p className={styles.instrumentDescription}>{messages.description}</p>
        </div>

        <div className={styles.selectorGrid}>
          <ItemSelect
            items={SYSTEM_COMPARE_SOLAR_ITEMS}
            label={messages.referenceSelect.solarLabel}
            locale={locale}
            optionTemplate={messages.referenceSelect.optionValue}
            onChange={setSolarId}
            value={solarId}
          />
          <ItemSelect
            items={SYSTEM_COMPARE_EXOPLANET_ITEMS}
            label={messages.referenceSelect.exoplanetLabel}
            locale={locale}
            optionTemplate={messages.referenceSelect.optionValue}
            onChange={setExoplanetId}
            value={exoplanetId}
          />
          <ItemSelect
            items={SYSTEM_COMPARE_VOYAGER_ITEMS}
            label={messages.referenceSelect.voyagerLabel}
            locale={locale}
            optionTemplate={messages.referenceSelect.optionValue}
            onChange={setVoyagerId}
            value={voyagerId}
          />
        </div>

        <div className={styles.scaleControls}>
          <div aria-label={messages.scaleAriaLabel} className={styles.scaleToggle} role="group">
            <ScaleButton active={mode === "log"} onClick={() => setMode("log")}>
              {formatMessageTemplate(messages.scaleModes.logAction, {
                unit: SYSTEM_COMPARE_DISTANCE_UNIT,
              })}
            </ScaleButton>
            <ScaleButton active={mode === "linear"} onClick={() => setMode("linear")}>
              {formatMessageTemplate(messages.scaleModes.linearAction, {
                unit: SYSTEM_COMPARE_DISTANCE_UNIT,
              })}
            </ScaleButton>
          </div>
          <p className={styles.scaleNote}>
            {mode === "log"
              ? formatMessageTemplate(messages.scaleModes.logDescription, {
                  maximum: formatLocaleFixedNumber(
                    SYSTEM_COMPARE_DEFINITION.shared_domain_au.maximum,
                    2,
                    locale,
                  ),
                  minimum: formatLocaleFixedNumber(
                    SYSTEM_COMPARE_DEFINITION.shared_domain_au.minimum,
                    4,
                    locale,
                  ),
                  unit: SYSTEM_COMPARE_DISTANCE_UNIT,
                })
              : formatMessageTemplate(messages.scaleModes.linearDescription, {
                  maximum: formatLocaleFixedNumber(
                    SYSTEM_COMPARE_DEFINITION.shared_domain_au.maximum,
                    2,
                    locale,
                  ),
                  unit: SYSTEM_COMPARE_DISTANCE_UNIT,
                })}
          </p>
        </div>

        <div className={styles.trackList}>
          {selected.map((item) => (
            <ScaleLane item={item} key={item.id} locale={locale} messages={messages} mode={mode} />
          ))}
        </div>
      </section>

      <section aria-labelledby="selected-reference-details" className={styles.tableSection}>
        <h2 className={styles.tableTitle} id="selected-reference-details">
          {messages.selectedDefinitionsTitle}
        </h2>
        <div className={styles.cardGrid}>
          {selected.map((item) => (
            <ReferenceCard item={item} key={item.id} locale={locale} messages={messages.card} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ItemSelect({
  items,
  label,
  locale,
  optionTemplate,
  onChange,
  value,
}: Readonly<{
  items: ReadonlyArray<SystemCompareItem>;
  label: string;
  locale: PublishedLocale;
  optionTemplate: string;
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <label className={styles.selectLabel}>
      <span>{label}</span>
      <select
        className={styles.selectInput}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {formatMessageTemplate(optionTemplate, {
              name: item.name,
              unit: SYSTEM_COMPARE_DISTANCE_UNIT,
              value: formatLocaleFixedNumber(item.value_au, item.value_au >= 10 ? 2 : 4, locale),
            })}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScaleButton({
  active,
  children,
  onClick,
}: Readonly<{ active: boolean; children: React.ReactNode; onClick: () => void }>) {
  return (
    <button aria-pressed={active} className={styles.scaleButton} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function ScaleLane({
  item,
  locale,
  messages,
  mode,
}: Readonly<{
  item: SystemCompareItem;
  locale: PublishedLocale;
  messages: SystemScaleCompareMessages["explorer"];
  mode: SystemCompareScaleMode;
}>) {
  const position = systemComparePosition(item, mode);
  const width = `${Math.max(0, Math.min(100, position))}%`;
  const modeLabel = mode === "log" ? messages.scaleModes.logName : messages.scaleModes.linearName;
  return (
    <section
      aria-label={formatMessageTemplate(messages.laneAriaLabel, { name: item.name })}
      className={styles.trackRow}
    >
      <h3>{item.name}</h3>
      <div className={styles.trackBody}>
        <div className={styles.trackHeader}>
          <span className={styles.trackMeta}>{item.quantity_label}</span>
        </div>
        <div aria-hidden="true" className={styles.trackRail}>
          <div className={styles.trackFill} style={{ width }} />
          <span className={styles.trackMarker} style={{ left: width }} />
        </div>
        <p className={styles.trackSummary}>
          {formatMessageTemplate(messages.laneSummary, {
            mode: modeLabel,
            position: formatLocaleFixedNumber(position, 2, locale),
            ratio: formatLocaleFixedNumber(item.earth_reference_ratio, 3, locale),
            unit: SYSTEM_COMPARE_DISTANCE_UNIT,
            value: formatLocaleFixedNumber(item.value_au, 6, locale),
          })}
        </p>
      </div>
    </section>
  );
}

function ReferenceCard({
  item,
  locale,
  messages,
}: Readonly<{
  item: SystemCompareItem;
  locale: PublishedLocale;
  messages: SystemScaleCompareMessages["explorer"]["card"];
}>) {
  return (
    <article aria-label={item.name} className={styles.card}>
      <div>
        <p className={styles.cardEyebrow}>{item.group_label}</p>
        <h3 className={styles.cardTitle}>{item.name}</h3>
      </div>
      <dl className={styles.cardDefinitionList}>
        <div>
          <dt>{messages.quantityLabel}</dt>
          <dd>{item.quantity_label}</dd>
        </div>
        <div>
          <dt>{messages.reviewedValueLabel}</dt>
          <dd>
            {formatLocaleFixedNumber(item.value_au, 6, locale)} {SYSTEM_COMPARE_DISTANCE_UNIT}
          </dd>
        </div>
        {item.epoch_tdb === undefined ? null : (
          <div>
            <dt>{messages.sampleEpochLabel}</dt>
            <dd>
              {item.epoch_tdb.replace("A.D. ", "")} {SYSTEM_COMPARE_TIME_SCALE}
            </dd>
          </div>
        )}
      </dl>
      <p className={styles.cardText}>{item.semantic_note}</p>
      <div className={styles.cardActions}>
        <a className={styles.inlineLink} href={item.source.url} rel="noreferrer">
          {messages.source}
        </a>
        <Link className={styles.inlineLink} href={item.detail_href}>
          {messages.openSourceExplorer}
        </Link>
      </div>
    </article>
  );
}
