import * as Astronomy from "astronomy-engine";

import {
  BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE,
  compareGaiaSourceIds,
  type BrightContextStar,
} from "./bright-star-context";
import {
  formatCompassDirection,
  validateObserverLocation,
  type HorizontalPosition,
  type ObservationPlan,
  type ObserverLocation,
} from "./domain";
import type { ConstellationRegion, NamedAnchorContextRow } from "./iau-context";

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

export type PositionedBrightContextStar = Readonly<{
  sourceId: string;
  gMagnitude: number;
  position: HorizontalPosition;
}>;

export type RenderedBrightContextSelection = Readonly<{
  aboveHorizonCount: number;
  capApplied: boolean;
  stars: ReadonlyArray<PositionedBrightContextStar>;
}>;

export type PositionedNamedSkyAnchor = Readonly<{
  iauName: string;
  hipId: number;
  constellationAbbreviation: string;
  gaiaSourceId: string;
  gMagnitude: number;
  position: HorizontalPosition;
  angularSeparationDegrees: number;
}>;

export type ConstellationBoundaryProjectionOptions = Readonly<{
  maxAngularStepDegrees?: number;
  maxSamplesPerEdge?: number;
}>;

export type ProjectedConstellationBoundary = ReadonlyArray<ReadonlyArray<SkyProjectionPoint>>;

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
export const BRIGHT_STAR_RENDER_CAP = 1_200;
export const NAMED_ANCHOR_LABEL_CAP = 12;
export const CONSTELLATION_BOUNDARY_MAX_ANGULAR_STEP_DEGREES = 2;
export const CONSTELLATION_BOUNDARY_MAX_SAMPLES_PER_EDGE = 64;

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

/**
 * Converts the accepted J2016.0 ICRS rows using the same geometric Horizon
 * convention as the selected target. Astronomy Engine accepts RA in hours,
 * so the reviewed Gaia degrees are divided by 15 exactly once here.
 */
export function calculateBrightContextHorizontalPositions(
  stars: ReadonlyArray<BrightContextStar>,
  location: ObserverLocation,
  instant: Date,
): ReadonlyArray<PositionedBrightContextStar> {
  if (validateObserverLocation(location) === null || !Number.isFinite(instant.getTime())) return [];
  try {
    const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
    return stars.map((star) => {
      const horizontal = Astronomy.Horizon(
        instant,
        observer,
        star.rightAscensionDegrees / 15,
        star.declinationDegrees,
      );
      const azimuth = normalizedAzimuth(horizontal.azimuth);
      if (
        azimuth === null ||
        !Number.isFinite(horizontal.altitude) ||
        horizontal.altitude < -90 ||
        horizontal.altitude > 90
      ) {
        throw new Error("Invalid bright-star horizontal position");
      }
      return {
        sourceId: star.sourceId,
        gMagnitude: star.gMagnitude,
        position: {
          altitude: horizontal.altitude,
          azimuth,
          compass: formatCompassDirection(azimuth),
        },
      };
    });
  } catch {
    return [];
  }
}

