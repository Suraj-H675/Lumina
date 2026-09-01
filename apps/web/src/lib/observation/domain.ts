import * as Astronomy from "astronomy-engine";

import type { EntityDetailResponse } from "@lumina/api-client";

/** The accepted Gaia DR3 astrometry vocabulary exposed by the public API. */
export const RIGHT_ASCENSION_QUANTITY_CODE = "gaia_icrs_right_ascension";
export const DECLINATION_QUANTITY_CODE = "gaia_icrs_declination";
export const DEGREES_UNIT_CODE = "deg";
export const ASTROMETRY_DATASET_CODE = "gaia-source-astrometry";
export const ASTROMETRY_PROVIDER_CODE = "esa-gaia";
export const ASTROMETRY_RELEASE = "dr3";
export const GAIA_REFERENCE_EPOCH = 2016.0;
/** The reviewed SIMBAD Messier catalogue position vocabulary. */
export const MESSIER_RIGHT_ASCENSION_QUANTITY_CODE = "icrs_right_ascension_j2000";
export const MESSIER_DECLINATION_QUANTITY_CODE = "icrs_declination_j2000";
export const MESSIER_DATASET_CODE = "messier-j2000";
export const MESSIER_PROVIDER_CODE = "cds-simbad";
export const MESSIER_RELEASE = "v1";
export const MESSIER_V2_RELEASE = "v2";
export const MESSIER_REFERENCE_EPOCH = 2000.0;

type CatalogueSourceReference = NonNullable<
  EntityDetailResponse["quantities"][number]["current_selection"]
>["measurement"]["source"];

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const PLOT_PADDING_MS = 60 * MINUTE_MS;
const PLOT_STEP_MS = 15 * MINUTE_MS;
const MAX_PLOT_SAMPLES = 100;
const STAR = Astronomy.Body.Star1;

export type ObserverLocation = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type CoordinatePair = Readonly<{
  declinationDegrees: number;
  epoch: number;
  originalDeclination: string;
  originalRightAscension: string;
  rightAscensionDegrees: number;
  source: CatalogueSourceReference;
  sourceKey: string;
}>;

export type HorizontalPosition = Readonly<{
  altitude: number;
  azimuth: number;
  compass: string;
}>;

export type AltitudeSample = Readonly<{
  altitude: number;
  instant: Date;
}>;

export type TimedEvent = Readonly<{
  kind: "time";
  instant: Date;
}>;

export type UnavailableEvent = Readonly<{
  kind: "unavailable";
}>;

export type NightEvent = TimedEvent | UnavailableEvent;

export type TargetEvent = Readonly<{
  kind: "circumpolar" | "never-rises" | "not-during-night" | "time" | "unavailable";
  instant?: Date;
}>;

export type TargetVisibility = "circumpolar" | "never-rises" | "rises-and-sets" | "unavailable";

export type NightBoundaries = Readonly<{
  astronomicalDawn: NightEvent;
  astronomicalDusk: NightEvent;
  astronomicalDarkness: Readonly<{ end: Date; start: Date }> | null;
  sunrise: NightEvent;
  sunset: NightEvent;
}>;

export type ObservationPlan = Readonly<{
  coordinate: CoordinatePair;
  location: ObserverLocation;
  maxDuringDarkness: AltitudeSample | null;
  night: NightBoundaries;
  plotEnd: Date;
  plotStart: Date;
  samples: ReadonlyArray<AltitudeSample>;
  selected: Readonly<{ instant: Date; position: HorizontalPosition }>;
  targetEvents: Readonly<{
    rise: TargetEvent;
    set: TargetEvent;
    transit: TargetEvent;
  }>;
  targetVisibility: TargetVisibility;
}>;

type CoordinateCandidate = Readonly<{
  declination?: Readonly<{ original: string; value: number }>;
  rightAscension?: Readonly<{ original: string; value: number }>;
  source: CatalogueSourceReference;
  sourceKey: string;
  epoch: number;
}>;

const CARDINAL_DIRECTIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
const NIGHT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/u;

/**
 * Parses only a finite decimal lexeme. Scientific catalogue input is never
 * normalized or unit-converted here; the caller must separately verify its
 * accepted unit.
 */
export function parseFiniteDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Validates the browser/manual observer coordinate contract. */
export function validateObserverLocation(
  location: Readonly<{ latitude: number; longitude: number }>,
): ObserverLocation | null {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  if (location.latitude < -90 || location.latitude > 90) return null;
  if (location.longitude < -180 || location.longitude > 180) return null;
  return { latitude: location.latitude, longitude: location.longitude };
}

