"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  EXOPLANET_SYSTEMS,
  EXOPLANET_SYSTEM_DEFINITION,
  exoplanetPosition,
  exoplanetSystemBySlug,
  type ExoplanetLayoutPlanet,
  type ExoplanetLayoutSystem,
  type ExoplanetScaleMode,
} from "../../../lib/visualizations/exoplanet-systems";

const DEFAULT_SYSTEM_SLUG = "kepler-186";

export function ExoplanetSystemExplorer() {
  const [mode, setMode] = useState<ExoplanetScaleMode>("log");
  const [selectedSystemSlug, setSelectedSystemSlug] = useState(DEFAULT_SYSTEM_SLUG);
  const selectedSystem =
    exoplanetSystemBySlug(selectedSystemSlug) ?? exoplanetSystemBySlug(DEFAULT_SYSTEM_SLUG)!;
  const [selectedPlanetName, setSelectedPlanetName] = useState("Kepler-186 f");
  const selectedPlanet = useMemo(
    () =>
      selectedSystem.planets.find((planet) => planet.name === selectedPlanetName) ??
      selectedSystem.planets[selectedSystem.planets.length - 1]!,
    [selectedPlanetName, selectedSystem],
  );

  function chooseSystem(system: ExoplanetLayoutSystem) {
    setSelectedSystemSlug(system.host_slug);
    setSelectedPlanetName(system.planets[system.planets.length - 1]!.name);
  }

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="exoplanet-systems-heading"
        className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
      >
        <div className="max-w-4xl space-y-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
            Reviewed reference model · {EXOPLANET_SYSTEM_DEFINITION.model_version}
          </p>
          <h2 className="text-2xl font-semibold" id="exoplanet-systems-heading">
            Five known host systems on one shared AU scale
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            Each marker is placed by a cited orbit semi-major axis from NASA Exoplanet Archive
            PSCompPars. It is not the planet&apos;s current distance, orbital phase, or sky
            position.
          </p>
        </div>

        <div
          aria-label="Host system"
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
          role="group"
        >
          {EXOPLANET_SYSTEMS.map((system) => (
            <button
              aria-label={`${system.display_name}, ${system.archive_planet_count} confirmed ${system.archive_planet_count === 1 ? "planet" : "planets"}`}
              aria-pressed={system.host_slug === selectedSystem.host_slug}
              className="min-h-12 border border-[var(--border-strong)] px-3 py-2 text-left font-semibold aria-pressed:bg-[var(--foreground)] aria-pressed:text-[var(--background)]"
              key={system.host_slug}
              onClick={() => chooseSystem(system)}
              type="button"
            >
              <span className="block">{system.display_name}</span>
              <span className="block text-xs font-normal opacity-80">
                {system.archive_planet_count} confirmed{" "}
                {system.archive_planet_count === 1 ? "planet" : "planets"}
              </span>
            </button>
          ))}
        </div>

        <div aria-label="Orbital reference scale" className="flex flex-wrap gap-2" role="group">
          <ScaleButton active={mode === "log"} onClick={() => setMode("log")}>
            Log semi-major axis
          </ScaleButton>
          <ScaleButton active={mode === "linear"} onClick={() => setMode("linear")}>
            Linear semi-major axis
          </ScaleButton>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">
          {mode === "log"
            ? `Log view normalizes the shared ${EXOPLANET_SYSTEM_DEFINITION.shared_scale_domain_au.minimum}–${EXOPLANET_SYSTEM_DEFINITION.shared_scale_domain_au.maximum} AU domain so close-in and wider planets remain comparable.`
            : `Linear view uses the same shared 0–${EXOPLANET_SYSTEM_DEFINITION.shared_scale_domain_au.maximum} AU reference, exposing how compressed close-in systems are.`}
        </div>

        <SystemLanes
          mode={mode}
          onSelectPlanet={setSelectedPlanetName}
          selectedPlanetName={selectedPlanet.name}
          system={selectedSystem}
        />
      </section>

      <PlanetDetail planet={selectedPlanet} system={selectedSystem} />
      <AllSystemsTable />
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

function SystemLanes({
  mode,
  onSelectPlanet,
  selectedPlanetName,
  system,
}: Readonly<{
  mode: ExoplanetScaleMode;
  onSelectPlanet: (name: string) => void;
  selectedPlanetName: string;
  system: ExoplanetLayoutSystem;
}>) {
  return (
    <section aria-label={`${system.display_name} orbital reference layout`} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{system.display_name}</h3>
          <p className="text-sm text-[var(--muted)]">
            Archive hostname: <span className="font-mono">{system.archive_hostname}</span>
          </p>
        </div>
        <Link
          className="font-semibold text-[var(--link)] underline underline-offset-4"
          href={`/objects/${system.host_slug}`}
        >
          Open canonical host star →
        </Link>
      </div>
      <div className="space-y-3">
        {system.planets.map((planet) => (
          <PlanetLane
            key={planet.name}
            mode={mode}
            onSelect={() => onSelectPlanet(planet.name)}
            planet={planet}
            selected={planet.name === selectedPlanetName}
          />
        ))}
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">
        Host star is the 0 AU origin conceptually; it is not plotted on the logarithmic transform.
        Planet markers are uniform-size interface controls, not radius encodings.
      </p>
    </section>
  );
}

function PlanetLane({
  mode,
  onSelect,
  planet,
  selected,
}: Readonly<{
  mode: ExoplanetScaleMode;
  onSelect: () => void;
  planet: ExoplanetLayoutPlanet;
  selected: boolean;
}>) {
  const position = exoplanetPosition(planet, mode);
  const width = `${Math.max(0, Math.min(100, position))}%`;
  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
      <button
        aria-pressed={selected}
        className="min-h-11 text-left font-semibold text-[var(--link)] underline underline-offset-4"
        onClick={onSelect}
        type="button"
      >
        {planet.name}
      </button>
      <div className="space-y-1">
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
          {planet.semimajor_axis_au} AU · {position.toFixed(2)}% of shared {mode} track
        </p>
      </div>
    </div>
  );
}

