import type { EclipseSimulatorCalculationResponse } from "@lumina/api-client";

export const ECLIPSE_DALLAS_TOTAL_RESULT: EclipseSimulatorCalculationResponse = {
  model_version: "eclipse-simulator-v1",
  schema_version: 1,
  inputs: {
    at_utc: "2024-04-08T18:42:00Z",
    latitude_deg: 32.7767,
    longitude_deg: -96.797,
    elevation_m: 130,
  },
  instant: {
    phase: "total",
    shadow_region: "umbra",
    sun_angular_radius_deg: 0.266061098358121,
    moon_angular_radius_deg: 0.28115446961677854,
    center_separation_deg: 0.008257460757938725,
    obscuration_fraction: 1,
    sun_distance_km: 149818283.5031317,
    moon_distance_km: 354061.90398480877,
    sun_altitude_deg: 64.63500288803954,
    sun_above_geometric_horizon: true,
  },
  local_event: {
    classification: "total",
    partial_begin_utc: "2024-04-08T17:23:00Z",
    central_begin_utc: "2024-04-08T18:41:00Z",
    maximum_utc: "2024-04-08T18:43:00Z",
    central_end_utc: "2024-04-08T18:45:00Z",
    partial_end_utc: "2024-04-08T20:03:00Z",
    maximum_obscuration_fraction: 1,
    sun_altitude_deg_at_maximum: 64.61411692634734,
    sun_above_geometric_horizon_at_maximum: true,
  },
  ephemeris_note:
    "Astropy 8.0.1 builtin offline ephemeris; ERFA moon98 is approximate/non-canonical and v1 is bounded to the locked offline Earth-orientation interval.",
  timing_note:
    "Local event contacts and maximum are approximate educational estimates rounded to whole UTC minutes; no second-level precision is claimed.",
  safety_reference_id: "nasa-eclipse-safety",
};

export const ECLIPSE_DALLAS_NONE_RESULT: EclipseSimulatorCalculationResponse = {
  model_version: "eclipse-simulator-v1",
  schema_version: 1,
  inputs: {
    at_utc: "2024-04-09T18:42:00Z",
    latitude_deg: 32.7767,
    longitude_deg: -96.797,
    elevation_m: 130,
  },
  instant: {
    phase: "none",
    shadow_region: "outside",
    sun_angular_radius_deg: 0.2659855753908968,
    moon_angular_radius_deg: 0.2791357996503749,
    center_separation_deg: 14.205075826025134,
    obscuration_fraction: 0,
    sun_distance_km: 149860822.05049986,
    moon_distance_km: 356622.408286033,
    sun_altitude_deg: 64.99590141645892,
    sun_above_geometric_horizon: true,
  },
  local_event: null,
  ephemeris_note: ECLIPSE_DALLAS_TOTAL_RESULT.ephemeris_note,
  timing_note: ECLIPSE_DALLAS_TOTAL_RESULT.timing_note,
  safety_reference_id: "nasa-eclipse-safety",
};
