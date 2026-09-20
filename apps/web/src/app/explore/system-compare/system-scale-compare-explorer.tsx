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
    <div className="space-y-8">
      <section
        aria-labelledby="system-scale-compare-heading"
        className="space-y-6 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-4xl space-y-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
            {formatMessageTemplate(messages.modelEyebrow, {
              modelVersion: SYSTEM_COMPARE_DEFINITION.model_version,
            })}
          </p>
          <h2 className="text-2xl font-semibold" id="system-scale-compare-heading">
            {formatMessageTemplate(messages.title, { unit: SYSTEM_COMPARE_DISTANCE_UNIT })}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
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

        <div aria-label={messages.scaleAriaLabel} className="flex flex-wrap gap-2" role="group">
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

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">
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
        </div>

        <div className="space-y-5">
          {selected.map((item) => (
            <ScaleLane item={item} key={item.id} locale={locale} messages={messages} mode={mode} />
          ))}
        </div>
      </section>

      <section aria-labelledby="selected-reference-details" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="selected-reference-details">
          {messages.selectedDefinitionsTitle}
        </h2>
        <div className="grid gap-5 xl:grid-cols-3">
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
    <label className="space-y-2 font-semibold">
      <span className="block">{label}</span>
      <select
        className="min-h-11 w-full border border-[var(--border-strong)] bg-[var(--background)] px-3"
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
    <button
      aria-pressed={active}
      className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold aria-pressed:bg-[var(--foreground)] aria-pressed:text-[var(--background)]"
      onClick={onClick}
      type="button"
    >
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
      className="space-y-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{item.name}</h3>
        <span className="text-sm text-[var(--muted)]">{item.quantity_label}</span>
      </div>
      <div aria-hidden="true" className="relative h-5 border-l border-r border-[var(--border)]">
        <div
          className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--border-strong)]"
          style={{ width }}
        />
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current bg-[var(--background)]"
          style={{ left: width }}
        />
      </div>
      <p className="text-xs text-[var(--muted)]">
        {formatMessageTemplate(messages.laneSummary, {
          mode: modeLabel,
          position: formatLocaleFixedNumber(position, 2, locale),
          ratio: formatLocaleFixedNumber(item.earth_reference_ratio, 3, locale),
          unit: SYSTEM_COMPARE_DISTANCE_UNIT,
          value: formatLocaleFixedNumber(item.value_au, 6, locale),
        })}
      </p>
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
    <article aria-label={item.name} className="space-y-4 border border-[var(--border)] p-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
          {item.group_label}
        </p>
        <h3 className="mt-1 text-xl font-semibold">{item.name}</h3>
      </div>
      <dl className="space-y-3">
        <div>
          <dt className="text-sm text-[var(--muted)]">{messages.quantityLabel}</dt>
          <dd className="font-semibold">{item.quantity_label}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--muted)]">{messages.reviewedValueLabel}</dt>
          <dd className="font-mono">
            {formatLocaleFixedNumber(item.value_au, 6, locale)} {SYSTEM_COMPARE_DISTANCE_UNIT}
          </dd>
        </div>
        {item.epoch_tdb === undefined ? null : (
          <div>
            <dt className="text-sm text-[var(--muted)]">{messages.sampleEpochLabel}</dt>
            <dd className="font-mono text-sm">
              {item.epoch_tdb.replace("A.D. ", "")} {SYSTEM_COMPARE_TIME_SCALE}
            </dd>
          </div>
        )}
      </dl>
      <p className="text-sm leading-6 text-[var(--muted)]">{item.semantic_note}</p>
      <div className="flex flex-wrap gap-3">
        <a
          className="text-sm font-semibold text-[var(--link)] underline underline-offset-4"
          href={item.source.url}
          rel="noreferrer"
        >
          {messages.source}
        </a>
        <Link
          className="text-sm font-semibold text-[var(--link)] underline underline-offset-4"
          href={item.detail_href}
        >
          {messages.openSourceExplorer}
        </Link>
      </div>
    </article>
  );
}
