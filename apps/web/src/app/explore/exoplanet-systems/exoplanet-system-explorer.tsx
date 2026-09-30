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
import styles from "../system-exploration.module.css";

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
    <div className={styles.instrumentStack}>
      <section aria-labelledby="exoplanet-systems-heading" className={styles.instrument}>
        <div className={styles.instrumentHeader}>
          <div>
            <p className={styles.instrumentEyebrow}>
              {formatMessageTemplate(messages.modelEyebrow, {
                modelVersion: EXOPLANET_SYSTEM_DEFINITION.model_version,
              })}
            </p>
            <h2 className={styles.instrumentTitle} id="exoplanet-systems-heading">
              {formatMessageTemplate(messages.title, { unit: EXOPLANET_DISTANCE_UNIT })}
            </h2>
          </div>
          <p className={styles.instrumentDescription}>
            {formatMessageTemplate(messages.description, {
              provider: EXOPLANET_RAW_SNAPSHOT.provider,
              table: EXOPLANET_RAW_SNAPSHOT.table,
            })}
          </p>
        </div>

        <div
          aria-label={messages.host.groupAriaLabel}
          className={styles.systemChooser}
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
              className={styles.systemButton}
              key={system.host_slug}
              onClick={() => chooseSystem(system)}
              type="button"
            >
              <span>{system.display_name}</span>
              <span>
                {formatCountMessage(
                  messages.host.confirmedPlanets,
                  system.archive_planet_count,
                  locale,
                )}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.scaleControls}>
          <div aria-label={messages.scaleAriaLabel} className={styles.scaleToggle} role="group">
            <ScaleButton active={mode === "log"} onClick={() => setMode("log")}>
              {messages.scaleModes.logAction}
            </ScaleButton>
            <ScaleButton active={mode === "linear"} onClick={() => setMode("linear")}>
              {messages.scaleModes.linearAction}
            </ScaleButton>
          </div>
          <p className={styles.scaleNote}>
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
          </p>
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
    <button aria-pressed={active} className={styles.scaleButton} onClick={onClick} type="button">
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
      className={styles.systemContext}
    >
      <div className={styles.systemContextHeader}>
        <div>
          <h3 className={styles.systemContextTitle}>{system.display_name}</h3>
          <p className={styles.systemContextMeta}>
            {formatMessageTemplate(messages.host.hostname, {
              hostname: system.archive_hostname,
            })}
          </p>
        </div>
        <Link className={styles.inlineLink} href={`/objects/${system.host_slug}`}>
          {messages.host.openCanonical}
        </Link>
      </div>
      <div className={styles.trackList}>
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
      <p className={styles.trackSummary}>
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
    <div className={styles.trackRow}>
      <button
        aria-pressed={selected}
        className={styles.trackButton}
        onClick={onSelect}
        type="button"
      >
        {planet.name}
      </button>
      <div className={styles.trackBody}>
        <div aria-hidden="true" className={styles.trackRail}>
          <div className={styles.trackFill} style={{ width }} />
          <span className={styles.trackMarker} style={{ left: width }} />
        </div>
        <p className={styles.trackSummary}>
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
    <section aria-labelledby="selected-exoplanet-heading" className={styles.selectedPanel}>
      <div>
        <p className={styles.instrumentEyebrow}>{messages.planet.eyebrow}</p>
        <h2 className={styles.selectedTitle} id="selected-exoplanet-heading">
          {planet.name}
        </h2>
        <p className={styles.selectedSummary}>
          {formatMessageTemplate(messages.planet.discoverySummary, {
            host: system.display_name,
            method: planet.discovery_method,
            year: formatLocaleNumber(planet.discovery_year, locale, { useGrouping: false }),
          })}
        </p>
      </div>
      <div>
        <dl className={styles.metricGrid}>
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
        <p className={styles.metricNote}>
          {formatMessageTemplate(messages.planet.disclosure, {
            table: EXOPLANET_COMPOSITE_TABLE_NAME,
          })}
        </p>
      </div>
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
    <div className={styles.metric}>
      <dt className={styles.metricLabel}>{label}</dt>
      <dd className={styles.metricValue}>
        {formatMessageTemplate(messages.valueWithUnit, {
          unit,
          value: formatRawNumber(value, locale),
        })}
      </dd>
      <dd className={styles.metricNote}>
        {uncertainty.plus === null || uncertainty.minus === null
          ? messages.noUncertainty
          : formatMessageTemplate(messages.uncertainty, {
              minus: formatRawNumber(uncertainty.minus, locale),
              plus: formatRawNumber(uncertainty.plus, locale),
              unit,
            })}
      </dd>
      <dd className={styles.metricLink}>
        <a className={styles.inlineLink} href={reference.url} rel="noreferrer">
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
    <section aria-labelledby="all-exoplanets-heading" className={styles.tableSection}>
      <div className={styles.tableHeader}>
        <h2 className={styles.tableTitle} id="all-exoplanets-heading">
          {messages.title}
        </h2>
        <p className={styles.tableDescription}>{messages.description}</p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table} style={{ minWidth: "48rem" }}>
          <thead>
            <tr>
              <th>{messages.headers.host}</th>
              <th>{messages.headers.planet}</th>
              <th>{messages.headers.semimajorAxis}</th>
              <th>{messages.headers.orbitalPeriod}</th>
              <th>{messages.headers.discovery}</th>
            </tr>
          </thead>
          <tbody>
            {EXOPLANET_SYSTEMS.flatMap((system) =>
              system.planets.map((planet) => (
                <tr key={planet.name}>
                  <td>{system.display_name}</td>
                  <th>{planet.name}</th>
                  <td className={styles.dataValue}>
                    {formatMessageTemplate(valueWithUnit, {
                      unit: EXOPLANET_DISTANCE_UNIT,
                      value: formatRawNumber(planet.semimajor_axis_au, locale),
                    })}
                  </td>
                  <td className={styles.dataValue}>
                    {formatMessageTemplate(valueWithUnit, {
                      unit: EXOPLANET_PERIOD_UNIT,
                      value: formatRawNumber(planet.orbital_period_days, locale),
                    })}
                  </td>
                  <td>
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
