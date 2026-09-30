"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";

import type { EntityDetailResponse } from "@nova-lumina/api-client";

import { CatalogueSearchBox } from "./catalogue-search-box";
import { JournalEntryButton } from "./journal-entry-button";
import { ObservationConditions } from "./observation-conditions";
import { SaveObservationPlanButton } from "./save-observation-plan-button";
import { SkyFinder } from "./sky-finder";
import styles from "./observation-planner.module.css";
import { formatCoordinateDisclosure } from "../lib/i18n/coordinate-disclosure";
import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type {
  CatalogueSearchMessages,
  CoordinateDisclosureMessages,
  EntityTypeMessages,
  JournalEntryMessages,
  ObservationPlannerMessages,
} from "../lib/i18n/messages/types";
import {
  computeObservationPlan,
  coordinateDisclosureForProfile,
  coordinateProfileForSource,
  extractCoordinatePairs,
  formatCompassDirection,
  isValidNightDate,
  localDateString,
  localInstantForNightTime,
  parseObserverLocationInputs,
  type NightEvent,
  type ObservationPlan,
  type ObserverLocation,
  type TargetEvent,
} from "../lib/observation/domain";
import {
  formatObservationDateLabel,
  formatObservationShortTime,
  formatObservationTime,
  useBrowserDate,
  useBrowserTimeZone,
} from "../lib/observation/presentation";

export type ObservationPlannerProps = Readonly<{
  apiOrigin?: string;
  catalogueSearchMessages: CatalogueSearchMessages;
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  detail: EntityDetailResponse | null;
  entityTypeMessages: EntityTypeMessages;
  initialDate?: string;
  journalEntryMessages: JournalEntryMessages;
  locale: PublishedLocale;
  messages: ObservationPlannerMessages;
  slug: string | null;
  targetUnavailable: boolean;
}>;

const EMPTY_TIME = "22:00";

function localTimeString(instant: Date): string {
  return `${String(instant.getHours()).padStart(2, "0")}:${String(instant.getMinutes()).padStart(2, "0")}`;
}

function formatAltitude(altitude: number, locale: PublishedLocale): string {
  return `${formatLocaleNumber(altitude, locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}°`;
}

function formatAzimuth(azimuth: number, locale: PublishedLocale): string {
  return `${formatLocaleNumber(azimuth, locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}° · ${formatCompassDirection(azimuth)}`;
}

function formatNightEvent(
  event: NightEvent,
  timeZone: string,
  locale: PublishedLocale,
  unavailableMessage: string,
): string {
  return event.kind === "time"
    ? formatObservationTime(event.instant, timeZone, locale)
    : unavailableMessage;
}

function formatTargetEvent(
  event: TargetEvent,
  timeZone: string,
  locale: PublishedLocale,
  messages: ObservationPlannerMessages["results"]["events"],
): string {
  if (event.kind === "time" && event.instant !== undefined)
    return formatObservationTime(event.instant, timeZone, locale);
  if (event.kind === "circumpolar") return messages.circumpolar;
  if (event.kind === "never-rises") return messages.neverRises;
  if (event.kind === "not-during-night") return messages.notDuringNight;
  return messages.unavailable;
}

function formatLocationValue(value: number, locale: PublishedLocale): string {
  return formatLocaleNumber(value, locale, {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  });
}

function geolocationFailureMessage(
  code: number,
  messages: ObservationPlannerMessages["location"]["geolocationFailures"],
): string {
  if (code === 1) return messages.denied;
  if (code === 2) return messages.unavailable;
  if (code === 3) return messages.timeout;
  return messages.unknown;
}

