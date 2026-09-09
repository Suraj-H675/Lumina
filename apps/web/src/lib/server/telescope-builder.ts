import "server-only";

import {
  requestEndpoint,
  telescopeBuilderEndpoint,
  type TelescopeBuilderCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  validateTelescopeBuilderCalculationResult,
  type TelescopeBuilderState,
} from "../simulations/telescope-builder";
import { resolveWebApiOrigin } from "./api-origin";

export type TelescopeBuilderCalculationOutcome =
  | Readonly<{ data: TelescopeBuilderCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>;

export type TelescopeBuilderLoaderOptions = TransportOptions &
  Readonly<{
    environment?: string;
    origin?: string;
  }>;

function endpointWithState(state: TelescopeBuilderState) {
  const query = new URLSearchParams({
    aperture_mm: String(state.aperture_mm),
    telescope_focal_length_mm: String(state.telescope_focal_length_mm),
    telescope_type: state.telescope_type,
    eyepiece_focal_length_mm: String(state.eyepiece_focal_length_mm),
    eyepiece_apparent_field_deg: String(state.eyepiece_apparent_field_deg),
    optical_modifier_kind: state.optical_modifier_kind,
    optical_modifier_factor: String(state.optical_modifier_factor),
    target_angular_size_arcmin: String(state.target_angular_size_arcmin),
  });
  return { ...telescopeBuilderEndpoint, path: `${telescopeBuilderEndpoint.path}?${query}` };
}

export async function loadTelescopeBuilderCalculation(
  state: TelescopeBuilderState,
  options: TelescopeBuilderLoaderOptions = {},
): Promise<TelescopeBuilderCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result = await requestEndpoint(configured.origin, endpointWithState(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind === "http-error" && result.status === 422) return { kind: "invalid" };
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateTelescopeBuilderCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