function PlanetDetail({
  planet,
  system,
}: Readonly<{ planet: ExoplanetLayoutPlanet; system: ExoplanetLayoutSystem }>) {
  return (
    <section
      aria-labelledby="selected-exoplanet-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Selected confirmed planet
        </p>
        <h2 className="text-3xl font-semibold" id="selected-exoplanet-heading">
          {planet.name}
        </h2>
        <p className="text-[var(--muted)]">
          Host: {system.display_name} · discovered {planet.discovery_year} ·{" "}
          {planet.discovery_method}
        </p>
      </div>
      <dl className="grid gap-4 md:grid-cols-2">
        <ParameterCard
          label="Orbit semi-major axis"
          reference={planet.semimajor_axis_reference}
          uncertainty={planet.semimajor_axis_uncertainty_au}
          unit="AU"
          value={planet.semimajor_axis_au}
        />
        <ParameterCard
          label="Orbital period"
          reference={planet.orbital_period_reference}
          uncertainty={planet.orbital_period_uncertainty_days}
          unit="days"
          value={planet.orbital_period_days}
        />
      </dl>
      <p className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        These two parameters may come from different publications because PSCompPars is a composite
        table. Lumina therefore keeps each parameter&apos;s reference attached to that value.
      </p>
    </section>
  );
}

function ParameterCard({
  label,
  reference,
  uncertainty,
  unit,
  value,
}: Readonly<{
  label: string;
  reference: { text: string; url: string };
  uncertainty: { plus: number | null; minus: number | null };
  unit: string;
  value: number;
}>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg">
        {value} {unit}
      </dd>
      <dd className="mt-2 text-xs leading-5 text-[var(--muted)]">
        {uncertainty.plus === null || uncertainty.minus === null
          ? "Archive composite value has no reported uncertainty in this field."
          : `Archive uncertainty: +${uncertainty.plus} / ${uncertainty.minus} ${unit}.`}
      </dd>
      <dd className="mt-3">
        <a
          className="text-sm font-semibold text-[var(--link)] underline underline-offset-4"
          href={reference.url}
          rel="noreferrer"
        >
          Parameter reference: {reference.text} ↗
        </a>
      </dd>
    </div>
  );
}

function AllSystemsTable() {
  return (
    <section aria-labelledby="all-exoplanets-heading" className="space-y-4">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold" id="all-exoplanets-heading">
          Data alternative
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          All ten pinned planets remain available as numbers independent of the visual track.
        </p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">Host</th>
              <th className="p-3">Planet</th>
              <th className="p-3">Semi-major axis</th>
              <th className="p-3">Orbital period</th>
              <th className="p-3">Discovery</th>
            </tr>
          </thead>
          <tbody>
            {EXOPLANET_SYSTEMS.flatMap((system) =>
              system.planets.map((planet) => (
                <tr className="border-b border-[var(--border)] last:border-0" key={planet.name}>
                  <td className="p-3">{system.display_name}</td>
                  <th className="p-3 font-semibold">{planet.name}</th>
                  <td className="p-3 font-mono">{planet.semimajor_axis_au} AU</td>
                  <td className="p-3 font-mono">{planet.orbital_period_days} days</td>
                  <td className="p-3">
                    {planet.discovery_year} · {planet.discovery_method}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