function eventCard(label: string, value: string) {
  return (
    <div className={styles.eventCard}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CoordinateSource({
  disclosureMessages,
  messages,
  plan,
}: Readonly<{
  disclosureMessages: CoordinateDisclosureMessages;
  messages: ObservationPlannerMessages["results"]["source"];
  plan: ObservationPlan;
}>) {
  const { coordinate } = plan;
  const profile = coordinateProfileForSource(coordinate.source);
  return (
    <section aria-labelledby="position-source-heading" className={styles.coordinateSource}>
      <h3 id="position-source-heading">{messages.title}</h3>
      <p>
        {coordinate.source.provider.name} · {coordinate.source.dataset.name} (
        {coordinate.source.dataset.release_version})
      </p>
      <p className={styles.coordinateRecord}>
        {messages.sourceRecordLabel}{" "}
        <span className="font-mono">{coordinate.source.source_record_id}</span> ·{" "}
        {profile === null
          ? disclosureMessages.reviewedWithoutEpoch
          : formatCoordinateDisclosure(coordinateDisclosureForProfile(profile), disclosureMessages)}
      </p>
    </section>
  );
}

function AltitudeChart({
  locale,
  messages,
  plan,
  timeZone,
}: Readonly<{
  locale: PublishedLocale;
  messages: ObservationPlannerMessages["chart"];
  plan: ObservationPlan;
  timeZone: string;
}>) {
  const chartId = useId().replaceAll(":", "");
  const width = 720;
  const height = 300;
  const left = 48;
  const right = 16;
  const top = 22;
  const bottom = 40;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const span = plan.plotEnd.getTime() - plan.plotStart.getTime();
  const xFor = (instant: Date) =>
    left + (span === 0 ? 0 : ((instant.getTime() - plan.plotStart.getTime()) / span) * plotWidth);
  const yFor = (altitude: number) =>
    top + ((90 - Math.max(-90, Math.min(90, altitude))) / 180) * plotHeight;
  const path = plan.samples
    .map(
      (sample, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(sample.instant).toFixed(2)} ${yFor(sample.altitude).toFixed(2)}`,
    )
    .join(" ");
  const horizonY = yFor(0);
  const darknessStart = plan.night.astronomicalDarkness?.start;
  const darknessEnd = plan.night.astronomicalDarkness?.end;
  const selectedInPlot =
    plan.selected.instant.getTime() >= plan.plotStart.getTime() &&
    plan.selected.instant.getTime() <= plan.plotEnd.getTime();
  const maxSample = plan.maxDuringDarkness;
  const firstLabel = formatObservationShortTime(plan.plotStart, timeZone, locale);
  const middleLabel = formatObservationShortTime(
    new Date((plan.plotStart.getTime() + plan.plotEnd.getTime()) / 2),
    timeZone,
    locale,
  );
  const lastLabel = formatObservationShortTime(plan.plotEnd, timeZone, locale);
  const accessibleSummary =
    maxSample === null
      ? messages.accessibleNoDarkness
      : formatMessageTemplate(messages.accessibleHighest, {
          altitude: formatAltitude(maxSample.altitude, locale),
          time: formatObservationTime(maxSample.instant, timeZone, locale),
        });

  return (
    <figure aria-labelledby={`${chartId}-caption`} className={styles.chart}>
      <div className={styles.chartFrame}>
        <svg aria-hidden="true" role="presentation" viewBox={`0 0 ${width} ${height}`}>
          <rect fill="var(--surface)" height={plotHeight} width={plotWidth} x={left} y={top} />
          {darknessStart !== undefined && darknessEnd !== undefined ? (
            <rect
              fill="rgba(125, 211, 252, 0.08)"
              height={plotHeight}
              width={Math.max(0, xFor(darknessEnd) - xFor(darknessStart))}
              x={xFor(darknessStart)}
              y={top}
            />
          ) : null}
          <line
            stroke="var(--muted)"
            strokeDasharray="5 5"
            strokeOpacity="0.75"
            strokeWidth="1"
            x1={left}
            x2={width - right}
            y1={horizonY}
            y2={horizonY}
          />
          <line
            stroke="var(--border)"
            strokeWidth="1"
            x1={left}
            x2={left}
            y1={top}
            y2={height - bottom}
          />
          <line
            stroke="var(--border)"
            strokeWidth="1"
            x1={left}
            x2={width - right}
            y1={height - bottom}
            y2={height - bottom}
          />
          <path
            d={path}
            fill="none"
            stroke="var(--accent-strong)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {selectedInPlot ? (
            <g>
              <line
                stroke="var(--focus)"
                strokeDasharray="3 3"
                strokeWidth="1.5"
                x1={xFor(plan.selected.instant)}
                x2={xFor(plan.selected.instant)}
                y1={top}
                y2={height - bottom}
              />
              <circle
                cx={xFor(plan.selected.instant)}
                cy={yFor(plan.selected.position.altitude)}
                fill="var(--focus)"
                r="5"
                stroke="var(--background)"
                strokeWidth="2"
              />
            </g>
          ) : null}
          {maxSample !== null ? (
            <circle
              cx={xFor(maxSample.instant)}
              cy={yFor(maxSample.altitude)}
              fill="var(--accent)"
              r="5"
              stroke="var(--background)"
              strokeWidth="2"
            />
          ) : null}
          <text fill="var(--muted)" fontSize="12" x="8" y={top + 4}>
            +90°
          </text>
          <text fill="var(--muted)" fontSize="12" x="14" y={horizonY + 4}>
            0°
          </text>
          <text fill="var(--muted)" fontSize="12" x="8" y={height - bottom + 4}>
            −90°
          </text>
          <text fill="var(--muted)" fontSize="12" textAnchor="start" x={left} y={height - 12}>
            {firstLabel}
          </text>
          <text
            fill="var(--muted)"
            fontSize="12"
            textAnchor="middle"
            x={left + plotWidth / 2}
            y={height - 12}
          >
            {middleLabel}
          </text>
          <text
            fill="var(--muted)"
            fontSize="12"
            textAnchor="end"
            x={width - right}
            y={height - 12}
          >
            {lastLabel}
          </text>
        </svg>
      </div>
      <figcaption className={styles.chartCaption} id={`${chartId}-caption`}>
        <strong>{messages.title}</strong>{" "}
        {selectedInPlot ? messages.descriptionWithSelectedTime : messages.description}
      </figcaption>
      <p className="sr-only">{accessibleSummary}</p>
    </figure>
  );
}

function PlannerResults({
  coordinateDisclosureMessages,
  journalEntryMessages,
  locale,
  messages,
  nightDate,
  plan,
  targetEntityId,
  targetEntityType,
  targetName,
  targetSlug,
  timeZone,
}: Readonly<{
  coordinateDisclosureMessages: CoordinateDisclosureMessages;
  journalEntryMessages: JournalEntryMessages;
  locale: PublishedLocale;
  messages: ObservationPlannerMessages;
  nightDate: string;
  plan: ObservationPlan;
  targetEntityId: string;
  targetEntityType: EntityDetailResponse["entity_type"];
  targetName: string;
  targetSlug: string;
  timeZone: string;
}>) {
  const highest = plan.maxDuringDarkness;
  return (
    <section aria-labelledby="planner-results-heading" className={styles.results}>
      <div className={styles.resultsHeader}>
        <div>
          <p className={styles.eyebrow}>{messages.results.eyebrow}</p>
          <h2 className={styles.resultsTitle} id="planner-results-heading">
            {highest !== null && highest.altitude > 0
              ? formatMessageTemplate(messages.results.highestHeading, {
                  time: formatObservationTime(highest.instant, timeZone, locale),
                })
              : messages.results.belowHorizonHeading}
          </h2>
          {highest !== null && highest.altitude > 0 ? (
            <p className={styles.resultsSummary}>
              {formatMessageTemplate(messages.results.highestAltitude, {
                altitude: formatAltitude(highest.altitude, locale),
              })}
            </p>
          ) : null}
        </div>
        <div className={styles.resultActions}>
          <JournalEntryButton
            entityId={targetEntityId}
            messages={journalEntryMessages}
            objectName={targetName}
            plannerContext={{
              latitudeDeg: plan.location.latitude,
              longitudeDeg: plan.location.longitude,
              selectedTimeUtc: plan.selected.instant.toISOString(),
            }}
          />
          <SaveObservationPlanButton
            locale={locale}
            messages={messages.savePlan}
            nightDate={nightDate}
            plan={plan}
            target={{
              canonicalName: targetName,
              entityId: targetEntityId,
              entityType: targetEntityType,
              slug: targetSlug,
            }}
            timeZone={timeZone}
          />
        </div>
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>{messages.results.selectedTime}</p>
          <p className={styles.metricValue}>
            {formatAltitude(plan.selected.position.altitude, locale)}
          </p>
          <p className={styles.metricDetail}>{messages.results.altitudeGeometric}</p>
          <p className={styles.metricSecondary}>
            {formatAzimuth(plan.selected.position.azimuth, locale)}
          </p>
          <p className={styles.metricDetail}>{messages.results.azimuthConvention}</p>
        </div>
        <div className={styles.metric}>
          <p className={styles.metricLabel}>{messages.results.nightBoundaries}</p>
          <dl className={styles.eventsGrid}>
            {eventCard(
              messages.results.events.sunsetGeometric,
              formatNightEvent(
                plan.night.sunset,
                timeZone,
                locale,
                messages.results.events.unavailable,
              ),
            )}
            {eventCard(
              messages.results.events.astronomicalDusk,
              formatNightEvent(
                plan.night.astronomicalDusk,
                timeZone,
                locale,
                messages.results.events.unavailable,
              ),
            )}
            {eventCard(
              messages.results.events.astronomicalDawn,
              formatNightEvent(
                plan.night.astronomicalDawn,
                timeZone,
                locale,
                messages.results.events.unavailable,
              ),
            )}
            {eventCard(
              messages.results.events.sunriseGeometric,
              formatNightEvent(
                plan.night.sunrise,
                timeZone,
                locale,
                messages.results.events.unavailable,
              ),
            )}
          </dl>
          {plan.night.astronomicalDarkness === null ? (
            <p className={styles.metricDetail}>{messages.results.darknessUnavailable}</p>
          ) : null}
          <p className={styles.metricDetail}>{messages.results.solarBoundaryDescription}</p>
        </div>
      </div>

      <div className={styles.eventsPanel}>
        <h3>{messages.results.targetEvents.title}</h3>
        <p>{formatMessageTemplate(messages.results.targetEvents.description, { timeZone })}</p>
        <dl className={styles.targetEventsGrid}>
          {eventCard(
            messages.results.events.rise,
            formatTargetEvent(plan.targetEvents.rise, timeZone, locale, messages.results.events),
          )}
          {eventCard(
            messages.results.events.meridianTransit,
            formatTargetEvent(plan.targetEvents.transit, timeZone, locale, messages.results.events),
          )}
          {eventCard(
            messages.results.events.set,
            formatTargetEvent(plan.targetEvents.set, timeZone, locale, messages.results.events),
          )}
        </dl>
      </div>

      <SkyFinder
        locale={locale}
        messages={messages.skyFinder}
        plan={plan}
        targetName={targetName}
        targetSlug={targetSlug}
      />
      <AltitudeChart locale={locale} messages={messages.chart} plan={plan} timeZone={timeZone} />
      <ObservationConditions
        locale={locale}
        messages={messages.conditions}
        nightDate={nightDate}
        plan={plan}
        timeZone={timeZone}
      />
      <CoordinateSource
        disclosureMessages={coordinateDisclosureMessages}
        messages={messages.results.source}
        plan={plan}
      />
    </section>
  );
}

export function ObservationPlanner({
  apiOrigin,
  catalogueSearchMessages,
  coordinateDisclosureMessages,
  detail,
  entityTypeMessages,
  initialDate,
  journalEntryMessages,
  locale,
  messages,
  slug,
  targetUnavailable,
}: ObservationPlannerProps) {
  const router = useRouter();
  const [nightDate, setNightDate] = useState(initialDate ?? "");
  const [selectedTime, setSelectedTime] = useState(EMPTY_TIME);
  const [location, setLocation] = useState<ObserverLocation | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationError, setLocationError] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const [selectedSourceKey, setSelectedSourceKey] = useState("");
  const browserDate = useBrowserDate(initialDate);
  const activeNightDate = nightDate || browserDate;
  const timeZone = useBrowserTimeZone();

  useEffect(() => {
    if (activeNightDate === "" || typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (slug !== null) params.set("object", slug);
    params.set("date", activeNightDate);
    const nextSearch = `?${params.toString()}`;
    if (window.location.search !== nextSearch)
      void router.replace(`/observe${nextSearch}`, { scroll: false });
  }, [activeNightDate, router, slug]);

  const coordinatePairs = useMemo(
    () => (detail === null ? [] : extractCoordinatePairs(detail)),
    [detail],
  );
  const selectedCoordinate =
    coordinatePairs.find((pair) => pair.sourceKey === selectedSourceKey) ?? coordinatePairs[0];

  const selectedInstant = useMemo(
    () =>
      isValidNightDate(activeNightDate)
        ? localInstantForNightTime(activeNightDate, selectedTime)
        : null,
    [activeNightDate, selectedTime],
  );
  const plan = useMemo(
    () =>
      selectedCoordinate !== undefined && location !== null && selectedInstant !== null
        ? computeObservationPlan(selectedCoordinate, location, activeNightDate, selectedInstant)
        : null,
    [activeNightDate, location, selectedCoordinate, selectedInstant],
  );

  const handleManualLocation = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = parseObserverLocationInputs(latitude, longitude);
      if (parsed === null) {
        setLocation(null);
        setLocationError(messages.location.invalidCoordinates);
        return;
      }
      setLocation(parsed);
      setLocationError("");
    },
    [latitude, longitude, messages.location.invalidCoordinates],
  );

  const handleGeolocation = useCallback(() => {
    setLocationError("");
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationError(messages.location.geolocationUnsupported);
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(next);
        setLatitude(String(next.latitude));
        setLongitude(String(next.longitude));
        setLocationError("");
        setGeoBusy(false);
      },
      (error) => {
        setLocationError(
          geolocationFailureMessage(error.code, messages.location.geolocationFailures),
        );
        setGeoBusy(false);
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  }, [messages.location.geolocationFailures, messages.location.geolocationUnsupported]);

  const useNow = useCallback(() => {
    const now = new Date();
    if (activeNightDate === localDateString(now)) setSelectedTime(localTimeString(now));
  }, [activeNightDate]);

  const targetTitle = detail?.canonical_name ?? messages.header.chooseObject;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.header.eyebrow}</p>
          <h1 className={styles.heroTitle}>{targetTitle}</h1>
          <p className={styles.heroDescription}>{messages.header.description}</p>
          {detail !== null ? (
            <p className={styles.heroMeta}>
              {formatMessageTemplate(messages.header.targetSummary, {
                entityType: entityTypeMessages[detail.entity_type],
              })}
            </p>
          ) : null}
        </div>
        {detail !== null && slug !== null ? (
          <Link className={styles.objectLink} href={`/objects/${slug}`}>
            {messages.header.openObject}
          </Link>
        ) : null}
      </header>

      <section aria-labelledby="target-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionIndex}>01</p>
          <h2 className={styles.sectionTitle} id="target-heading">
            {messages.target.heading}
          </h2>
          <p className={styles.sectionMeta}>{messages.target.reviewedSuggestions}</p>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.searchWrap}>
            <CatalogueSearchBox
              {...(apiOrigin === undefined ? {} : { apiOrigin })}
              initialQuery=""
              locale={locale}
              messages={catalogueSearchMessages}
              suggestionDestination="observe"
            />
          </div>
          {targetUnavailable ? (
            <p className={styles.statusText}>{messages.target.unavailable}</p>
          ) : null}
          {detail === null ? (
            <p className={styles.statusText}>{messages.target.emptyDescription}</p>
          ) : null}
        </div>
      </section>

      {detail !== null && coordinatePairs.length === 0 ? (
        <section aria-labelledby="coordinates-unavailable-heading" className={styles.statePanel}>
          <h2 id="coordinates-unavailable-heading">{messages.coordinatesUnavailable.title}</h2>
          <p>{messages.coordinatesUnavailable.description}</p>
        </section>
      ) : null}

      {detail !== null && coordinatePairs.length > 0 ? (
        <>
          <section aria-labelledby="location-heading" className={styles.section}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionIndex}>02</p>
              <h2 className={styles.sectionTitle} id="location-heading">
                {messages.location.title}
              </h2>
              <p className={styles.sectionMeta}>{messages.location.deviceNote}</p>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.locationGrid}>
                <div className={styles.methodPanel}>
                  <p className={styles.panelCopy}>{messages.location.privacyDescription}</p>
                  <div className={styles.actionRow}>
                    <button
                      className={styles.primaryButton}
                      disabled={geoBusy}
                      onClick={handleGeolocation}
                      type="button"
                    >
                      {geoBusy ? messages.location.lookupBusy : messages.location.useMyLocation}
                    </button>
                  </div>
                  {location !== null ? (
                    <p className={styles.currentLocation}>
                      {formatMessageTemplate(messages.location.currentLocation, {
                        latitude: formatLocationValue(location.latitude, locale),
                        longitude: formatLocationValue(location.longitude, locale),
                      })}
                    </p>
                  ) : null}
                  {locationError ? (
                    <p className={styles.error} role="alert">
                      {locationError}
                    </p>
                  ) : null}
                </div>
                <form className={styles.methodPanel} onSubmit={handleManualLocation}>
                  <fieldset className={styles.fieldset}>
                    <legend className={styles.panelTitle}>{messages.location.manualLegend}</legend>
                    <div className={styles.fieldGrid}>
                      <label className={styles.label} htmlFor="observer-latitude">
                        <span>{messages.location.latitudeLabel}</span>
                        <input
                          aria-describedby="observer-coordinate-help"
                          className={styles.input}
                          id="observer-latitude"
                          inputMode="decimal"
                          onChange={(event) => setLatitude(event.target.value)}
                          placeholder="12.972"
                          type="text"
                          value={latitude}
                        />
                      </label>
                      <label className={styles.label} htmlFor="observer-longitude">
                        <span>{messages.location.longitudeLabel}</span>
                        <input
                          aria-describedby="observer-coordinate-help"
                          className={styles.input}
                          id="observer-longitude"
                          inputMode="decimal"
                          onChange={(event) => setLongitude(event.target.value)}
                          placeholder="77.594"
                          type="text"
                          value={longitude}
                        />
                      </label>
                    </div>
                    <p className={styles.help} id="observer-coordinate-help">
                      {messages.location.coordinateHelp}
                    </p>
                    <div className={styles.actionRow}>
                      <button className={styles.secondaryButton} type="submit">
                        {messages.location.calculateAction}
                      </button>
                    </div>
                  </fieldset>
                </form>
              </div>
            </div>
          </section>

          <section aria-labelledby="night-heading" className={styles.section}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionIndex}>03</p>
              <h2 className={styles.sectionTitle} id="night-heading">
                {messages.night.title}
              </h2>
              <p className={styles.sectionMeta}>
                {formatMessageTemplate(messages.night.timeZoneSummary, { timeZone })}
              </p>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.nightGrid}>
                <label className={styles.label} htmlFor="observing-date">
                  <span className={styles.labelStrong}>{messages.night.dateLabel}</span>
                  <input
                    className={styles.input}
                    id="observing-date"
                    onChange={(event) => setNightDate(event.target.value)}
                    type="date"
                    value={activeNightDate}
                  />
                  <span className={styles.help}>{messages.night.dateHelp}</span>
                </label>
                <label className={styles.label} htmlFor="selected-time">
                  <span className={styles.labelStrong}>{messages.night.selectedTimeLabel}</span>
                  <input
                    className={styles.input}
                    id="selected-time"
                    onChange={(event) => setSelectedTime(event.target.value)}
                    type="time"
                    value={selectedTime}
                  />
                  <span className={styles.help}>{messages.night.selectedTimeHelp}</span>
                </label>
              </div>
              <div className={styles.actionRow}>
                {activeNightDate === localDateString(new Date()) ? (
                  <button className={styles.secondaryButton} onClick={useNow} type="button">
                    {messages.night.nowAction}
                  </button>
                ) : null}
              </div>
              {activeNightDate !== "" && isValidNightDate(activeNightDate) ? (
                <p className={styles.nightSummary}>
                  {formatMessageTemplate(messages.night.summary, {
                    date: formatObservationDateLabel(activeNightDate, timeZone, locale),
                  })}
                </p>
              ) : null}
            </div>
          </section>

          {coordinatePairs.length > 1 ? (
            <section aria-labelledby="source-selector-heading" className={styles.sourceSelector}>
              <label className={styles.sourceLabel} htmlFor="coordinate-source">
                <span className={styles.sourceTitle} id="source-selector-heading">
                  {messages.coordinateSource.heading}
                </span>
                <span className={styles.sourceDescription}>
                  {messages.coordinateSource.description}
                </span>
                <select
                  className={styles.select}
                  id="coordinate-source"
                  onChange={(event) => setSelectedSourceKey(event.target.value)}
                  value={selectedCoordinate?.sourceKey ?? ""}
                >
                  {coordinatePairs.map((pair) => (
                    <option key={pair.sourceKey} value={pair.sourceKey}>
                      {formatMessageTemplate(messages.coordinateSource.option, {
                        datasetName: pair.source.dataset.name,
                        sourceRecordId: pair.source.source_record_id,
                      })}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : null}

          {location === null ? (
            <section aria-live="polite" className={styles.statePanel}>
              <h2>{messages.states.locationRequired.title}</h2>
              <p>{messages.states.locationRequired.description}</p>
            </section>
          ) : plan !== null ? (
            <PlannerResults
              coordinateDisclosureMessages={coordinateDisclosureMessages}
              journalEntryMessages={journalEntryMessages}
              locale={locale}
              messages={messages}
              plan={plan}
              targetEntityId={detail.id}
              targetEntityType={detail.entity_type}
              targetName={targetTitle}
              targetSlug={slug ?? ""}
              timeZone={timeZone}
              nightDate={activeNightDate}
            />
          ) : (
            <section aria-live="polite" className={styles.statePanel}>
              <h2>{messages.states.invalidTime.title}</h2>
              <p>{messages.states.invalidTime.description}</p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
