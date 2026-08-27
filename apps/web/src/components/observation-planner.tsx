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
import { ObservationConditions } from "./observation-conditions";
import { entityTypeLabel } from "../lib/catalog-display";
import {
  computeObservationPlan,
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

type ObservationPlannerProps = Readonly<{
  apiOrigin?: string;
  detail: EntityDetailResponse | null;
  initialDate?: string;
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

function formatDateLabel(nightDate: string, timeZone: string): string {
  const instant = localInstantForNightTime(nightDate, "12:00");
  if (instant === null) return nightDate;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  }).format(instant);
}

function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(instant);
}

function formatShortTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(instant);
}

function formatAltitude(altitude: number): string {
  return `${altitude.toFixed(1)}°`;
}

function formatAzimuth(azimuth: number): string {
  return `${azimuth.toFixed(1)}° · ${formatCompassDirection(azimuth)}`;
}

function formatNightEvent(event: NightEvent, timeZone: string): string {
  return event.kind === "time" ? formatTime(event.instant, timeZone) : "Unavailable";
}

function formatTargetEvent(event: TargetEvent, timeZone: string): string {
  if (event.kind === "time" && event.instant !== undefined)
    return formatTime(event.instant, timeZone);
  if (event.kind === "circumpolar") return "Circumpolar from this latitude";
  if (event.kind === "never-rises") return "Never rises from this latitude";
  if (event.kind === "not-during-night") return "No event during this observing night";
  return "Unavailable";
}

function roundedLocationValue(value: number): string {
  return value.toFixed(3);
}

function errorMessageForGeolocation(code: number): string {
  if (code === 1) return "Location permission was denied. You can enter coordinates manually.";
  if (code === 2) return "Your browser could not determine a location. Try manual coordinates.";
  if (code === 3) return "Location lookup timed out. Try again or enter coordinates manually.";
  return "Location lookup was unavailable. Enter coordinates manually instead.";
}

function eventTimeOrFallback(event: NightEvent, timeZone: string): string {
  return formatNightEvent(event, timeZone);
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

function CoordinateSource({ plan }: Readonly<{ plan: ObservationPlan }>) {
  const { coordinate } = plan;
  return (
    <section
      aria-labelledby="position-source-heading"
      className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4"
    >
      <h3 className="text-sm font-semibold text-[var(--foreground)]" id="position-source-heading">
        Position source
      </h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {coordinate.source.provider.name} · {coordinate.source.dataset.name} (
        {coordinate.source.dataset.release_version})
      </p>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
        Source record <span className="font-mono">{coordinate.source.source_record_id}</span> · Gaia
        DR3 catalogue position at reference epoch J{coordinate.epoch.toFixed(1)}. Proper motion is
        not propagated.
      </p>
    </section>
  );
}

function AltitudeChart({ plan, timeZone }: Readonly<{ plan: ObservationPlan; timeZone: string }>) {
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
  const firstLabel = formatShortTime(plan.plotStart, timeZone);
  const middleLabel = formatShortTime(
    new Date((plan.plotStart.getTime() + plan.plotEnd.getTime()) / 2),
    timeZone,
  );
  const lastLabel = formatShortTime(plan.plotEnd, timeZone);
  const accessibleSummary =
    maxSample === null
      ? "Astronomical darkness is not available for this night."
      : `Highest altitude during astronomical darkness is ${formatAltitude(maxSample.altitude)} at ${formatTime(maxSample.instant, timeZone)}.`;

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
        <span className="font-medium text-[var(--foreground)]">Altitude through the night.</span>{" "}
        The dashed line is the geometric horizon; the shaded interval is astronomical darkness.
        {selectedInPlot ? " The gold marker is the selected time." : ""}
      </figcaption>
      <p className="sr-only">{accessibleSummary}</p>
    </figure>
  );
}

