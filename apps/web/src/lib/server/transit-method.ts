import "server-only";

import {
  requestEndpoint,
  type TransitMethodCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  transitMethodRequestEndpoint,
  validateTransitMethodCalculationResult,
  type TransitMethodState,
} from "../simulations/transit-method";
import { resolveWebApiOrigin } from "./api-origin";

export type TransitMethodCalculationOutcome =
  | Readonly<{ data: TransitMethodCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type TransitMethodLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadTransitMethodCalculation(
  state: TransitMethodState,
  options: TransitMethodLoaderOptions = {},
): Promise<TransitMethodCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(configured.origin, transitMethodRequestEndpoint(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateTransitMethodCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
