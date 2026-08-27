import * as Astronomy from "astronomy-engine";

import {
  calculateHorizontalPosition,
  formatCompassDirection,
  validateObserverLocation,
  type AltitudeSample,
  type CoordinatePair,
  type HorizontalPosition,
  type ObserverLocation,
} from "./domain";

const DEGREES_TO_RADIANS = Math.PI / 180;

export type LunarConditions = Readonly<{
  minimumSeparationDuringDarkness: number | null;
  selected: Readonly<{
    illuminationFraction: number;
    phaseAngle: number;
    phaseLabel: LunarPhaseLabel;
    position: HorizontalPosition;
    targetSeparationDegrees: number;
  }>;
}>;

export type LunarPhaseLabel =
  | "New"
  | "Waxing crescent"
  | "First quarter"
  | "Waxing gibbous"
  | "Full"
  | "Waning gibbous"
  | "Third quarter"
  | "Waning crescent";

function validAltitude(altitude: number): boolean {
  return Number.isFinite(altitude) && altitude >= -90 && altitude <= 90;
}

function validAzimuth(azimuth: number): boolean {
  return Number.isFinite(azimuth) && azimuth >= 0 && azimuth < 360;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Returns the true spherical angular separation between two horizontal
 * directions. Altitude is geometric and azimuth is north-through-east.
 */
export function calculateAngularSeparation(
  first: Pick<HorizontalPosition, "altitude" | "azimuth">,
  second: Pick<HorizontalPosition, "altitude" | "azimuth">,
): number | null {
  if (
    !validAltitude(first.altitude) ||
    !validAltitude(second.altitude) ||
    !validAzimuth(first.azimuth) ||
    !validAzimuth(second.azimuth)
  ) {
    return null;
  }

  const firstAltitude = first.altitude * DEGREES_TO_RADIANS;
  const secondAltitude = second.altitude * DEGREES_TO_RADIANS;
  const azimuthDifference = (first.azimuth - second.azimuth) * DEGREES_TO_RADIANS;
  const cosine =
    Math.sin(firstAltitude) * Math.sin(secondAltitude) +
    Math.cos(firstAltitude) * Math.cos(secondAltitude) * Math.cos(azimuthDifference);
  const clampedCosine = Math.max(-1, Math.min(1, cosine));
  const separation = Math.acos(clampedCosine) / DEGREES_TO_RADIANS;
  return Number.isFinite(separation) && separation >= 0 && separation <= 180 ? separation : null;
}

/** Calculates the Moon's topocentric, geometric horizontal position. */
export function calculateMoonHorizontalPosition(
  location: ObserverLocation,
  instant: Date,
): HorizontalPosition | null {
  if (!Number.isFinite(instant.getTime())) return null;
  const validatedLocation = validateObserverLocation(location);
  if (validatedLocation === null) return null;

  const observer = new Astronomy.Observer(
    validatedLocation.latitude,
    validatedLocation.longitude,
    0,
  );
  try {
    const equator = Astronomy.Equator(Astronomy.Body.Moon, instant, observer, true, true);
    if (!Number.isFinite(equator.ra) || !Number.isFinite(equator.dec)) return null;
    const horizontal = Astronomy.Horizon(instant, observer, equator.ra, equator.dec);
    const azimuth = normalizeDegrees(horizontal.azimuth);
    if (!validAltitude(horizontal.altitude) || !validAzimuth(azimuth)) return null;
    return {
      altitude: horizontal.altitude,
      azimuth,
      compass: formatCompassDirection(azimuth),
    };
  } catch {
    return null;
  }
}

/** Maps Astronomy Engine's 0..360° Moon phase angle to a factual label. */
export function moonPhaseLabel(phaseAngle: number): LunarPhaseLabel | null {
  if (!Number.isFinite(phaseAngle)) return null;
  const normalized = normalizeDegrees(phaseAngle);
  if (normalized < 22.5 || normalized >= 337.5) return "New";
  if (normalized < 67.5) return "Waxing crescent";
  if (normalized < 112.5) return "First quarter";
  if (normalized < 157.5) return "Waxing gibbous";
  if (normalized < 202.5) return "Full";
  if (normalized < 247.5) return "Waning gibbous";
  if (normalized < 292.5) return "Third quarter";
  return "Waning crescent";
}

/** Returns a deliberately rounded percentage for the illuminated visible disk. */
export function formatIlluminationPercentage(illuminationFraction: number): string {
  if (
    !Number.isFinite(illuminationFraction) ||
    illuminationFraction < 0 ||
    illuminationFraction > 1
  ) {
    return "Unavailable";
  }
  return `${Math.round(illuminationFraction * 100)}%`;
}

function targetMoonSeparation(
  coordinate: CoordinatePair,
  location: ObserverLocation,
  instant: Date,
): number | null {
  const target = calculateHorizontalPosition(coordinate, location, instant);
  const moon = calculateMoonHorizontalPosition(location, instant);
  return target === null || moon === null ? null : calculateAngularSeparation(target, moon);
}

/**
 * Finds the smallest target–Moon separation among the planner's existing
 * bounded sample instants that fall within astronomical darkness.
 */
export function minimumTargetMoonSeparationDuringDarkness(
  coordinate: CoordinatePair,
  location: ObserverLocation,
  darkness: Readonly<{ end: Date; start: Date }> | null,
  samples: ReadonlyArray<AltitudeSample>,
): number | null {
  if (darkness === null) return null;
  const separations = samples
    .filter(
      (sample) =>
        sample.instant.getTime() >= darkness.start.getTime() &&
        sample.instant.getTime() <= darkness.end.getTime(),
    )
    .map((sample) => targetMoonSeparation(coordinate, location, sample.instant))
    .filter((separation): separation is number => separation !== null);

  return separations.length === 0 ? null : Math.min(...separations);
}

/** Calculates selected-time and darkness-window lunar conditions. */
export function computeLunarConditions(
  coordinate: CoordinatePair,
  location: ObserverLocation,
  selectedInstant: Date,
  darkness: Readonly<{ end: Date; start: Date }> | null,
  samples: ReadonlyArray<AltitudeSample>,
): LunarConditions | null {
  if (!Number.isFinite(selectedInstant.getTime())) return null;
  const position = calculateMoonHorizontalPosition(location, selectedInstant);
  const targetSeparation = targetMoonSeparation(coordinate, location, selectedInstant);
  if (position === null || targetSeparation === null) return null;

  try {
    const illumination = Astronomy.Illumination(Astronomy.Body.Moon, selectedInstant);
    const phaseAngle = Astronomy.MoonPhase(selectedInstant);
    const phaseLabel = moonPhaseLabel(phaseAngle);
    if (
      !Number.isFinite(illumination.phase_fraction) ||
      illumination.phase_fraction < 0 ||
      illumination.phase_fraction > 1 ||
      !Number.isFinite(phaseAngle) ||
      phaseLabel === null
    ) {
      return null;
    }
    return {
      minimumSeparationDuringDarkness: minimumTargetMoonSeparationDuringDarkness(
        coordinate,
        location,
        darkness,
        samples,
      ),
      selected: {
        illuminationFraction: illumination.phase_fraction,
        phaseAngle: normalizeDegrees(phaseAngle),
        phaseLabel,
        position,
        targetSeparationDegrees: targetSeparation,
      },
    };
  } catch {
    return null;
  }
}
