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
import styles from "../system-exploration.module.css";

const DEFAULT_BODY_ID: SolarSystemBodyId = "earth";

export function SolarSystemDistanceExplorer({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SolarSystemDistanceMessages["explorer"] }>) {
  const [mode, setMode] = useState<SolarSystemScaleMode>("log");
  const [selectedId, setSelectedId] = useState<SolarSystemBodyId>(DEFAULT_BODY_ID);
  const selected = solarSystemBodyById(selectedId) ?? SOLAR_SYSTEM_BODIES[3]!;

  return (
    <div className={styles.instrumentStack}>
      <section aria-labelledby="system-model-heading" className={styles.instrument}>
        <div className={styles.instrumentHeader}>
          <div>
            <p className={styles.instrumentEyebrow}>
              {formatMessageTemplate(messages.modelEyebrow, {
                modelVersion: SOLAR_SYSTEM_DEFINITION.model_version,
              })}
            </p>
            <h2 className={styles.instrumentTitle} id="system-model-heading">
              {messages.title}
            </h2>
          </div>
          <p className={styles.instrumentDescription}>
            {formatMessageTemplate(messages.description, {
              provider: SOLAR_SYSTEM_PROVIDER_NAME,
            })}
          </p>
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
                  unit: SOLAR_SYSTEM_DISTANCE_UNIT,
                })
              : messages.linearDescription}
          </p>
        </div>

        <div className={styles.trackList} data-testid="solar-system-distance-track">
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
    <button aria-pressed={active} className={styles.scaleButton} onClick={onClick} type="button">
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
    <div className={styles.trackRow}>
      <button
        aria-pressed={selected}
        className={styles.trackButton}
        onClick={onSelect}
        type="button"
      >
        {sun.name}
      </button>
      <div className={styles.originTrack}>
        <span aria-hidden="true" className={styles.originMarker} />
        <span>
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
        <div className={styles.trackRail} aria-hidden="true">
          <div className={styles.trackFill} style={{ width: barWidth }} />
          <span className={styles.trackMarker} style={{ left: barWidth }} />
        </div>
        <p className={styles.trackSummary}>
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
    <section aria-labelledby="selected-system-body-heading" className={styles.selectedPanel}>
      <div>
        <p className={styles.instrumentEyebrow}>{messages.selected.eyebrow}</p>
        <h2 className={styles.selectedTitle} id="selected-system-body-heading">
          {body.name}
        </h2>
        <p className={styles.selectedSubtitle}>{body.kind}</p>
      </div>
      <div>
        <dl className={styles.metricGrid}>
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
        <div className={styles.actions}>
          <Link
            className={styles.actionLink}
            href={`/lab/scale-explorer/${body.scale_explorer_node_id}`}
          >
            {formatMessageTemplate(messages.selected.compareSizeAction, {
              body: body.name,
            })}
          </Link>
        </div>
        <p className={styles.metricNote}>{messages.selected.disclosure}</p>
      </div>
    </section>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.metric}>
      <dt className={styles.metricLabel}>{label}</dt>
      <dd className={styles.metricValue}>{value}</dd>
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
    <section aria-labelledby="distance-table-heading" className={styles.tableSection}>
      <div className={styles.tableHeader}>
        <h2 className={styles.tableTitle} id="distance-table-heading">
          {messages.title}
        </h2>
        <p className={styles.tableDescription}>{messages.description}</p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table} style={{ minWidth: "46rem" }}>
          <thead>
            <tr>
              <th>{messages.headers.body}</th>
              <th>{messages.headers.meanDistance}</th>
              <th>{messages.headers.lightTime}</th>
              <th>{messages.headers.linearTrack}</th>
              <th>{messages.headers.logTrack}</th>
            </tr>
          </thead>
          <tbody>
            {SOLAR_SYSTEM_BODIES.map((body) => (
              <tr key={body.id}>
                <th>{body.name}</th>
                <td className={styles.dataValue}>
                  {formatMessageTemplate(valueWithUnit, {
                    unit: SOLAR_SYSTEM_DISTANCE_UNIT,
                    value: formatSolarSystemRawNumber(body.mean_distance_au, locale),
                  })}
                </td>
                <td>
                  {body.id === "sun"
                    ? formatLocaleNumber(0, locale)
                    : formatMessageTemplate(valueWithUnit, {
                        unit: body.light_time_unit,
                        value: formatSolarSystemRawNumber(body.light_time_value, locale),
                      })}
                </td>
                <td className={styles.dataValue}>
                  {formatLocaleFixedNumber(body.linear_position_percent, 2, locale)}%
                </td>
                <td className={styles.dataValue}>
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