/** Parses and validates manual latitude/longitude fields without a geocoder. */
export function parseObserverLocationInputs(
  latitude: string,
  longitude: string,
): ObserverLocation | null {
  const parsedLatitude = parseFiniteDecimal(latitude);
  const parsedLongitude = parseFiniteDecimal(longitude);
  if (parsedLatitude === null || parsedLongitude === null) return null;
  return validateObserverLocation({ latitude: parsedLatitude, longitude: parsedLongitude });
}

/** Keeps browser geolocation failures mapped to the accepted planner copy. */
export function observerGeolocationErrorMessage(code: number): string {
  if (code === 1) return "Location permission was denied. You can enter coordinates manually.";
  if (code === 2) return "Your browser could not determine a location. Try manual coordinates.";
  if (code === 3) return "Location lookup timed out. Try again or enter coordinates manually.";
  return "Location lookup was unavailable. Enter coordinates manually instead.";
}

/** Returns the stable local source identity used when pairing RA with Dec. */
function sourceKey(source: CatalogueSourceReference): string {
  return [
    source.provider.code,
    source.dataset.code,
    source.dataset.release_version,
    source.source_record_id,
  ].join("\u001f");
}

export type CoordinateProfile = Readonly<{
  provider: string;
  dataset: string;
  release: string;
  rightAscension: string;
  declination: string;
  epoch: number;
}>;

const ACCEPTED_COORDINATE_PROFILES: ReadonlyArray<CoordinateProfile> = [
  {
    provider: ASTROMETRY_PROVIDER_CODE,
    dataset: ASTROMETRY_DATASET_CODE,
    release: ASTROMETRY_RELEASE,
    rightAscension: RIGHT_ASCENSION_QUANTITY_CODE,
    declination: DECLINATION_QUANTITY_CODE,
    epoch: GAIA_REFERENCE_EPOCH,
  },
  {
    provider: MESSIER_PROVIDER_CODE,
    dataset: MESSIER_DATASET_CODE,
    release: MESSIER_RELEASE,
    rightAscension: MESSIER_RIGHT_ASCENSION_QUANTITY_CODE,
    declination: MESSIER_DECLINATION_QUANTITY_CODE,
    epoch: MESSIER_REFERENCE_EPOCH,
  },
  {
    provider: MESSIER_PROVIDER_CODE,
    dataset: MESSIER_DATASET_CODE,
    release: MESSIER_V2_RELEASE,
    rightAscension: MESSIER_RIGHT_ASCENSION_QUANTITY_CODE,
    declination: MESSIER_DECLINATION_QUANTITY_CODE,
    epoch: MESSIER_REFERENCE_EPOCH,
  },
];

export function coordinateProfileForSource(
  source: CatalogueSourceReference,
): CoordinateProfile | null {
  return (
    ACCEPTED_COORDINATE_PROFILES.find(
      (profile) =>
        source.provider.code === profile.provider &&
        source.dataset.code === profile.dataset &&
        source.dataset.release_version === profile.release,
    ) ?? null
  );
}

/**
 * Returns the public-safe epoch disclosure for an accepted coordinate profile.
 * The wording is kept here so all observing surfaces describe the same
 * catalogue semantics.
 */
export function getCoordinateDisclosure(profile: CoordinateProfile): string {
  const epoch = `J${profile.epoch.toFixed(1)}`;
  if (
    profile.provider === ASTROMETRY_PROVIDER_CODE &&
    profile.dataset === ASTROMETRY_DATASET_CODE &&
    profile.release === ASTROMETRY_RELEASE &&
    profile.rightAscension === RIGHT_ASCENSION_QUANTITY_CODE &&
    profile.declination === DECLINATION_QUANTITY_CODE
  ) {
    return `Gaia DR3 catalogue position at reference epoch ${epoch}. Proper motion is not propagated.`;
  }
  if (
    profile.provider === MESSIER_PROVIDER_CODE &&
    profile.dataset === MESSIER_DATASET_CODE &&
    (profile.release === MESSIER_RELEASE || profile.release === MESSIER_V2_RELEASE) &&
    profile.rightAscension === MESSIER_RIGHT_ASCENSION_QUANTITY_CODE &&
    profile.declination === MESSIER_DECLINATION_QUANTITY_CODE
  ) {
    if (profile.release === MESSIER_V2_RELEASE) {
      return `SIMBAD Messier ICRS J2000 resolver-record catalogue anchor at reference epoch ${epoch}. It is not asserted to be a geometric target centre; no epoch propagation is applied.`;
    }
    return `SIMBAD Messier J2000 catalogue position at reference epoch ${epoch}. No epoch propagation is applied.`;
  }
  return `Reviewed catalogue position at reference epoch ${epoch}. No epoch propagation is applied.`;
}

