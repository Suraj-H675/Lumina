"use client";

import Link from "next/link";
import { useState } from "react";

import {
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SolarSystemDistanceMessages } from "../../../lib/i18n/messages/types";
import {
  SOLAR_SYSTEM_BODIES,
  SOLAR_SYSTEM_DEFINITION,
  SOLAR_SYSTEM_DISTANCE_UNIT,
  SOLAR_SYSTEM_PLANETS,
  SOLAR_SYSTEM_PROVIDER_NAME,
  solarSystemBodyById,
  solarSystemPosition,
  type SolarSystemBody,
  type SolarSystemBodyId,
  type SolarSystemScaleMode,
} from "../../../lib/visualizations/solar-system-distance";

const DEFAULT_BODY_ID: SolarSystemBodyId = "earth";

export function SolarSystemDistanceExplorer({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SolarSystemDistanceMessages["explorer"] }>) {
  const [mode, setMode] = useState<SolarSystemScaleMode>("log");
  const [selectedId, setSelectedId] = useState<SolarSystemBodyId>(DEFAULT_BODY_ID);
  const selected = solarSystemBodyById(selectedId) ?? SOLAR_SYSTEM_BODIES[3]!;

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="system-model-heading"
        className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-4xl space-y-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
            {formatMessageTemplate(messages.modelEyebrow, {
              modelVersion: SOLAR_SYSTEM_DEFINITION.model_version,
            })}
          </p>
          <h2 className="text-2xl font-semibold" id="system-model-heading">
            {messages.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.description, {
              provider: SOLAR_SYSTEM_PROVIDER_NAME,
            })}
          </p>
        </div>

        <div aria-label={messages.scaleAriaLabel} className="flex flex-wrap gap-2" role="group">
          <ScaleButton active={mode === "log"} onClick={() => setMode("log")}>
            {messages.scaleModes.logAction}
          </ScaleButton>
          <ScaleButton active={mode === "linear"} onClick={() => setMode("linear")}>
            {messages.scaleModes.linearAction}
          </ScaleButton>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <p className="text-sm leading-6 text-[var(--muted)]">
            {mode === "log"
              ? formatMessageTemplate(messages.logDescription, {
                  unit: SOLAR_SYSTEM_DISTANCE_UNIT,
                })
              : messages.linearDescription}
          </p>
        </div>

        <div className="space-y-3" data-testid="solar-system-distance-track">
          <OriginRow
            messages={messages}
            selected={selectedId === "sun"}
            onSelect={() => setSelectedId("sun")}
          />
          {SOLAR_SYSTEM_PLANETS.map((planet) => (
            <PlanetDistanceRow
              key={planet.id}
              locale={locale}
              messages={messages}
              mode={mode}
              onSelect={() => setSelectedId(planet.id)}
              planet={planet}
              selected={planet.id === selectedId}
            />
          ))}
        </div>
      </section>

      <SelectedBody body={selected} locale={locale} messages={messages} />
      <DistanceTable
        locale={locale}
        messages={messages.dataAlternative}
        valueWithUnit={messages.valueWithUnit}
      />
    </div>
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

function OriginRow({
  messages,
  selected,
  onSelect,
}: Readonly<{
  messages: SolarSystemDistanceMessages["explorer"];
  selected: boolean;
  onSelect: () => void;
}>) {
  const sun = SOLAR_SYSTEM_BODIES[0]!;
  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-center">
      <button
        aria-pressed={selected}
        className="min-h-11 text-left font-semibold text-[var(--link)] underline underline-offset-4"
        onClick={onSelect}
        type="button"
      >
        {sun.name}
      </button>
      <div className="flex min-h-11 items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block size-3 shrink-0 rounded-full border border-current"
        />
        <span className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.sunOrigin, {
            unit: SOLAR_SYSTEM_DISTANCE_UNIT,
          })}
        </span>
      </div>
    </div>
  );
}

function PlanetDistanceRow({
  locale,
  messages,
  mode,
  onSelect,
  planet,
  selected,
}: Readonly<{
  locale: PublishedLocale;
  messages: SolarSystemDistanceMessages["explorer"];
  mode: SolarSystemScaleMode;
  onSelect: () => void;
  planet: SolarSystemBody;
  selected: boolean;
}>) {
  const position = solarSystemPosition(planet, mode);
  if (position === null) return null;
  const barWidth = `${Math.max(0, Math.min(100, position))}%`;
  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-center">
      <button
        aria-pressed={selected}
        className="min-h-11 text-left font-semibold text-[var(--link)] underline underline-offset-4"
        onClick={onSelect}
        type="button"
      >
        {planet.name}
      </button>
      <div className="space-y-1">
        <div className="relative h-5 border-l border-r border-[var(--border)]" aria-hidden="true">
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--border-strong)]"
            style={{ width: barWidth }}
          />
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-current bg-[var(--background)]"
            style={{ left: barWidth }}
          />
        </div>
        <p className="text-xs text-[var(--muted)]">
          {formatMessageTemplate(messages.trackSummary, {
            distance: formatLocaleNumber(planet.mean_distance_au, locale, {
              maximumFractionDigits: 3,
            }),
            mode:
              mode === "log"
                ? messages.scaleModes.logTrackName
                : messages.scaleModes.linearTrackName,
            position: formatLocaleFixedNumber(position, 2, locale),
            unit: SOLAR_SYSTEM_DISTANCE_UNIT,
          })}
        </p>
      </div>
    </div>
  );
}

