"use client";

import Link from "next/link";
import { useState } from "react";

import {
  SYSTEM_COMPARE_DEFINITION,
  SYSTEM_COMPARE_EXOPLANET_ITEMS,
  SYSTEM_COMPARE_SOLAR_ITEMS,
  SYSTEM_COMPARE_VOYAGER_ITEMS,
  systemCompareItemById,
  systemComparePosition,
  type SystemCompareItem,
  type SystemCompareScaleMode,
} from "../../../lib/visualizations/system-scale-compare";

export function SystemScaleCompareExplorer() {
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
            Cross-model comparison · {SYSTEM_COMPARE_DEFINITION.model_version}
          </p>
          <h2 className="text-2xl font-semibold" id="system-scale-compare-heading">
            Three AU-valued references, three different scientific meanings
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            A shared unit makes numeric scale comparison possible. It does not make mean Sun
            distance, orbit semi-major axis, and heliocentric vector magnitude interchangeable.
            Lumina keeps each definition and source attached.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ItemSelect
            items={SYSTEM_COMPARE_SOLAR_ITEMS}
            label="Solar System reference"
            onChange={setSolarId}
            value={solarId}
          />
          <ItemSelect
            items={SYSTEM_COMPARE_EXOPLANET_ITEMS}
            label="Exoplanet orbital reference"
            onChange={setExoplanetId}
            value={exoplanetId}
          />
          <ItemSelect
            items={SYSTEM_COMPARE_VOYAGER_ITEMS}
            label="Voyager annual reference"
            onChange={setVoyagerId}
            value={voyagerId}
          />
        </div>

        <div aria-label="Shared comparison scale" className="flex flex-wrap gap-2" role="group">
          <ScaleButton active={mode === "log"} onClick={() => setMode("log")}>
            Log AU scale
          </ScaleButton>
          <ScaleButton active={mode === "linear"} onClick={() => setMode("linear")}>
            Linear AU scale
          </ScaleButton>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">
          {mode === "log"
            ? `Log display maps the complete reviewed ${SYSTEM_COMPARE_DEFINITION.shared_domain_au.minimum.toFixed(4)}–${SYSTEM_COMPARE_DEFINITION.shared_domain_au.maximum.toFixed(2)} AU domain. Spacing is a visualization transform, not physical placement between systems.`
            : `Linear display maps every numeric length against the same ${SYSTEM_COMPARE_DEFINITION.shared_domain_au.maximum.toFixed(2)} AU maximum. Small orbital references will cluster near zero by design.`}
        </div>

        <div className="space-y-5">
          {selected.map((item) => (
            <ScaleLane item={item} key={item.id} mode={mode} />
          ))}
        </div>
      </section>

      <section aria-labelledby="selected-reference-details" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="selected-reference-details">
          Selected reference definitions
        </h2>
        <div className="grid gap-5 xl:grid-cols-3">
          {selected.map((item) => (
            <ReferenceCard item={item} key={item.id} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ItemSelect({
  items,
  label,
  onChange,
  value,
}: Readonly<{
  items: ReadonlyArray<SystemCompareItem>;
  label: string;
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
            {item.name} · {item.value_au.toFixed(item.value_au >= 10 ? 2 : 4)} AU
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
  mode,
}: Readonly<{ item: SystemCompareItem; mode: SystemCompareScaleMode }>) {
  const position = systemComparePosition(item, mode);
  const width = `${Math.max(0, Math.min(100, position))}%`;
  return (
    <section aria-label={`${item.name} shared scale reference`} className="space-y-2">
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
        {item.value_au.toFixed(6)} AU · {position.toFixed(2)}% of shared {mode} display · numeric
        length is {item.earth_reference_ratio.toFixed(3)}× the 1 AU arithmetic reference
      </p>
    </section>
  );
}

function ReferenceCard({ item }: Readonly<{ item: SystemCompareItem }>) {
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
          <dt className="text-sm text-[var(--muted)]">Quantity</dt>
          <dd className="font-semibold">{item.quantity_label}</dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--muted)]">Reviewed numeric value</dt>
          <dd className="font-mono">{item.value_au.toFixed(6)} AU</dd>
        </div>
        {item.epoch_tdb === undefined ? null : (
          <div>
            <dt className="text-sm text-[var(--muted)]">Sample epoch</dt>
            <dd className="font-mono text-sm">{item.epoch_tdb.replace("A.D. ", "")} TDB</dd>
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
          Source ↗
        </a>
        <Link
          className="text-sm font-semibold text-[var(--link)] underline underline-offset-4"
          href={item.detail_href}
        >
          Open source explorer →
        </Link>
      </div>
    </article>
  );
}
