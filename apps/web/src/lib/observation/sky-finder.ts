import * as Astronomy from "astronomy-engine";

import {
  formatCompassDirection,
  validateObserverLocation,
  type HorizontalPosition,
  type ObservationPlan,
  type ObserverLocation,
} from "./domain";

export type SkyProjectionOptions = Readonly<{
  centerX: number;
  centerY: number;
  skyRadius: number;
  belowHorizonPadding?: number;
}>;

export type SkyProjectionPoint = Readonly<{
  altitude: number;
  azimuth: number;
  radialFraction: number;
  radius: number;
  x: number;
  y: number;
}>;

export type BelowHorizonProjectionPoint = Readonly<{
  altitude: number;
  azimuth: number;
  radius: number;
  x: number;
  y: number;
}>;

export type SkyPositionProjection =
  | Readonly<{ kind: "above-horizon"; point: SkyProjectionPoint }>
  | Readonly<{ kind: "below-horizon"; point: BelowHorizonProjectionPoint }>
  | null;

export type SkyFinderTarget = Readonly<{
  name: string;
  position: HorizontalPosition;
}>;

export type SolarSystemBodyName = "Sun" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

export type SkyReferenceMarker = Readonly<{
  body: SolarSystemBodyName;
  name: SolarSystemBodyName;
  position: HorizontalPosition;
}>;

const SOLAR_SYSTEM_BODIES: ReadonlyArray<
  Readonly<{
    body: Astronomy.Body;
    name: SolarSystemBodyName;
  }>
> = [
  { body: Astronomy.Body.Sun, name: "Sun" },
  { body: Astronomy.Body.Mercury, name: "Mercury" },
  { body: Astronomy.Body.Venus, name: "Venus" },
  { body: Astronomy.Body.Mars, name: "Mars" },
  { body: Astronomy.Body.Jupiter, name: "Jupiter" },
  { body: Astronomy.Body.Saturn, name: "Saturn" },
];

const DEFAULT_BELOW_HORIZON_PADDING = 14;

