"use client";

import Link from "next/link";
import { useState } from "react";

import {
  SOLAR_SYSTEM_BODIES,
  SOLAR_SYSTEM_DEFINITION,
  SOLAR_SYSTEM_PLANETS,
  solarSystemBodyById,
  solarSystemPosition,
  type SolarSystemBody,
  type SolarSystemBodyId,
  type SolarSystemScaleMode,
} from "../../../lib/visualizations/solar-system-distance";

const DEFAULT_BODY_ID: SolarSystemBodyId = "earth";

export function SolarSystemDistanceExplorer() {
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
            Reviewed reference model · {SOLAR_SYSTEM_DEFINITION.model_version}
          </p>
          <h2 className="text-2xl font-semibold" id="system-model-heading">
            Mean distance from the Sun
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            This is a distance comparison, not a live Solar System snapshot. Each planet uses the
            cited NASA mean distance from the Sun. Marker sizes are uniform and do not represent
            body diameter.
          </p>
        </div>

        <div aria-label="Distance scale" className="flex flex-wrap gap-2" role="group">
          <ScaleButton active={mode === "log"} onClick={() => setMode("log")}>
            Log distance
          </ScaleButton>
          <ScaleButton active={mode === "linear"} onClick={() => setMode("linear")}>
            Linear distance
          </ScaleButton>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <p className="text-sm leading-6 text-[var(--muted)]">
            {mode === "log"
              ? "Log view uses log10 of the reviewed mean Sun distance, normalized from Mercury to Neptune. The Sun is kept separately at 0 AU because log10(0) is undefined."
              : "Linear view places each planet by its reviewed mean Sun distance relative to Neptune. Inner-planet bars therefore become very short."}
          </p>
        </div>

        <div className="space-y-3" data-testid="solar-system-distance-track">
          <OriginRow selected={selectedId === "sun"} onSelect={() => setSelectedId("sun")} />
          {SOLAR_SYSTEM_PLANETS.map((planet) => (
            <PlanetDistanceRow
              key={planet.id}
              mode={mode}
              onSelect={() => setSelectedId(planet.id)}
              planet={planet}
              selected={planet.id === selectedId}
            />
          ))}
        </div>
      </section>

      <SelectedBody body={selected} />
      <DistanceTable />
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

function OriginRow({ selected, onSelect }: Readonly<{ selected: boolean; onSelect: () => void }>) {
  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-center">
      <button
        aria-pressed={selected}
        className="min-h-11 text-left font-semibold text-[var(--link)] underline underline-offset-4"
        onClick={onSelect}
        type="button"
      >
        Sun
      </button>
      <div className="flex min-h-11 items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block size-3 shrink-0 rounded-full border border-current"
        />
        <span className="text-sm text-[var(--muted)]">
          0 AU · origin; excluded from log transform
        </span>
      </div>
    </div>
  );
}

function PlanetDistanceRow({
  mode,
  onSelect,
  planet,
  selected,
}: Readonly<{
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
          {planet.mean_distance_au.toLocaleString("en-US", { maximumFractionDigits: 3 })} AU ·{" "}
          {position.toFixed(2)}% of this {mode} track
        </p>
      </div>
    </div>
  );
}

function SelectedBody({ body }: Readonly<{ body: SolarSystemBody }>) {
  const isSun = body.id === "sun";
  return (
    <section
      aria-labelledby="selected-system-body-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Selected reference body
        </p>
        <h2 className="text-3xl font-semibold" id="selected-system-body-heading">
          {body.name}
        </h2>
        <p className="capitalize text-[var(--muted)]">{body.kind}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Fact
          label="Mean Sun distance"
          value={`${body.mean_distance_au.toLocaleString("en-US", { maximumFractionDigits: 3 })} AU`}
        />
        <Fact
          label="Light-time context"
          value={isSun ? "0" : `${body.light_time_value} ${body.light_time_unit}`}
        />
        <Fact
          label="Relative to Earth's mean distance"
          value={
            isSun
              ? "0×"
              : `${body.earth_distance_ratio.toLocaleString("en-US", { maximumFractionDigits: 3 })}×`
          }
        />
      </dl>
      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold text-[var(--link)]"
          href={`/lab/scale-explorer/${body.scale_explorer_node_id}`}
        >
          Compare {body.name}&apos;s characteristic size →
        </Link>
      </div>
      <p className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        Distance and body size are different quantities. Lumina intentionally keeps them in separate
        reviewed models rather than drawing planet marker diameters on the distance track.
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

function DistanceTable() {
  return (
    <section aria-labelledby="distance-table-heading" className="space-y-4">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold" id="distance-table-heading">
          Data alternative
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          The numeric table is authoritative when visual spacing is difficult to compare.
        </p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">Body</th>
              <th className="p-3">Mean Sun distance</th>
              <th className="p-3">Light-time context</th>
              <th className="p-3">Linear track</th>
              <th className="p-3">Log track</th>
            </tr>
          </thead>
          <tbody>
            {SOLAR_SYSTEM_BODIES.map((body) => (
              <tr className="border-b border-[var(--border)] last:border-0" key={body.id}>
                <th className="p-3 font-semibold">{body.name}</th>
                <td className="p-3 font-mono">{body.mean_distance_au} AU</td>
                <td className="p-3">
                  {body.id === "sun" ? "0" : `${body.light_time_value} ${body.light_time_unit}`}
                </td>
                <td className="p-3 font-mono">{body.linear_position_percent.toFixed(2)}%</td>
                <td className="p-3 font-mono">
                  {body.log_position_percent === null
                    ? "not defined at 0 AU"
                    : `${body.log_position_percent.toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
