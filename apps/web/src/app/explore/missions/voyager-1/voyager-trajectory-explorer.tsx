"use client";

import { useMemo, useState } from "react";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../../lib/i18n/format";
import type { PublishedLocale } from "../../../../lib/i18n/locales";
import type { VoyagerMessages } from "../../../../lib/i18n/messages/types";
import {
  VOYAGER_DISTANCE_UNIT,
  VOYAGER_HORIZONS_NAME,
  VOYAGER_HORIZONS_SHORT_NAME,
  VOYAGER_MISSION_NAME,
  VOYAGER_RADIUS_FORMULA,
  VOYAGER_REFERENCE_FRAME_LABEL,
  VOYAGER_SAMPLES,
  VOYAGER_TIME_SCALE,
  VOYAGER_X_AXIS_LABEL,
  VOYAGER_XY_AXES_LABEL,
  VOYAGER_Y_AXIS_LABEL,
  VOYAGER_Z_AXIS_LABEL,
  voyagerSampleYear,
  type VoyagerTrajectorySample,
} from "../../../../lib/visualizations/voyager-1";

export function VoyagerTrajectoryExplorer({
  centerBodyName,
  locale,
  messages,
}: Readonly<{
  centerBodyName: string;
  locale: PublishedLocale;
  messages: VoyagerMessages["trajectory"];
}>) {
  const [sampleIndex, setSampleIndex] = useState(VOYAGER_SAMPLES.length - 1);
  const sample = VOYAGER_SAMPLES[sampleIndex]!;

  return (
    <section
      aria-labelledby="voyager-trajectory-heading"
      className="space-y-6 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="max-w-4xl space-y-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {formatMessageTemplate(messages.eyebrow, { provider: VOYAGER_HORIZONS_NAME })}
        </p>
        <h2 className="text-2xl font-semibold" id="voyager-trajectory-heading">
          {formatMessageTemplate(messages.title, { mission: VOYAGER_MISSION_NAME })}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            center: centerBodyName,
            frame: VOYAGER_REFERENCE_FRAME_LABEL,
            xyAxes: VOYAGER_XY_AXES_LABEL,
            zAxis: VOYAGER_Z_AXIS_LABEL,
          })}
        </p>
      </div>

      <label className="block max-w-3xl space-y-2 font-semibold">
        <span>
          {formatMessageTemplate(messages.sampleLabel, {
            center: centerBodyName,
            distance: formatLocaleFixedNumber(sample.radius_au, 2, locale),
            unit: VOYAGER_DISTANCE_UNIT,
            year: formatLocaleNumber(voyagerSampleYear(sample), locale, { useGrouping: false }),
          })}
        </span>
        <input
          aria-label={formatMessageTemplate(messages.sliderAriaLabel, {
            mission: VOYAGER_MISSION_NAME,
          })}
          className="min-h-11 w-full"
          max={VOYAGER_SAMPLES.length - 1}
          min={0}
          onChange={(event) => setSampleIndex(Number(event.currentTarget.value))}
          step={1}
          type="range"
          value={sampleIndex}
        />
      </label>

      <div className="grid gap-6 xl:grid-cols-2">
        <TrajectoryProjection
          centerBodyName={centerBodyName}
          messages={messages.projection}
          selectedIndex={sampleIndex}
        />
        <DistanceHistory
          locale={locale}
          messages={messages.distanceHistory}
          selectedIndex={sampleIndex}
          valueWithUnit={messages.valueWithUnit}
        />
      </div>

      <SelectedVector locale={locale} messages={messages} sample={sample} />
    </section>
  );
}

function TrajectoryProjection({
  centerBodyName,
  messages,
  selectedIndex,
}: Readonly<{
  centerBodyName: string;
  messages: VoyagerMessages["trajectory"]["projection"];
  selectedIndex: number;
}>) {
  const plot = useMemo(() => {
    const maxAbs = Math.max(
      ...VOYAGER_SAMPLES.flatMap((sample) => [Math.abs(sample.x_au), Math.abs(sample.y_au)]),
    );
    const center = 260;
    const span = 225;
    const scale = span / maxAbs;
    const point = (sample: VoyagerTrajectorySample) => ({
      x: center + sample.x_au * scale,
      y: center - sample.y_au * scale,
    });
    return { center, points: VOYAGER_SAMPLES.map(point) };
  }, []);
  const selected = plot.points[selectedIndex]!;

  return (
    <figure className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-4">
      <figcaption className="space-y-1">
        <span className="block font-semibold">
          {formatMessageTemplate(messages.title, {
            frame: VOYAGER_REFERENCE_FRAME_LABEL,
            xyAxes: VOYAGER_XY_AXES_LABEL,
          })}
        </span>
        <span className="block text-xs leading-5 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            unit: VOYAGER_DISTANCE_UNIT,
            xAxis: VOYAGER_X_AXIS_LABEL,
            yAxis: VOYAGER_Y_AXIS_LABEL,
            zAxis: VOYAGER_Z_AXIS_LABEL,
          })}
        </span>
      </figcaption>
      <svg
        aria-label={formatMessageTemplate(messages.ariaLabel, {
          mission: VOYAGER_MISSION_NAME,
          xyAxes: VOYAGER_XY_AXES_LABEL,
        })}
        className="h-auto w-full"
        role="img"
        viewBox="0 0 520 520"
      >
        <line
          x1="20"
          x2="500"
          y1={plot.center}
          y2={plot.center}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <line
          x1={plot.center}
          x2={plot.center}
          y1="20"
          y2="500"
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <polyline
          fill="none"
          points={plot.points.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx={plot.center} cy={plot.center} fill="currentColor" r="5" />
        <circle
          cx={selected.x}
          cy={selected.y}
          fill="var(--background)"
          r="7"
          stroke="currentColor"
          strokeWidth="3"
        />
        <text fill="currentColor" fontSize="12" x={plot.center + 9} y={plot.center - 9}>
          {centerBodyName}
        </text>
        <text fill="currentColor" fontSize="12" x="430" y={plot.center - 8}>
          +{VOYAGER_X_AXIS_LABEL}
        </text>
        <text fill="currentColor" fontSize="12" x={plot.center + 8} y="28">
          +{VOYAGER_Y_AXIS_LABEL}
        </text>
      </svg>
    </figure>
  );
}