/** Keeps only the deterministic brightest bounded set above the geometric horizon. */
export function selectRenderedBrightContextStars(
  stars: ReadonlyArray<PositionedBrightContextStar>,
  cap = BRIGHT_STAR_RENDER_CAP,
): RenderedBrightContextSelection {
  if (!Number.isSafeInteger(cap) || cap <= 0) {
    return { aboveHorizonCount: 0, capApplied: false, stars: [] };
  }
  try {
    if (
      stars.some(
        (star) =>
          !Number.isFinite(star.gMagnitude) ||
          star.gMagnitude > BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE ||
          !isValidSkyPosition(star.position) ||
          compareGaiaSourceIds(star.sourceId, star.sourceId) !== 0,
      )
    ) {
      return { aboveHorizonCount: 0, capApplied: false, stars: [] };
    }
    const aboveHorizon = stars
      .filter((star) => star.position.altitude >= 0)
      .sort(
        (left, right) =>
          left.gMagnitude - right.gMagnitude || compareGaiaSourceIds(left.sourceId, right.sourceId),
      );
    return {
      aboveHorizonCount: aboveHorizon.length,
      capApplied: aboveHorizon.length > cap,
      stars: aboveHorizon.slice(0, cap),
    };
  } catch {
    return { aboveHorizonCount: 0, capApplied: false, stars: [] };
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function horizontalDirectionVector(
  position: Pick<HorizontalPosition, "altitude" | "azimuth">,
): readonly [number, number, number] | null {
  if (!isValidSkyPosition(position)) return null;
  const altitudeRadians = (position.altitude * Math.PI) / 180;
  const azimuthRadians = (position.azimuth * Math.PI) / 180;
  const cosineAltitude = Math.cos(altitudeRadians);
  return [
    cosineAltitude * Math.sin(azimuthRadians),
    cosineAltitude * Math.cos(azimuthRadians),
    Math.sin(altitudeRadians),
  ];
}

/** Returns true spherical angular separation between two horizontal directions. */
export function angularSeparationDegrees(
  first: Pick<HorizontalPosition, "altitude" | "azimuth">,
  second: Pick<HorizontalPosition, "altitude" | "azimuth">,
): number | null {
  const firstVector = horizontalDirectionVector(first);
  const secondVector = horizontalDirectionVector(second);
  if (firstVector === null || secondVector === null) return null;
  const dot =
    firstVector[0] * secondVector[0] +
    firstVector[1] * secondVector[1] +
    firstVector[2] * secondVector[2];
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

function compareNamedAnchors(
  left: PositionedNamedSkyAnchor,
  right: PositionedNamedSkyAnchor,
): number {
  return (
    left.angularSeparationDegrees - right.angularSeparationDegrees ||
    left.gMagnitude - right.gMagnitude ||
    compareText(left.iauName, right.iauName) ||
    compareGaiaSourceIds(left.gaiaSourceId, right.gaiaSourceId)
  );
}

/** Joins official names only to the already-positioned Phase 2D Gaia rows. */
export function positionNamedSkyAnchors(
  rows: ReadonlyArray<NamedAnchorContextRow>,
  positionedStars: ReadonlyArray<PositionedBrightContextStar>,
  targetPosition: Pick<HorizontalPosition, "altitude" | "azimuth">,
): ReadonlyArray<PositionedNamedSkyAnchor> {
  if (!isValidSkyPosition(targetPosition)) return [];
  const starsBySourceId = new Map<string, PositionedBrightContextStar>();
  for (const star of positionedStars) {
    if (starsBySourceId.has(star.sourceId)) return [];
    starsBySourceId.set(star.sourceId, star);
  }
  const anchors: Array<PositionedNamedSkyAnchor> = [];
  for (const row of rows) {
    const star = starsBySourceId.get(row.gaiaSourceId);
    if (star === undefined) continue;
    const angularSeparation = angularSeparationDegrees(star.position, targetPosition);
    if (angularSeparation === null) return [];
    anchors.push({
      iauName: row.iauName,
      hipId: row.hipId,
      constellationAbbreviation: row.constellationAbbreviation,
      gaiaSourceId: row.gaiaSourceId,
      gMagnitude: star.gMagnitude,
      position: star.position,
      angularSeparationDegrees: angularSeparation,
    });
  }
  return anchors.sort(compareNamedAnchors);
}

/** Selects the deterministic, above-horizon subset that receives map labels. */
export function selectNamedAnchorLabels(
  anchors: ReadonlyArray<PositionedNamedSkyAnchor>,
  cap = NAMED_ANCHOR_LABEL_CAP,
): ReadonlyArray<PositionedNamedSkyAnchor> {
  if (!Number.isSafeInteger(cap) || cap <= 0) return [];
  return anchors
    .filter((anchor) => anchor.position.altitude >= 0)
    .slice()
    .sort(compareNamedAnchors)
    .slice(0, cap);
}

type EquatorialDirection = Readonly<{
  rightAscensionDegrees: number;
  declinationDegrees: number;
}>;

function equatorialDirectionVector(
  direction: EquatorialDirection,
): readonly [number, number, number] | null {
  if (
    !Number.isFinite(direction.rightAscensionDegrees) ||
    direction.rightAscensionDegrees < 0 ||
    direction.rightAscensionDegrees >= 360 ||
    !Number.isFinite(direction.declinationDegrees) ||
    direction.declinationDegrees < -90 ||
    direction.declinationDegrees > 90
  ) {
    return null;
  }
  const rightAscensionRadians = (direction.rightAscensionDegrees * Math.PI) / 180;
  const declinationRadians = (direction.declinationDegrees * Math.PI) / 180;
  const cosineDeclination = Math.cos(declinationRadians);
  return [
    cosineDeclination * Math.cos(rightAscensionRadians),
    cosineDeclination * Math.sin(rightAscensionRadians),
    Math.sin(declinationRadians),
  ];
}

function equatorialDirectionFromVector(
  vector: readonly [number, number, number],
): EquatorialDirection | null {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length === 0) return null;
  const x = vector[0] / length;
  const y = vector[1] / length;
  const z = Math.min(1, Math.max(-1, vector[2] / length));
  const rightAscensionDegrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const declinationDegrees = (Math.asin(z) * 180) / Math.PI;
  return { rightAscensionDegrees, declinationDegrees };
}

function interpolateEquatorialDirection(
  start: EquatorialDirection,
  end: EquatorialDirection,
  fraction: number,
): EquatorialDirection | null {
  const startVector = equatorialDirectionVector(start);
  const endVector = equatorialDirectionVector(end);
  if (startVector === null || endVector === null || !Number.isFinite(fraction)) return null;
  if (fraction <= 0) return start;
  if (fraction >= 1) return end;
  const dot = Math.min(
    1,
    Math.max(
      -1,
      startVector[0] * endVector[0] + startVector[1] * endVector[1] + startVector[2] * endVector[2],
    ),
  );
  const angle = Math.acos(dot);
  if (angle < 1e-12 || Math.abs(Math.sin(angle)) < 1e-12) {
    return equatorialDirectionFromVector([
      startVector[0] * (1 - fraction) + endVector[0] * fraction,
      startVector[1] * (1 - fraction) + endVector[1] * fraction,
      startVector[2] * (1 - fraction) + endVector[2] * fraction,
    ]);
  }
  const sine = Math.sin(angle);
  const startWeight = Math.sin((1 - fraction) * angle) / sine;
  const endWeight = Math.sin(fraction * angle) / sine;
  return equatorialDirectionFromVector([
    startVector[0] * startWeight + endVector[0] * endWeight,
    startVector[1] * startWeight + endVector[1] * endWeight,
    startVector[2] * startWeight + endVector[2] * endWeight,
  ]);
}

function equatorialSeparationDegrees(
  first: EquatorialDirection,
  second: EquatorialDirection,
): number | null {
  const firstVector = equatorialDirectionVector(first);
  const secondVector = equatorialDirectionVector(second);
  if (firstVector === null || secondVector === null) return null;
  const dot =
    firstVector[0] * secondVector[0] +
    firstVector[1] * secondVector[1] +
    firstVector[2] * secondVector[2];
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

function boundarySamples(
  vertices: ReadonlyArray<EquatorialDirection>,
  maxAngularStepDegrees: number,
  maxSamplesPerEdge: number,
): ReadonlyArray<EquatorialDirection> | null {
  if (vertices.length < 3) return null;
  const samples: Array<EquatorialDirection> = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    if (start === undefined || end === undefined) return null;
    const angle = equatorialSeparationDegrees(start, end);
    if (angle === null) return null;
    const segmentCount = Math.min(
      maxSamplesPerEdge,
      Math.max(1, Math.ceil(angle / maxAngularStepDegrees)),
    );
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const direction = interpolateEquatorialDirection(start, end, segment / segmentCount);
      if (direction === null) return null;
      samples.push(direction);
    }
  }
  const first = vertices[0];
  if (first === undefined) return null;
  samples.push(first);
  return samples;
}

function boundaryHorizontalPosition(
  direction: EquatorialDirection,
  observer: Astronomy.Observer,
  instant: Date,
): HorizontalPosition | null {
  try {
    // Astronomy Engine accepts right ascension in sidereal hours; the IAU
    // artifact is explicitly normalized to degrees, so divide by 15 once.
    const horizontal = Astronomy.Horizon(
      instant,
      observer,
      direction.rightAscensionDegrees / 15,
      direction.declinationDegrees,
    );
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

function horizonCrossingProjection(
  start: EquatorialDirection,
  end: EquatorialDirection,
  startPosition: HorizontalPosition,
  endPosition: HorizontalPosition,
  observer: Astronomy.Observer,
  instant: Date,
  options: SkyProjectionOptions,
): SkyProjectionPoint | null {
  let aboveFraction = startPosition.altitude >= 0 ? 0 : 1;
  let belowFraction = startPosition.altitude >= 0 ? 1 : 0;
  let abovePosition = startPosition.altitude >= 0 ? startPosition : endPosition;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const fraction = (aboveFraction + belowFraction) / 2;
    const direction = interpolateEquatorialDirection(start, end, fraction);
    if (direction === null) return null;
    const position = boundaryHorizontalPosition(direction, observer, instant);
    if (position === null) return null;
    if (position.altitude >= 0) {
      aboveFraction = fraction;
      abovePosition = position;
    } else {
      belowFraction = fraction;
    }
  }
  return projectHorizontalPosition({ ...abovePosition, altitude: 0 }, options);
}

function projectBoundaryPart(
  vertices: ReadonlyArray<EquatorialDirection>,
  observer: Astronomy.Observer,
  instant: Date,
  options: SkyProjectionOptions,
  maxAngularStepDegrees: number,
  maxSamplesPerEdge: number,
): ReadonlyArray<ReadonlyArray<SkyProjectionPoint>> {
  const samples = boundarySamples(vertices, maxAngularStepDegrees, maxSamplesPerEdge);
  if (samples === null) return [];
  const positions = samples.map((sample) => boundaryHorizontalPosition(sample, observer, instant));
  if (positions.some((position) => position === null)) return [];
  const validPositions = positions as Array<HorizontalPosition | null>;
  const paths: Array<Array<SkyProjectionPoint>> = [];
  let path: Array<SkyProjectionPoint> = [];
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1];
    const end = samples[index];
    const startPosition = validPositions[index - 1];
    const endPosition = validPositions[index];
    if (
      start === undefined ||
      end === undefined ||
      startPosition === undefined ||
      endPosition === undefined ||
      startPosition === null ||
      endPosition === null
    ) {
      return [];
    }
    const startAbove = startPosition.altitude >= 0;
    const endAbove = endPosition.altitude >= 0;
    if (startAbove && endAbove) {
      const projection = projectHorizontalPosition(endPosition, options);
      if (projection === null) return [];
      if (path.length === 0)
        path.push(projectHorizontalPosition(startPosition, options) ?? projection);
      path.push(projection);
    } else if (startAbove && !endAbove) {
      const crossing = horizonCrossingProjection(
        start,
        end,
        startPosition,
        endPosition,
        observer,
        instant,
        options,
      );
      if (crossing !== null) path.push(crossing);
      if (path.length >= 2) paths.push(path);
      path = [];
    } else if (!startAbove && endAbove) {
      const crossing = horizonCrossingProjection(
        start,
        end,
        startPosition,
        endPosition,
        observer,
        instant,
        options,
      );
      const projection = projectHorizontalPosition(endPosition, options);
      if (projection === null) return [];
      path = crossing === null ? [projection] : [crossing, projection];
    }
  }
  if (path.length >= 2) paths.push(path);
  return paths;
}

