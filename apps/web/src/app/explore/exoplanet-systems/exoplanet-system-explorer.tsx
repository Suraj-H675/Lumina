"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  formatCountMessage,
  formatLocaleFixedNumber,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { ExoplanetSystemsMessages } from "../../../lib/i18n/messages/types";
import {
  EXOPLANET_DISTANCE_UNIT,
  EXOPLANET_COMPOSITE_TABLE_NAME,
  EXOPLANET_PERIOD_UNIT,
  EXOPLANET_RAW_SNAPSHOT,
  EXOPLANET_SYSTEMS,
  EXOPLANET_SYSTEM_DEFINITION,
  exoplanetPosition,
  exoplanetSystemBySlug,
  type ExoplanetLayoutPlanet,
  type ExoplanetLayoutSystem,
  type ExoplanetScaleMode,
} from "../../../lib/visualizations/exoplanet-systems";

const DEFAULT_SYSTEM_SLUG = "kepler-186";

export function ExoplanetSystemExplorer({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: ExoplanetSystemsMessages["explorer"] }>) {
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
            {formatMessageTemplate(messages.modelEyebrow, {
              modelVersion: EXOPLANET_SYSTEM_DEFINITION.model_version,
            })}
          </p>
          <h2 className="text-2xl font-semibold" id="exoplanet-systems-heading">
            {formatMessageTemplate(messages.title, { unit: EXOPLANET_DISTANCE_UNIT })}
          </h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.description, {
              provider: EXOPLANET_RAW_SNAPSHOT.provider,
              table: EXOPLANET_RAW_SNAPSHOT.table,
            })}
          </p>
        </div>

        <div
          aria-label={messages.host.groupAriaLabel}
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"
          role="group"
        >
          {EXOPLANET_SYSTEMS.map((system) => (
            <button
              aria-label={formatMessageTemplate(messages.host.ariaLabel, {
                countLabel: formatCountMessage(
                  messages.host.confirmedPlanets,
                  system.archive_planet_count,
                  locale,
                ),
                name: system.display_name,
              })}
              aria-pressed={system.host_slug === selectedSystem.host_slug}
              className="min-h-12 border border-[var(--border-strong)] px-3 py-2 text-left font-semibold aria-pressed:bg-[var(--foreground)] aria-pressed:text-[var(--background)]"
              key={system.host_slug}
              onClick={() => chooseSystem(system)}
              type="button"
            >
              <span className="block">{system.display_name}</span>
              <span className="block text-xs font-normal opacity-80">
                {formatCountMessage(
                  messages.host.confirmedPlanets,
                  system.archive_planet_count,
                  locale,
                )}
              </span>
            </button>
          ))}
        </div>

        <div aria-label={messages.scaleAriaLabel} className="flex flex-wrap gap-2" role="group">
          <ScaleButton active={mode === "log"} onClick={() => setMode("log")}>
            {messages.scaleModes.logAction}
          </ScaleButton>
          <ScaleButton active={mode === "linear"} onClick={() => setMode("linear")}>
            {messages.scaleModes.linearAction}
          </ScaleButton>
        </div>

        <div className="border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">
          {mode === "log"
            ? formatMessageTemplate(messages.logDescription, {
                maximum: formatRawNumber(
                  EXOPLANET_SYSTEM_DEFINITION.shared_scale_domain_au.maximum,
                  locale,
                ),
                minimum: formatRawNumber(
                  EXOPLANET_SYSTEM_DEFINITION.shared_scale_domain_au.minimum,
                  locale,
                ),
                unit: EXOPLANET_DISTANCE_UNIT,
              })
            : formatMessageTemplate(messages.linearDescription, {
                maximum: formatRawNumber(
                  EXOPLANET_SYSTEM_DEFINITION.shared_scale_domain_au.maximum,
                  locale,
                ),
                unit: EXOPLANET_DISTANCE_UNIT,
              })}
        </div>

        <SystemLanes
          locale={locale}
          messages={messages}
          mode={mode}
          onSelectPlanet={setSelectedPlanetName}
          selectedPlanetName={selectedPlanet.name}
          system={selectedSystem}
        />
      </section>

      <PlanetDetail
        locale={locale}
        messages={messages}
        planet={selectedPlanet}
        system={selectedSystem}
      />
      <AllSystemsTable
        locale={locale}
        messages={messages.dataAlternative}
        valueWithUnit={messages.parameter.valueWithUnit}
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

