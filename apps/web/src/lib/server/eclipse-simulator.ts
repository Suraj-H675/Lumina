import "server-only";

import {
  requestEndpoint,
  type EclipseSimulatorCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  eclipseSimulatorRequestEndpoint,
  validateEclipseSimulatorCalculationResult,
  type EclipseSimulatorState,
} from "../simulations/eclipse-simulator";
import { resolveWebApiOrigin } from "./api-origin";

export type EclipseSimulatorCalculationOutcome =
  | Readonly<{ data: EclipseSimulatorCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type EclipseSimulatorLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadEclipseSimulatorCalculation(
  state: EclipseSimulatorState,
  options: EclipseSimulatorLoaderOptions = {},
): Promise<EclipseSimulatorCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(configured.origin, eclipseSimulatorRequestEndpoint(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateEclipseSimulatorCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