/** Projects only the selected official region, splitting paths at the geometric horizon. */
export function projectConstellationBoundary(
  constellation: ConstellationRegion,
  location: ObserverLocation,
  instant: Date,
  options: SkyProjectionOptions,
  projectionOptions: ConstellationBoundaryProjectionOptions = {},
): ProjectedConstellationBoundary {
  if (validateObserverLocation(location) === null || !Number.isFinite(instant.getTime())) return [];
  const maxAngularStepDegrees =
    projectionOptions.maxAngularStepDegrees ?? CONSTELLATION_BOUNDARY_MAX_ANGULAR_STEP_DEGREES;
  const maxSamplesPerEdge =
    projectionOptions.maxSamplesPerEdge ?? CONSTELLATION_BOUNDARY_MAX_SAMPLES_PER_EDGE;
  if (
    !Number.isFinite(maxAngularStepDegrees) ||
    maxAngularStepDegrees <= 0 ||
    !Number.isSafeInteger(maxSamplesPerEdge) ||
    maxSamplesPerEdge <= 0 ||
    !Array.isArray(constellation.boundaryParts) ||
    constellation.boundaryParts.length === 0
  ) {
    return [];
  }
  try {
    const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
    return constellation.boundaryParts.flatMap((part) =>
      projectBoundaryPart(
        part.vertices,
        observer,
        instant,
        options,
        maxAngularStepDegrees,
        maxSamplesPerEdge,
      ),
    );
  } catch {
    return [];
  }
}

/** Display-only monotonic Gaia G magnitude encoding; it does not represent stellar size. */
export function starMarkerRadius(gMagnitude: number): number | null {
  if (!Number.isFinite(gMagnitude) || gMagnitude > BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE) {
    return null;
  }
  const boundedMagnitude = Math.max(-2, gMagnitude);
  const brightnessFraction =
    (BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE - boundedMagnitude) /
    (BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE + 2);
  return Math.min(3, Math.max(0.7, 0.7 + 2.3 * Math.sqrt(brightnessFraction)));
}

/** Display-only monotonic opacity companion with a nonzero faint-marker floor. */
export function starMarkerOpacity(gMagnitude: number): number | null {
  if (!Number.isFinite(gMagnitude) || gMagnitude > BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE) {
    return null;
  }
  const boundedMagnitude = Math.max(-2, gMagnitude);
  const brightnessFraction =
    (BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE - boundedMagnitude) /
    (BRIGHT_STAR_CONTEXT_MAXIMUM_G_MAGNITUDE + 2);
  return Math.min(0.82, Math.max(0.32, 0.32 + 0.5 * Math.sqrt(brightnessFraction)));
}