function SystemLanes({
  locale,
  messages,
  mode,
  onSelectPlanet,
  selectedPlanetName,
  system,
}: Readonly<{
  locale: PublishedLocale;
  messages: ExoplanetSystemsMessages["explorer"];
  mode: ExoplanetScaleMode;
  onSelectPlanet: (name: string) => void;
  selectedPlanetName: string;
  system: ExoplanetLayoutSystem;
}>) {
  return (
    <section
      aria-label={formatMessageTemplate(messages.systemLayoutAriaLabel, {
        system: system.display_name,
      })}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{system.display_name}</h3>
          <p className="text-sm text-[var(--muted)]">
            {formatMessageTemplate(messages.host.hostname, {
              hostname: system.archive_hostname,
            })}
          </p>
        </div>
        <Link
          className="font-semibold text-[var(--link)] underline underline-offset-4"
          href={`/objects/${system.host_slug}`}
        >
          {messages.host.openCanonical}
        </Link>
      </div>
      <div className="space-y-3">
        {system.planets.map((planet) => (
          <PlanetLane
            key={planet.name}
            locale={locale}
            messages={messages}
            mode={mode}
            onSelect={() => onSelectPlanet(planet.name)}
            planet={planet}
            selected={planet.name === selectedPlanetName}
          />
        ))}
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">
        {formatMessageTemplate(messages.host.originDisclosure, {
          unit: EXOPLANET_DISTANCE_UNIT,
        })}
      </p>
    </section>
  );
}

function PlanetLane({
  locale,
  messages,
  mode,
  onSelect,
  planet,
  selected,
}: Readonly<{
  locale: PublishedLocale;
  messages: ExoplanetSystemsMessages["explorer"];
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
          {formatMessageTemplate(messages.trackSummary, {
            distance: formatRawNumber(planet.semimajor_axis_au, locale),
            mode:
              mode === "log"
                ? messages.scaleModes.logTrackName
                : messages.scaleModes.linearTrackName,
            position: formatLocaleFixedNumber(position, 2, locale),
            unit: EXOPLANET_DISTANCE_UNIT,
          })}
        </p>
      </div>
    </div>
  );
}

function PlanetDetail({
  locale,
  messages,
  planet,
  system,
}: Readonly<{
  locale: PublishedLocale;
  messages: ExoplanetSystemsMessages["explorer"];
  planet: ExoplanetLayoutPlanet;
  system: ExoplanetLayoutSystem;
}>) {
  return (
    <section
      aria-labelledby="selected-exoplanet-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {messages.planet.eyebrow}
        </p>
        <h2 className="text-3xl font-semibold" id="selected-exoplanet-heading">
          {planet.name}
        </h2>
        <p className="text-[var(--muted)]">
          {formatMessageTemplate(messages.planet.discoverySummary, {
            host: system.display_name,
            method: planet.discovery_method,
            year: formatLocaleNumber(planet.discovery_year, locale, { useGrouping: false }),
          })}
        </p>
      </div>
      <dl className="grid gap-4 md:grid-cols-2">
        <ParameterCard
          label={messages.parameter.semimajorAxisLabel}
          locale={locale}
          messages={messages.parameter}
          reference={planet.semimajor_axis_reference}
          uncertainty={planet.semimajor_axis_uncertainty_au}
          unit={EXOPLANET_DISTANCE_UNIT}
          value={planet.semimajor_axis_au}
        />
        <ParameterCard
          label={messages.parameter.orbitalPeriodLabel}
          locale={locale}
          messages={messages.parameter}
          reference={planet.orbital_period_reference}
          uncertainty={planet.orbital_period_uncertainty_days}
          unit={EXOPLANET_PERIOD_UNIT}
          value={planet.orbital_period_days}
        />
      </dl>
      <p className="max-w-4xl text-sm leading-6 text-[var(--muted)]">
        {formatMessageTemplate(messages.planet.disclosure, {
          table: EXOPLANET_COMPOSITE_TABLE_NAME,
        })}
      </p>
    </section>
  );
}

