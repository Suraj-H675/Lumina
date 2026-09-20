"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import type { EntityDetailResponse } from "@lumina/api-client";

import { CatalogueSearchBox } from "./catalogue-search-box";
import { JournalEntryButton } from "./journal-entry-button";
import { ObservationConditions } from "./observation-conditions";
import { SaveObservationPlanButton } from "./save-observation-plan-button";
import { SkyFinder } from "./sky-finder";
import { entityTypeLabel } from "../lib/catalog-display";
import {
  formatLocaleDateTime,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ObservationPlannerMessages } from "../lib/i18n/messages/types";
import {
  computeObservationPlan,
  coordinateProfileForSource,
  extractCoordinatePairs,
  formatCompassDirection,
  getCoordinateDisclosure,
  isValidNightDate,
  localDateString,
  localInstantForNightTime,
  parseObserverLocationInputs,
  type NightEvent,
  type ObservationPlan,
  type ObserverLocation,
  type TargetEvent,
} from "../lib/observation/domain";

export type ObservationPlannerProps = Readonly<{
  apiOrigin?: string;
  detail: EntityDetailResponse | null;
  initialDate?: string;
  locale: PublishedLocale;
  messages: ObservationPlannerMessages;
  slug: string | null;
  targetUnavailable: boolean;
}>;

const EMPTY_TIME = "22:00";

function localTimeString(instant: Date): string {
  return `${String(instant.getHours()).padStart(2, "0")}:${String(instant.getMinutes()).padStart(2, "0")}`;
}

function useBrowserDate(initialDate: string | undefined): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => initialDate ?? localDateString(new Date()),
    () => initialDate ?? "",
  );
}