function SelectedBody({
  body,
  locale,
  messages,
}: Readonly<{
  body: SolarSystemBody;
  locale: PublishedLocale;
  messages: SolarSystemDistanceMessages["explorer"];
}>) {
  const isSun = body.id === "sun";
  return (
    <section
      aria-labelledby="selected-system-body-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {messages.selected.eyebrow}
        </p>
        <h2 className="text-3xl font-semibold" id="selected-system-body-heading">
          {body.name}
        </h2>
        <p className="capitalize text-[var(--muted)]">{body.kind}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Fact
          label={messages.selected.meanDistanceLabel}
          value={formatMessageTemplate(messages.valueWithUnit, {
            unit: SOLAR_SYSTEM_DISTANCE_UNIT,
            value: formatLocaleNumber(body.mean_distance_au, locale, {
              maximumFractionDigits: 3,
            }),
          })}
        />
        <Fact
          label={messages.selected.lightTimeLabel}
          value={
            isSun
              ? formatLocaleNumber(0, locale)
              : formatMessageTemplate(messages.valueWithUnit, {
                  unit: body.light_time_unit,
                  value: formatSolarSystemRawNumber(body.light_time_value, locale),
                })
          }
        />
        <Fact
          label={messages.selected.earthRatioLabel}
          value={
            isSun
              ? formatLocaleNumber(0, locale) + "×"
              : formatLocaleNumber(body.earth_distance_ratio, locale, {
                  maximumFractionDigits: 3,
                }) + "×"
          }
        />
      </dl>
      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
          href={`/lab/scale-explorer/${body.scale_explorer_node_id}`}
        >
          {formatMessageTemplate(messages.selected.compareSizeAction, {
            body: body.name,
          })}
        </Link>
      </div>
      <p className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        {messages.selected.disclosure}
      </p>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg">{value}</dd>
    </div>
  );
}

function DistanceTable({
  locale,
  messages,
  valueWithUnit,
}: Readonly<{
  locale: PublishedLocale;
  messages: SolarSystemDistanceMessages["explorer"]["dataAlternative"];
  valueWithUnit: string;
}>) {
  return (
    <section aria-labelledby="distance-table-heading" className="space-y-4">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold" id="distance-table-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">{messages.headers.body}</th>
              <th className="p-3">{messages.headers.meanDistance}</th>
              <th className="p-3">{messages.headers.lightTime}</th>
              <th className="p-3">{messages.headers.linearTrack}</th>
              <th className="p-3">{messages.headers.logTrack}</th>
            </tr>
          </thead>
          <tbody>
            {SOLAR_SYSTEM_BODIES.map((body) => (
              <tr className="border-b border-[var(--border)] last:border-0" key={body.id}>
                <th className="p-3 font-semibold">{body.name}</th>
                <td className="p-3 font-mono">
                  {formatMessageTemplate(valueWithUnit, {
                    unit: SOLAR_SYSTEM_DISTANCE_UNIT,
                    value: formatSolarSystemRawNumber(body.mean_distance_au, locale),
                  })}
                </td>
                <td className="p-3">
                  {body.id === "sun"
                    ? formatLocaleNumber(0, locale)
                    : formatMessageTemplate(valueWithUnit, {
                        unit: body.light_time_unit,
                        value: formatSolarSystemRawNumber(body.light_time_value, locale),
                      })}
                </td>
                <td className="p-3 font-mono">
                  {formatLocaleFixedNumber(body.linear_position_percent, 2, locale)}%
                </td>
                <td className="p-3 font-mono">
                  {body.log_position_percent === null
                    ? formatMessageTemplate(messages.logUndefined, {
                        unit: SOLAR_SYSTEM_DISTANCE_UNIT,
                      })
                    : formatLocaleFixedNumber(body.log_position_percent, 2, locale) + "%"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatSolarSystemRawNumber(value: number, locale: PublishedLocale): string {
  return formatLocaleNumber(value, locale, {
    maximumFractionDigits: 20,
    useGrouping: false,
  });
}