/**
 * Extracts only complete, accepted coordinate pairs. Pairing includes
 * provider, dataset, release, and source-record identity; entity membership
 * alone is deliberately insufficient.
 */
export function extractCoordinatePairs(detail: EntityDetailResponse): Array<CoordinatePair> {
  const candidates = new Map<string, CoordinateCandidate>();

  for (const entry of detail.quantities) {
    const selection = entry.current_selection;
    if (selection === null || selection.measurement.unit.code !== DEGREES_UNIT_CODE) continue;
    const source = selection.measurement.source;
    const profile = coordinateProfileForSource(source);
    if (profile === null) continue;
    const code = entry.quantity.code;
    if (code !== profile.rightAscension && code !== profile.declination) continue;
    const parsed = parseFiniteDecimal(selection.measurement.value);
    if (parsed === null) continue;

    const validRange =
      code === profile.rightAscension ? parsed >= 0 && parsed < 360 : parsed >= -90 && parsed <= 90;
    if (!validRange) continue;

    const key = sourceKey(source);
    const current = candidates.get(key) ?? { source, sourceKey: key, epoch: profile.epoch };
    candidates.set(
      key,
      code === profile.rightAscension
        ? { ...current, rightAscension: { original: selection.measurement.value, value: parsed } }
        : { ...current, declination: { original: selection.measurement.value, value: parsed } },
    );
  }

  return [...candidates.values()]
    .filter(
      (
        candidate,
      ): candidate is CoordinateCandidate & {
        declination: Readonly<{ original: string; value: number }>;
        rightAscension: Readonly<{ original: string; value: number }>;
      } => candidate.declination !== undefined && candidate.rightAscension !== undefined,
    )
    .map((candidate) => ({
      declinationDegrees: candidate.declination.value,
      epoch: candidate.epoch,
      originalDeclination: candidate.declination.original,
      originalRightAscension: candidate.rightAscension.original,
      rightAscensionDegrees: candidate.rightAscension.value,
      source: candidate.source,
      sourceKey: candidate.sourceKey,
    }));
}

/** Returns the fixed 16-point compass bucket for the library's north=0 convention. */
export function formatCompassDirection(azimuth: number): string {
  if (!Number.isFinite(azimuth)) return "—";
  const normalized = ((azimuth % 360) + 360) % 360;
  const index = Math.floor((normalized + 11.25) / 22.5) % CARDINAL_DIRECTIONS.length;
  return CARDINAL_DIRECTIONS[index] ?? "—";
}

/** Calculates geometric horizontal coordinates; the omitted refraction mode is intentional. */
export function calculateHorizontalPosition(
  coordinate: CoordinatePair,
  location: ObserverLocation,
  instant: Date,
): HorizontalPosition | null {
  if (!Number.isFinite(instant.getTime())) return null;
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  try {
    const horizontal = Astronomy.Horizon(
      instant,
      observer,
      coordinate.rightAscensionDegrees / 15,
      coordinate.declinationDegrees,
    );
    if (!Number.isFinite(horizontal.altitude) || !Number.isFinite(horizontal.azimuth)) return null;
    return {
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      compass: formatCompassDirection(horizontal.azimuth),
    };
  } catch {
    return null;
  }
}