function useBrowserTimeZone(): string {
  return useSyncExternalStore(
    () => () => undefined,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
}

function formatDateLabel(nightDate: string, timeZone: string, locale: PublishedLocale): string {
  const instant = localInstantForNightTime(nightDate, "12:00");
  if (instant === null) return nightDate;
  return formatLocaleDateTime(instant, locale, {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  });
}

function formatTime(instant: Date, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatShortTime(instant: Date, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
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
  return event.kind === "time" ? formatTime(event.instant, timeZone, locale) : unavailableMessage;
}

function formatTargetEvent(
  event: TargetEvent,
  timeZone: string,
  locale: PublishedLocale,
  messages: ObservationPlannerMessages["results"]["events"],
): string {
  if (event.kind === "time" && event.instant !== undefined)
    return formatTime(event.instant, timeZone, locale);
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
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
      <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function CoordinateSource({
  messages,
  plan,
}: Readonly<{
  messages: ObservationPlannerMessages["results"]["source"];
  plan: ObservationPlan;
}>) {
  const { coordinate } = plan;
  const profile = coordinateProfileForSource(coordinate.source);
  return (
    <section
      aria-labelledby="position-source-heading"
      className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4"
    >
      <h3 className="text-sm font-semibold text-[var(--foreground)]" id="position-source-heading">
        {messages.title}
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {coordinate.source.provider.name} · {coordinate.source.dataset.name} (
        {coordinate.source.dataset.release_version})
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        {messages.sourceRecordLabel}{" "}
        <span className="font-mono">{coordinate.source.source_record_id}</span> ·{" "}
        {profile === null ? messages.reviewedPosition : getCoordinateDisclosure(profile)}
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
  const firstLabel = formatShortTime(plan.plotStart, timeZone, locale);
  const middleLabel = formatShortTime(
    new Date((plan.plotStart.getTime() + plan.plotEnd.getTime()) / 2),
    timeZone,
    locale,
  );
  const lastLabel = formatShortTime(plan.plotEnd, timeZone, locale);
  const accessibleSummary =
    maxSample === null
      ? messages.accessibleNoDarkness
      : formatMessageTemplate(messages.accessibleHighest, {
          altitude: formatAltitude(maxSample.altitude, locale),
          time: formatTime(maxSample.instant, timeZone, locale),
        });

  return (
    <figure aria-labelledby={`${chartId}-caption`} className="space-y-3">
      <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 sm:p-4">
        <svg
          aria-hidden="true"
          className="h-auto w-full"
          role="presentation"
          viewBox={`0 0 ${width} ${height}`}
        >
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
      <figcaption className="text-sm leading-6 text-[var(--muted)]" id={`${chartId}-caption`}>
        <span className="font-medium text-[var(--foreground)]">{messages.title}</span>{" "}
        {selectedInPlot ? messages.descriptionWithSelectedTime : messages.description}
      </figcaption>
      <p className="sr-only">{accessibleSummary}</p>
    </figure>
  );
}

function PlannerResults({
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
    <section aria-labelledby="planner-results-heading" className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.results.eyebrow}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight" id="planner-results-heading">
          {highest !== null && highest.altitude > 0
            ? formatMessageTemplate(messages.results.highestHeading, {
                time: formatTime(highest.instant, timeZone, locale),
              })
            : messages.results.belowHorizonHeading}
        </h2>
        {highest !== null && highest.altitude > 0 ? (
          <p className="text-[var(--muted)]">
            {formatMessageTemplate(messages.results.highestAltitude, {
              altitude: formatAltitude(highest.altitude, locale),
            })}
          </p>
        ) : null}
        <JournalEntryButton
          entityId={targetEntityId}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.results.selectedTime}
          </p>
          <p className="mt-2 font-mono text-2xl text-[var(--foreground)]">
            {formatAltitude(plan.selected.position.altitude, locale)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{messages.results.altitudeGeometric}</p>
          <p className="mt-3 text-lg font-medium text-[var(--foreground)]">
            {formatAzimuth(plan.selected.position.azimuth, locale)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">{messages.results.azimuthConvention}</p>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:col-span-2">
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            {messages.results.nightBoundaries}
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
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
            <p className="mt-3 text-sm text-[var(--muted)]">
              {messages.results.darknessUnavailable}
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            {messages.results.solarBoundaryDescription}
          </p>
        </div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">
          {messages.results.targetEvents.title}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.results.targetEvents.description, { timeZone })}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
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

      <SkyFinder plan={plan} targetName={targetName} targetSlug={targetSlug} />
      <AltitudeChart locale={locale} messages={messages.chart} plan={plan} timeZone={timeZone} />
      <ObservationConditions nightDate={nightDate} plan={plan} timeZone={timeZone} />
      <CoordinateSource messages={messages.results.source} plan={plan} />
    </section>
  );
}

export function ObservationPlanner({
  apiOrigin,
  detail,
  initialDate,
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
    <div className="space-y-10">
      <header className="space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{targetTitle}</h1>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              {messages.header.description}
            </p>
          </div>
          {detail !== null && slug !== null ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              href={`/objects/${slug}`}
            >
              {messages.header.openObject}
            </Link>
          ) : null}
        </div>
        {detail !== null ? (
          <p className="text-sm text-[var(--muted)]">
            {formatMessageTemplate(messages.header.targetSummary, {
              entityType: entityTypeLabel(detail.entity_type),
            })}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="target-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 className="text-xl font-semibold" id="target-heading">
            {messages.target.heading}
          </h2>
          <span className="text-sm text-[var(--muted)]">{messages.target.reviewedSuggestions}</span>
        </div>
        <div className="relative max-w-2xl">
          <CatalogueSearchBox
            {...(apiOrigin === undefined ? {} : { apiOrigin })}
            initialQuery=""
            suggestionDestination="observe"
          />
        </div>
        {targetUnavailable ? (
          <p className="text-sm text-[var(--muted)]">{messages.target.unavailable}</p>
        ) : null}
        {detail === null ? (
          <p className="max-w-2xl leading-7 text-[var(--muted)]">
            {messages.target.emptyDescription}
          </p>
        ) : null}
      </section>

      {detail !== null && coordinatePairs.length === 0 ? (
        <section
          aria-labelledby="coordinates-unavailable-heading"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-5"
        >
          <h2 className="text-xl font-semibold" id="coordinates-unavailable-heading">
            {messages.coordinatesUnavailable.title}
          </h2>
          <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
            {messages.coordinatesUnavailable.description}
          </p>
        </section>
      ) : null}

      {detail !== null && coordinatePairs.length > 0 ? (
        <>
          <section aria-labelledby="location-heading" className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
              <h2 className="text-xl font-semibold" id="location-heading">
                {messages.location.title}
              </h2>
              <span className="text-sm text-[var(--muted)]">{messages.location.deviceNote}</span>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <p className="text-sm leading-6 text-[var(--muted)]">
                  {messages.location.privacyDescription}
                </p>
                <button
                  className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--background)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70"
                  disabled={geoBusy}
                  onClick={handleGeolocation}
                  type="button"
                >
                  {geoBusy ? messages.location.lookupBusy : messages.location.useMyLocation}
                </button>
                {location !== null ? (
                  <p className="mt-4 text-sm text-[var(--foreground)]">
                    {formatMessageTemplate(messages.location.currentLocation, {
                      latitude: formatLocationValue(location.latitude, locale),
                      longitude: formatLocationValue(location.longitude, locale),
                    })}
                  </p>
                ) : null}
                {locationError ? (
                  <p className="mt-3 text-sm text-[var(--focus)]" role="alert">
                    {locationError}
                  </p>
                ) : null}
              </div>
              <form
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
                onSubmit={handleManualLocation}
              >
                <fieldset>
                  <legend className="text-sm font-semibold text-[var(--foreground)]">
                    {messages.location.manualLegend}
                  </legend>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label
                      className="space-y-1.5 text-sm text-[var(--muted)]"
                      htmlFor="observer-latitude"
                    >
                      <span className="block">{messages.location.latitudeLabel}</span>
                      <input
                        aria-describedby="observer-coordinate-help"
                        className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                        id="observer-latitude"
                        inputMode="decimal"
                        onChange={(event) => setLatitude(event.target.value)}
                        placeholder="12.972"
                        type="text"
                        value={latitude}
                      />
                    </label>
                    <label
                      className="space-y-1.5 text-sm text-[var(--muted)]"
                      htmlFor="observer-longitude"
                    >
                      <span className="block">{messages.location.longitudeLabel}</span>
                      <input
                        aria-describedby="observer-coordinate-help"
                        className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                        id="observer-longitude"
                        inputMode="decimal"
                        onChange={(event) => setLongitude(event.target.value)}
                        placeholder="77.594"
                        type="text"
                        value={longitude}
                      />
                    </label>
                  </div>
                  <p
                    className="mt-3 text-xs leading-5 text-[var(--muted)]"
                    id="observer-coordinate-help"
                  >
                    {messages.location.coordinateHelp}
                  </p>
                  <button
                    className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
                    type="submit"
                  >
                    {messages.location.calculateAction}
                  </button>
                </fieldset>
              </form>
            </div>
          </section>

          <section aria-labelledby="night-heading" className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
              <h2 className="text-xl font-semibold" id="night-heading">
                {messages.night.title}
              </h2>
              <span className="text-sm text-[var(--muted)]">
                {formatMessageTemplate(messages.night.timeZoneSummary, { timeZone })}
              </span>
            </div>
            <div className="grid gap-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="observing-date">
                <span className="block font-medium text-[var(--foreground)]">
                  {messages.night.dateLabel}
                </span>
                <input
                  className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  id="observing-date"
                  onChange={(event) => setNightDate(event.target.value)}
                  type="date"
                  value={activeNightDate}
                />
                <span className="block text-xs leading-5">{messages.night.dateHelp}</span>
              </label>
              <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="selected-time">
                <span className="block font-medium text-[var(--foreground)]">
                  {messages.night.selectedTimeLabel}
                </span>
                <input
                  className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  id="selected-time"
                  onChange={(event) => setSelectedTime(event.target.value)}
                  type="time"
                  value={selectedTime}
                />
                <span className="block text-xs leading-5">{messages.night.selectedTimeHelp}</span>
              </label>
            </div>
            {activeNightDate === localDateString(new Date()) ? (
              <button
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
                onClick={useNow}
                type="button"
              >
                {messages.night.nowAction}
              </button>
            ) : null}
            {activeNightDate !== "" && isValidNightDate(activeNightDate) ? (
              <p className="text-sm text-[var(--muted)]">
                {formatMessageTemplate(messages.night.summary, {
                  date: formatDateLabel(activeNightDate, timeZone, locale),
                })}
              </p>
            ) : null}
          </section>

          {coordinatePairs.length > 1 ? (
            <section
              aria-labelledby="source-selector-heading"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
            >
              <label className="space-y-2 text-sm" htmlFor="coordinate-source">
                <span
                  className="block font-semibold text-[var(--foreground)]"
                  id="source-selector-heading"
                >
                  {messages.coordinateSource.heading}
                </span>
                <span className="block text-[var(--muted)]">
                  {messages.coordinateSource.description}
                </span>
                <select
                  className="min-h-11 w-full max-w-2xl rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
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
            <section
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5"
            >
              <h2 className="text-xl font-semibold">{messages.states.locationRequired.title}</h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                {messages.states.locationRequired.description}
              </p>
            </section>
          ) : plan !== null ? (
            <PlannerResults
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
            <section
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5"
            >
              <h2 className="text-xl font-semibold">{messages.states.invalidTime.title}</h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                {messages.states.invalidTime.description}
              </p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
