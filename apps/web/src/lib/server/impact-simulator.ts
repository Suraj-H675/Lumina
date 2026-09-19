import "server-only";

import {
  requestEndpoint,
  type ImpactSimulatorCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  impactSimulatorRequestEndpoint,
  validateImpactSimulatorCalculationResult,
  type ImpactSimulatorState,
} from "../simulations/impact-simulator";
import { resolveWebApiOrigin } from "./api-origin";

export type ImpactSimulatorCalculationOutcome =
  | Readonly<{ data: ImpactSimulatorCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type ImpactSimulatorLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadImpactSimulatorCalculation(
  state: ImpactSimulatorState,
  options: ImpactSimulatorLoaderOptions = {},
): Promise<ImpactSimulatorCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(configured.origin, impactSimulatorRequestEndpoint(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateImpactSimulatorCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