function isFiniteProjectionOption(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validProjectionOptions(options: SkyProjectionOptions): boolean {
  return (
    Number.isFinite(options.centerX) &&
    Number.isFinite(options.centerY) &&
    isFiniteProjectionOption(options.skyRadius) &&
    (options.belowHorizonPadding === undefined ||
      (Number.isFinite(options.belowHorizonPadding) && options.belowHorizonPadding >= 0))
  );
}

function normalizedAzimuth(azimuth: number): number | null {
  if (!Number.isFinite(azimuth) || azimuth < 0 || azimuth > 360) return null;
  return azimuth === 360 ? 0 : azimuth;
}

/** Validates a geometric horizontal position without changing its scientific values. */
export function isValidSkyPosition(
  position: Pick<HorizontalPosition, "altitude" | "azimuth">,
): boolean {
  return (
    Number.isFinite(position.altitude) &&
    position.altitude >= -90 &&
    position.altitude <= 90 &&
    normalizedAzimuth(position.azimuth) !== null
  );
}

function validPositionInputs(
  position: Pick<HorizontalPosition, "altitude" | "azimuth">,
  options: SkyProjectionOptions,
): number | null {
  if (!validProjectionOptions(options) || !isValidSkyPosition(position)) return null;
  return normalizedAzimuth(position.azimuth);
}

/**
 * Projects an above-horizon position into the circular horizon view.
 * North is 0° and is at the top; azimuth increases clockwise toward east.
 */
export function projectHorizontalPosition(
  position: Pick<HorizontalPosition, "altitude" | "azimuth">,
  options: SkyProjectionOptions,
): SkyProjectionPoint | null {
  const azimuth = validPositionInputs(position, options);
  if (azimuth === null || position.altitude < 0) return null;

  const radialFraction = (90 - position.altitude) / 90;
  const radius = options.skyRadius * radialFraction;
  const azimuthRadians = (azimuth * Math.PI) / 180;
  return {
    altitude: position.altitude,
    azimuth,
    radialFraction,
    radius,
    x: options.centerX + radius * Math.sin(azimuthRadians),
    y: options.centerY - radius * Math.cos(azimuthRadians),
  };
}

/** Places a below-horizon direction just beyond the true-azimuth point on the rim. */
export function projectBelowHorizonDirection(
  position: Pick<HorizontalPosition, "altitude" | "azimuth">,
  options: SkyProjectionOptions,
): BelowHorizonProjectionPoint | null {
  const azimuth = validPositionInputs(position, options);
  if (azimuth === null || position.altitude >= 0) return null;

  const padding = options.belowHorizonPadding ?? DEFAULT_BELOW_HORIZON_PADDING;
  const radius = options.skyRadius + padding;
  const azimuthRadians = (azimuth * Math.PI) / 180;
  return {
    altitude: position.altitude,
    azimuth,
    radius,
    x: options.centerX + radius * Math.sin(azimuthRadians),
    y: options.centerY - radius * Math.cos(azimuthRadians),
  };
}

/** Projects a direction at a supplied display radius for compass guides and rim connectors. */
export function projectAzimuthAtRadius(
  azimuth: number,
  radius: number,
  centerX: number,
  centerY: number,
): Readonly<{ x: number; y: number }> | null {
  const normalized = normalizedAzimuth(azimuth);
  if (normalized === null || !isFiniteProjectionOption(radius)) return null;
  const azimuthRadians = (normalized * Math.PI) / 180;
  return {
    x: centerX + radius * Math.sin(azimuthRadians),
    y: centerY - radius * Math.cos(azimuthRadians),
  };
}

/** Returns the safe rendering branch for any valid geometric horizontal position. */
export function projectSkyPosition(
  position: Pick<HorizontalPosition, "altitude" | "azimuth">,
  options: SkyProjectionOptions,
): SkyPositionProjection {
  if (!isValidSkyPosition(position)) return null;
  if (position.altitude < 0) {
    const point = projectBelowHorizonDirection(position, options);
    return point === null ? null : { kind: "below-horizon", point };
  }
  const point = projectHorizontalPosition(position, options);
  return point === null ? null : { kind: "above-horizon", point };
}

/** Keeps the target marker tied to the planner's accepted selected position object. */
export function targetForSkyFinder(
  plan: Pick<ObservationPlan, "selected">,
  name: string,
): SkyFinderTarget {
  return { name, position: plan.selected.position };
}

function observerPosition(
  location: ObserverLocation,
  instant: Date,
  body: Astronomy.Body,
): HorizontalPosition | null {
  try {
    const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
    const equatorial = Astronomy.Equator(body, instant, observer, true, true);
    // No refraction argument is intentional: all Phase 2B/2C positions are geometric.
    const horizontal = Astronomy.Horizon(instant, observer, equatorial.ra, equatorial.dec);
    const azimuth = normalizedAzimuth(horizontal.azimuth);
    if (
      azimuth === null ||
      !Number.isFinite(horizontal.altitude) ||
      horizontal.altitude < -90 ||
      horizontal.altitude > 90
    ) {
      return null;
    }
    return {
      altitude: horizontal.altitude,
      azimuth,
      compass: formatCompassDirection(azimuth),
    };
  } catch {
    return null;
  }
}

/**
 * Calculates deterministic observer-specific geometric positions for the small
 * reference set used by the finder. The order is fixed and Earth is excluded.
 */
export function computeSolarSystemMarkers(
  location: ObserverLocation,
  instant: Date,
): Array<SkyReferenceMarker> {
  if (validateObserverLocation(location) === null || !Number.isFinite(instant.getTime())) return [];

  return SOLAR_SYSTEM_BODIES.flatMap(({ body, name }) => {
    const position = observerPosition(location, instant, body);
    return position === null ? [] : [{ body: name, name, position }];
  });
}

/** Returns only reference bodies that are geometrically above the horizon. */
export function filterAboveHorizonMarkers(
  markers: ReadonlyArray<SkyReferenceMarker>,
): Array<SkyReferenceMarker> {
  return markers.filter((marker) => marker.position.altitude >= 0);
}