function PlannerResults({
  nightDate,
  plan,
  timeZone,
}: Readonly<{ nightDate: string; plan: ObservationPlan; timeZone: string }>) {
  const highest = plan.maxDuringDarkness;
  return (
    <section aria-labelledby="planner-results-heading" className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Observation geometry
        </p>
        <h2 className="text-2xl font-semibold tracking-tight" id="planner-results-heading">
          {highest !== null && highest.altitude > 0
            ? `Highest during astronomical darkness: ${formatTime(highest.instant, timeZone)}`
            : "The target stays below the horizon during astronomical darkness"}
        </h2>
        {highest !== null && highest.altitude > 0 ? (
          <p className="text-[var(--muted)]">
            Altitude {formatAltitude(highest.altitude)} at the sampled maximum.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Selected time
          </p>
          <p className="mt-2 font-mono text-2xl text-[var(--foreground)]">
            {formatAltitude(plan.selected.position.altitude)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">Altitude · geometric</p>
          <p className="mt-3 text-lg font-medium text-[var(--foreground)]">
            {formatAzimuth(plan.selected.position.azimuth)}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">Azimuth · 0° north, eastward</p>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:col-span-2">
          <p className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
            Night boundaries
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {eventCard("Sunset · geometric", eventTimeOrFallback(plan.night.sunset, timeZone))}
            {eventCard(
              "Astronomical dusk",
              eventTimeOrFallback(plan.night.astronomicalDusk, timeZone),
            )}
            {eventCard(
              "Astronomical dawn",
              eventTimeOrFallback(plan.night.astronomicalDawn, timeZone),
            )}
            {eventCard("Sunrise · geometric", eventTimeOrFallback(plan.night.sunrise, timeZone))}
          </dl>
          {plan.night.astronomicalDarkness === null ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              No astronomical darkness on this night.
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Solar boundaries use geometric center crossings; astronomical darkness means the Sun is
            below −18°.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Rise, transit, set</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Times are calculated for the selected night and shown in {timeZone}.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {eventCard("Rise", formatTargetEvent(plan.targetEvents.rise, timeZone))}
          {eventCard("Meridian transit", formatTargetEvent(plan.targetEvents.transit, timeZone))}
          {eventCard("Set", formatTargetEvent(plan.targetEvents.set, timeZone))}
        </dl>
      </div>

      <AltitudeChart plan={plan} timeZone={timeZone} />
      <ObservationConditions nightDate={nightDate} plan={plan} timeZone={timeZone} />
      <CoordinateSource plan={plan} />
    </section>
  );
}

export function ObservationPlanner({
  apiOrigin,
  detail,
  initialDate,
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
        setLocationError("Enter a latitude from −90 to 90 and a longitude from −180 to 180.");
        return;
      }
      setLocation(parsed);
      setLocationError("");
    },
    [latitude, longitude],
  );

  const handleGeolocation = useCallback(() => {
    setLocationError("");
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationError(
        "This browser does not support location access. Enter coordinates manually.",
      );
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
        setLocationError(errorMessageForGeolocation(error.code));
        setGeoBusy(false);
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 },
    );
  }, []);

  const useNow = useCallback(() => {
    const now = new Date();
    if (activeNightDate === localDateString(now)) setSelectedTime(localTimeString(now));
  }, [activeNightDate]);

  const targetTitle = detail?.canonical_name ?? "Choose an object";

  return (
    <div className="space-y-10">
      <header className="space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Observation planner
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{targetTitle}</h1>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              Find when this catalogue object is highest and where to look from your location. These
              are geometric sky calculations, not a weather or visibility forecast.
            </p>
          </div>
          {detail !== null && slug !== null ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
              href={`/objects/${slug}`}
            >
              Open object
            </Link>
          ) : null}
        </div>
        {detail !== null ? (
          <p className="text-sm text-[var(--muted)]">
            {entityTypeLabel(detail.entity_type)} · select a different target below
          </p>
        ) : null}
      </header>

      <section aria-labelledby="target-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 className="text-xl font-semibold" id="target-heading">
            Target
          </h2>
          <span className="text-sm text-[var(--muted)]">
            Uses the reviewed catalogue suggestions
          </span>
        </div>
        <div className="relative max-w-2xl">
          <CatalogueSearchBox
            {...(apiOrigin === undefined ? {} : { apiOrigin })}
            initialQuery=""
            suggestionDestination="observe"
          />
        </div>
        {targetUnavailable ? (
          <p className="text-sm text-[var(--muted)]">
            That target could not be loaded. Choose another catalogue object.
          </p>
        ) : null}
        {detail === null ? (
          <p className="max-w-2xl leading-7 text-[var(--muted)]">
            Select an object to begin. Observation calculations use only an accepted catalogue
            position.
          </p>
        ) : null}
      </section>

      {detail !== null && coordinatePairs.length === 0 ? (
        <section
          aria-labelledby="coordinates-unavailable-heading"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-5"
        >
          <h2 className="text-xl font-semibold" id="coordinates-unavailable-heading">
            Observation planning unavailable
          </h2>
          <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
            This object does not currently have a usable accepted Gaia ICRS position. Lumina has not
            estimated or substituted coordinates.
          </p>
        </section>
      ) : null}

      {detail !== null && coordinatePairs.length > 0 ? (
        <>
          <section aria-labelledby="location-heading" className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
              <h2 className="text-xl font-semibold" id="location-heading">
                Observer location
              </h2>
              <span className="text-sm text-[var(--muted)]">
                Used on this device for the calculation
              </span>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
                <p className="text-sm leading-6 text-[var(--muted)]">
                  Your precise location stays in this browser. It is not sent to Lumina&apos;s
                  catalogue API.
                </p>
                <button
                  className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--background)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70"
                  disabled={geoBusy}
                  onClick={handleGeolocation}
                  type="button"
                >
                  {geoBusy ? "Looking up location…" : "Use my location"}
                </button>
                {location !== null ? (
                  <p className="mt-4 text-sm text-[var(--foreground)]">
                    Current location {roundedLocationValue(location.latitude)}°,{" "}
                    {roundedLocationValue(location.longitude)}°
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
                    Enter coordinates manually
                  </legend>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label
                      className="space-y-1.5 text-sm text-[var(--muted)]"
                      htmlFor="observer-latitude"
                    >
                      <span className="block">Latitude</span>
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
                      <span className="block">Longitude</span>
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
                    Latitude −90° to 90° · longitude −180° to 180°. No city lookup is used.
                  </p>
                  <button
                    className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
                    type="submit"
                  >
                    Calculate with these coordinates
                  </button>
                </fieldset>
              </form>
            </div>
          </section>

          <section aria-labelledby="night-heading" className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
              <h2 className="text-xl font-semibold" id="night-heading">
                Observing night
              </h2>
              <span className="text-sm text-[var(--muted)]">Times shown in {timeZone}</span>
            </div>
            <div className="grid gap-4 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="observing-date">
                <span className="block font-medium text-[var(--foreground)]">Night of</span>
                <input
                  className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  id="observing-date"
                  onChange={(event) => setNightDate(event.target.value)}
                  type="date"
                  value={activeNightDate}
                />
                <span className="block text-xs leading-5">
                  The evening beginning on this local date, continuing into the next morning.
                </span>
              </label>
              <label className="space-y-1.5 text-sm text-[var(--muted)]" htmlFor="selected-time">
                <span className="block font-medium text-[var(--foreground)]">
                  Selected local time
                </span>
                <input
                  className="min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 font-mono text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  id="selected-time"
                  onChange={(event) => setSelectedTime(event.target.value)}
                  type="time"
                  value={selectedTime}
                />
                <span className="block text-xs leading-5">
                  Inspect altitude and azimuth at one instant; this does not change the night
                  window.
                </span>
              </label>
            </div>
            {activeNightDate === localDateString(new Date()) ? (
              <button
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
                onClick={useNow}
                type="button"
              >
                Now
              </button>
            ) : null}
            {activeNightDate !== "" && isValidNightDate(activeNightDate) ? (
              <p className="text-sm text-[var(--muted)]">
                Night of {formatDateLabel(activeNightDate, timeZone)}
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
                  Coordinate source
                </span>
                <span className="block text-[var(--muted)]">
                  Multiple accepted positions are available; choose which paired source to
                  calculate.
                </span>
                <select
                  className="min-h-11 w-full max-w-2xl rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-3 text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                  id="coordinate-source"
                  onChange={(event) => setSelectedSourceKey(event.target.value)}
                  value={selectedCoordinate?.sourceKey ?? ""}
                >
                  {coordinatePairs.map((pair) => (
                    <option key={pair.sourceKey} value={pair.sourceKey}>
                      {pair.source.dataset.name} · source record {pair.source.source_record_id}
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
              <h2 className="text-xl font-semibold">
                Add a location to calculate the sky position
              </h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                Choose Use my location or enter latitude and longitude. No calculation begins until
                a valid observer location is available.
              </p>
            </section>
          ) : plan !== null ? (
            <PlannerResults plan={plan} timeZone={timeZone} nightDate={activeNightDate} />
          ) : (
            <section
              aria-live="polite"
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-5 py-5"
            >
              <h2 className="text-xl font-semibold">This time could not be calculated</h2>
              <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
                Choose a valid night and local time to try again.
              </p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
