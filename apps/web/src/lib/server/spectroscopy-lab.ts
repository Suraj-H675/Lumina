import "server-only";

import {
  requestEndpoint,
  type SpectroscopyCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  spectroscopyRequestEndpoint,
  validateSpectroscopyCalculationResult,
  type SpectroscopyState,
} from "../simulations/spectroscopy-lab";
import { resolveWebApiOrigin } from "./api-origin";

export type SpectroscopyCalculationOutcome =
  | Readonly<{ data: SpectroscopyCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type SpectroscopyLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadSpectroscopyCalculation(
  state: SpectroscopyState,
  options: SpectroscopyLoaderOptions = {},
): Promise<SpectroscopyCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(configured.origin, spectroscopyRequestEndpoint(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateSpectroscopyCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
