import "server-only";

import {
  requestEndpoint,
  seasonsSimulatorEndpoint,
  type SeasonsCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  validateSeasonsCalculationResult,
  type SeasonsState,
} from "../simulations/seasons-simulator";
import { resolveWebApiOrigin } from "./api-origin";

export type SeasonsCalculationOutcome =
  Readonly<{ data: SeasonsCalculationResponse; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

export type SeasonsLoaderOptions = TransportOptions &
  Readonly<{
    environment?: string;
    origin?: string;
  }>;

function endpointWithState(state: SeasonsState) {
  const query = new URLSearchParams({
    axial_tilt_deg: String(state.axial_tilt_deg),
    orbital_position_deg: String(state.orbital_position_deg),
    latitude_deg: String(state.latitude_deg),
    eccentricity_preset: state.eccentricity_preset,
  });
  return { ...seasonsSimulatorEndpoint, path: `${seasonsSimulatorEndpoint.path}?${query}` };
}

export async function loadSeasonsCalculation(
  state: SeasonsState,
  options: SeasonsLoaderOptions = {},
): Promise<SeasonsCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result = await requestEndpoint(configured.origin, endpointWithState(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateSeasonsCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