function ParameterCard({
  label,
  locale,
  messages,
  reference,
  uncertainty,
  unit,
  value,
}: Readonly<{
  label: string;
  locale: PublishedLocale;
  messages: ExoplanetSystemsMessages["explorer"]["parameter"];
  reference: { text: string; url: string };
  uncertainty: { plus: number | null; minus: number | null };
  unit: string;
  value: number;
}>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-mono text-lg">
        {formatMessageTemplate(messages.valueWithUnit, {
          unit,
          value: formatRawNumber(value, locale),
        })}
      </dd>
      <dd className="mt-2 text-xs leading-5 text-[var(--muted)]">
        {uncertainty.plus === null || uncertainty.minus === null
          ? messages.noUncertainty
          : formatMessageTemplate(messages.uncertainty, {
              minus: formatRawNumber(uncertainty.minus, locale),
              plus: formatRawNumber(uncertainty.plus, locale),
              unit,
            })}
      </dd>
      <dd className="mt-3">
        <a
          className="text-sm font-semibold text-[var(--link)] underline underline-offset-4"
          href={reference.url}
          rel="noreferrer"
        >
          {formatMessageTemplate(messages.reference, {
            reference: reference.text,
          })}
        </a>
      </dd>
    </div>
  );
}

function AllSystemsTable({
  locale,
  messages,
  valueWithUnit,
}: Readonly<{
  locale: PublishedLocale;
  messages: ExoplanetSystemsMessages["explorer"]["dataAlternative"];
  valueWithUnit: string;
}>) {
  return (
    <section aria-labelledby="all-exoplanets-heading" className="space-y-4">
      <div className="max-w-3xl space-y-2">
        <h2 className="text-2xl font-semibold" id="all-exoplanets-heading">
          {messages.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      </div>
      <div className="overflow-x-auto border border-[var(--border)]">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="p-3">{messages.headers.host}</th>
              <th className="p-3">{messages.headers.planet}</th>
              <th className="p-3">{messages.headers.semimajorAxis}</th>
              <th className="p-3">{messages.headers.orbitalPeriod}</th>
              <th className="p-3">{messages.headers.discovery}</th>
            </tr>
          </thead>
          <tbody>
            {EXOPLANET_SYSTEMS.flatMap((system) =>
              system.planets.map((planet) => (
                <tr className="border-b border-[var(--border)] last:border-0" key={planet.name}>
                  <td className="p-3">{system.display_name}</td>
                  <th className="p-3 font-semibold">{planet.name}</th>
                  <td className="p-3 font-mono">
                    {formatMessageTemplate(valueWithUnit, {
                      unit: EXOPLANET_DISTANCE_UNIT,
                      value: formatRawNumber(planet.semimajor_axis_au, locale),
                    })}
                  </td>
                  <td className="p-3 font-mono">
                    {formatMessageTemplate(valueWithUnit, {
                      unit: EXOPLANET_PERIOD_UNIT,
                      value: formatRawNumber(planet.orbital_period_days, locale),
                    })}
                  </td>
                  <td className="p-3">
                    {formatLocaleNumber(planet.discovery_year, locale, { useGrouping: false })} ·{" "}
                    {planet.discovery_method}
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

function formatRawNumber(value: number, locale: PublishedLocale): string {
  return formatLocaleNumber(value, locale, {
    maximumFractionDigits: 20,
    useGrouping: false,
  });
}