function validDateParts(nightDate: string): { day: number; month: number; year: number } | null {
  const match = NIGHT_DATE_PATTERN.exec(nightDate);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

export function isValidNightDate(nightDate: string): boolean {
  return validDateParts(nightDate) !== null;
}

/** Builds an instant in the browser/device time zone for the selected night. */
export function localInstantForNightTime(nightDate: string, time: string): Date | null {
  const parts = validDateParts(nightDate);
  const match = TIME_PATTERN.exec(time);
  if (parts === null || match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const instant = new Date(parts.year, parts.month - 1, parts.day, hours, minutes, 0, 0);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

export function localDateString(instant: Date): string {
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, "0");
  const day = String(instant.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localNoon(nightDate: string): Date {
  const parts = validDateParts(nightDate);
  if (parts === null) throw new Error("Invalid night date");
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

function eventDate(event: Astronomy.AstroTime | null): Date | null {
  if (event === null || !Number.isFinite(event.date.getTime())) return null;
  return event.date;
}

function searchAltitude(
  body: Astronomy.Body,
  observer: Astronomy.Observer,
  direction: 1 | -1,
  start: Date,
  limitDays: number,
  altitude: number,
): Date | null {
  try {
    return eventDate(
      Astronomy.SearchAltitude(body, observer, direction, start, limitDays, altitude),
    );
  } catch {
    return null;
  }
}

function calculateNightBoundaries(
  nightDate: string,
  observer: Astronomy.Observer,
): NightBoundaries {
  const noon = localNoon(nightDate);
  const sunset = searchAltitude(Astronomy.Body.Sun, observer, -1, noon, 2, 0);
  const sunsetSearchStart = sunset === null ? noon : new Date(sunset.getTime() + 1_000);
  const sunrise = searchAltitude(Astronomy.Body.Sun, observer, 1, sunsetSearchStart, 2, 0);
  const dusk = searchAltitude(Astronomy.Body.Sun, observer, -1, noon, 2, -18);
  const dawnSearchStart = dusk === null ? noon : new Date(dusk.getTime() + 1_000);
  const dawn = searchAltitude(Astronomy.Body.Sun, observer, 1, dawnSearchStart, 2, -18);

  const darkness =
    dusk !== null && dawn !== null && dusk.getTime() < dawn.getTime()
      ? { end: dawn, start: dusk }
      : null;

  return {
    astronomicalDawn: dawn === null ? { kind: "unavailable" } : { instant: dawn, kind: "time" },
    astronomicalDusk: dusk === null ? { kind: "unavailable" } : { instant: dusk, kind: "time" },
    astronomicalDarkness: darkness,
    sunrise: sunrise === null ? { kind: "unavailable" } : { instant: sunrise, kind: "time" },
    sunset: sunset === null ? { kind: "unavailable" } : { instant: sunset, kind: "time" },
  };
}

/** Calculates the shared solar boundaries for a validated selected night. */
export function computeNightBoundaries(
  location: ObserverLocation,
  nightDate: string,
): NightBoundaries | null {
  if (!isValidNightDate(nightDate)) return null;
  const validatedLocation = validateObserverLocation(location);
  if (validatedLocation === null) return null;
  try {
    const observer = new Astronomy.Observer(
      validatedLocation.latitude,
      validatedLocation.longitude,
      0,
    );
    return calculateNightBoundaries(nightDate, observer);
  } catch {
    return null;
  }
}

function defineStar(coordinate: CoordinatePair): void {
  Astronomy.DefineStar(
    STAR,
    coordinate.rightAscensionDegrees / 15,
    coordinate.declinationDegrees,
    1_000,
  );
}

function targetPosition(
  coordinate: CoordinatePair,
  observer: Astronomy.Observer,
  instant: Date,
): HorizontalPosition | null {
  return calculateHorizontalPosition(
    coordinate,
    { latitude: observer.latitude, longitude: observer.longitude },
    instant,
  );
}

function classifyTargetVisibility(
  coordinate: CoordinatePair,
  observer: Astronomy.Observer,
  start: Date,
): TargetVisibility {
  const positions: Array<number> = [];
  for (let index = 0; index <= 24; index += 1) {
    const instant = new Date(start.getTime() + (index * DAY_MS) / 24);
    const position = targetPosition(coordinate, observer, instant);
    if (position === null) return "unavailable";
    positions.push(position.altitude);
  }
  if (positions.every((altitude) => altitude <= 0)) return "never-rises";
  if (positions.every((altitude) => altitude > 0)) return "circumpolar";
  return "rises-and-sets";
}

function targetHorizonEvent(
  coordinate: CoordinatePair,
  observer: Astronomy.Observer,
  visibility: TargetVisibility,
  direction: 1 | -1,
  start: Date,
  end: Date,
): TargetEvent {
  if (visibility === "never-rises") return { kind: "never-rises" };
  if (visibility === "circumpolar") return { kind: "circumpolar" };
  if (visibility === "unavailable") return { kind: "unavailable" };
  defineStar(coordinate);
  const found = searchAltitude(STAR, observer, direction, start, 2, 0);
  if (found !== null && found.getTime() >= start.getTime() && found.getTime() <= end.getTime()) {
    return { instant: found, kind: "time" };
  }
  return { kind: "not-during-night" };
}

function targetTransit(
  coordinate: CoordinatePair,
  observer: Astronomy.Observer,
  visibility: TargetVisibility,
  start: Date,
  end: Date,
): TargetEvent {
  if (visibility === "unavailable") return { kind: "unavailable" };
  defineStar(coordinate);
  try {
    const previous = Astronomy.SearchHourAngle(STAR, observer, 0, start, -1).time.date;
    if (previous.getTime() >= start.getTime() && previous.getTime() <= end.getTime()) {
      return { instant: previous, kind: "time" };
    }
    const next = Astronomy.SearchHourAngle(STAR, observer, 0, start, 1).time.date;
    if (next.getTime() >= start.getTime() && next.getTime() <= end.getTime()) {
      return { instant: next, kind: "time" };
    }
  } catch {
    return { kind: "unavailable" };
  }
  return { kind: "not-during-night" };
}

function sampleAltitude(
  coordinate: CoordinatePair,
  location: ObserverLocation,
  start: Date,
  end: Date,
): Array<AltitudeSample> {
  const duration = Math.max(0, end.getTime() - start.getTime());
  const requestedCount = Math.ceil(duration / PLOT_STEP_MS) + 1;
  const count = Math.min(MAX_PLOT_SAMPLES, Math.max(2, requestedCount));
  const samples: Array<AltitudeSample> = [];
  for (let index = 0; index < count; index += 1) {
    const fraction = count === 1 ? 0 : index / (count - 1);
    const instant = new Date(start.getTime() + duration * fraction);
    const position = calculateHorizontalPosition(coordinate, location, instant);
    if (position === null) continue;
    samples.push({ altitude: position.altitude, instant });
  }
  return samples;
}

function maxAltitudeDuringDarkness(
  coordinate: CoordinatePair,
  location: ObserverLocation,
  darkness: Readonly<{ end: Date; start: Date }> | null,
): AltitudeSample | null {
  if (darkness === null) return null;
  const samples = sampleAltitude(coordinate, location, darkness.start, darkness.end);
  return samples.reduce<AltitudeSample | null>(
    (maximum, sample) =>
      maximum === null || sample.altitude > maximum.altitude ? sample : maximum,
    null,
  );
}

/**
 * Computes the complete bounded observation plan from absolute instants. The
 * selected night is interpreted as its local evening through the following
 * morning; the library itself receives Date objects and therefore operates on
 * absolute UTC instants internally.
 */
export function computeObservationPlan(
  coordinate: CoordinatePair,
  location: ObserverLocation,
  nightDate: string,
  selectedInstant: Date,
): ObservationPlan | null {
  if (!isValidNightDate(nightDate) || !Number.isFinite(selectedInstant.getTime())) return null;
  const validatedLocation = validateObserverLocation(location);
  if (validatedLocation === null) return null;

  const observer = new Astronomy.Observer(
    validatedLocation.latitude,
    validatedLocation.longitude,
    0,
  );
  const night = calculateNightBoundaries(nightDate, observer);
  const fallbackPlotEnd = localInstantForNightTime(nightDate, "06:00");
  const plotStart = night.astronomicalDarkness?.start
    ? new Date(night.astronomicalDarkness.start.getTime() - PLOT_PADDING_MS)
    : (localInstantForNightTime(nightDate, "18:00") ?? localNoon(nightDate));
  const plotEnd = night.astronomicalDarkness?.end
    ? new Date(night.astronomicalDarkness.end.getTime() + PLOT_PADDING_MS)
    : fallbackPlotEnd !== null
      ? new Date(fallbackPlotEnd.getTime() + DAY_MS)
      : new Date(plotStart.getTime() + 12 * 60 * MINUTE_MS);
  const visibility = classifyTargetVisibility(coordinate, observer, localNoon(nightDate));
  const samples = sampleAltitude(coordinate, validatedLocation, plotStart, plotEnd);
  const selectedPosition = calculateHorizontalPosition(
    coordinate,
    validatedLocation,
    selectedInstant,
  );
  if (selectedPosition === null || samples.length < 2) return null;

  return {
    coordinate,
    location: validatedLocation,
    maxDuringDarkness: maxAltitudeDuringDarkness(
      coordinate,
      validatedLocation,
      night.astronomicalDarkness,
    ),
    night,
    plotEnd,
    plotStart,
    samples,
    selected: { instant: selectedInstant, position: selectedPosition },
    targetEvents: {
      rise: targetHorizonEvent(coordinate, observer, visibility, 1, plotStart, plotEnd),
      set: targetHorizonEvent(coordinate, observer, visibility, -1, plotStart, plotEnd),
      transit: targetTransit(coordinate, observer, visibility, plotStart, plotEnd),
    },
    targetVisibility: visibility,
  };
}