function DistanceHistory({
  locale,
  messages,
  selectedIndex,
  valueWithUnit,
}: Readonly<{
  locale: PublishedLocale;
  messages: VoyagerMessages["trajectory"]["distanceHistory"];
  selectedIndex: number;
  valueWithUnit: string;
}>) {
  const plot = useMemo(() => {
    const width = 520;
    const height = 260;
    const margin = 28;
    const maxRadius = Math.max(...VOYAGER_SAMPLES.map((sample) => sample.radius_au));
    const points = VOYAGER_SAMPLES.map((sample, index) => ({
      x: margin + (index / (VOYAGER_SAMPLES.length - 1)) * (width - margin * 2),
      y: height - margin - (sample.radius_au / maxRadius) * (height - margin * 2),
    }));
    return { height, margin, maxRadius, points, width };
  }, []);
  const selected = plot.points[selectedIndex]!;

  return (
    <figure className="space-y-3 border border-[var(--border)] bg-[var(--surface)] p-4">
      <figcaption className="space-y-1">
        <span className="block font-semibold">{messages.title}</span>
        <span className="block text-xs leading-5 text-[var(--muted)]">
          {formatMessageTemplate(messages.description, {
            formula: VOYAGER_RADIUS_FORMULA,
            provider: VOYAGER_HORIZONS_SHORT_NAME,
          })}
        </span>
      </figcaption>
      <svg
        aria-label={formatMessageTemplate(messages.ariaLabel, {
          mission: VOYAGER_MISSION_NAME,
        })}
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${plot.width} ${plot.height}`}
      >
        <line
          x1={plot.margin}
          x2={plot.margin}
          y1={plot.margin}
          y2={plot.height - plot.margin}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <line
          x1={plot.margin}
          x2={plot.width - plot.margin}
          y1={plot.height - plot.margin}
          y2={plot.height - plot.margin}
          stroke="currentColor"
          strokeOpacity="0.25"
        />
        <polyline
          fill="none"
          points={plot.points.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          cx={selected.x}
          cy={selected.y}
          fill="var(--background)"
          r="6"
          stroke="currentColor"
          strokeWidth="3"
        />
        <text fill="currentColor" fontSize="11" x={plot.margin + 4} y={plot.margin + 12}>
          {formatMessageTemplate(valueWithUnit, {
            unit: VOYAGER_DISTANCE_UNIT,
            value: formatLocaleFixedNumber(plot.maxRadius, 0, locale),
          })}
        </text>
        <text fill="currentColor" fontSize="11" x={plot.margin} y={plot.height - 6}>
          {formatLocaleNumber(voyagerSampleYear(VOYAGER_SAMPLES[0]!), locale, {
            useGrouping: false,
          })}
        </text>
        <text fill="currentColor" fontSize="11" x={plot.width - 56} y={plot.height - 6}>
          {formatLocaleNumber(voyagerSampleYear(VOYAGER_SAMPLES.at(-1)!), locale, {
            useGrouping: false,
          })}
        </text>
      </svg>
    </figure>
  );
}

function SelectedVector({
  locale,
  messages,
  sample,
}: Readonly<{
  locale: PublishedLocale;
  messages: VoyagerMessages["trajectory"];
  sample: VoyagerTrajectorySample;
}>) {
  return (
    <section aria-labelledby="selected-voyager-vector-heading" className="space-y-4">
      <h3 className="text-xl font-semibold" id="selected-voyager-vector-heading">
        {formatMessageTemplate(messages.selectedVectorTitle, {
          provider: VOYAGER_HORIZONS_SHORT_NAME,
          year: formatLocaleNumber(voyagerSampleYear(sample), locale, { useGrouping: false }),
        })}
      </h3>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <VectorFact
          label={formatMessageTemplate(messages.vectorLabels.epoch, {
            timeScale: VOYAGER_TIME_SCALE,
          })}
          value={sample.epoch_tdb.replace("A.D. ", "")}
        />
        <VectorFact
          label={VOYAGER_X_AXIS_LABEL}
          value={formatVectorValue(sample.x_au, locale, messages.valueWithUnit)}
        />
        <VectorFact
          label={VOYAGER_Y_AXIS_LABEL}
          value={formatVectorValue(sample.y_au, locale, messages.valueWithUnit)}
        />
        <VectorFact
          label={VOYAGER_Z_AXIS_LABEL}
          value={formatVectorValue(sample.z_au, locale, messages.valueWithUnit)}
        />
        <VectorFact
          label={messages.vectorLabels.distance}
          value={formatVectorValue(sample.radius_au, locale, messages.valueWithUnit)}
        />
      </dl>
    </section>
  );
}

function VectorFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-3">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words font-mono text-sm">{value}</dd>
    </div>
  );
}

function formatVectorValue(value: number, locale: PublishedLocale, template: string): string {
  return formatMessageTemplate(template, {
    unit: VOYAGER_DISTANCE_UNIT,
    value: formatLocaleFixedNumber(value, 6, locale),
  });
}
