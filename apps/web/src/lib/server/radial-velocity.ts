import "server-only";

import {
  requestEndpoint,
  type RadialVelocityCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  radialVelocityRequestEndpoint,
  validateRadialVelocityCalculationResult,
  type RadialVelocityState,
} from "../simulations/radial-velocity";
import { resolveWebApiOrigin } from "./api-origin";

export type RadialVelocityCalculationOutcome =
  | Readonly<{ data: RadialVelocityCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type RadialVelocityLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadRadialVelocityCalculation(
  state: RadialVelocityState,
  options: RadialVelocityLoaderOptions = {},
): Promise<RadialVelocityCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(configured.origin, radialVelocityRequestEndpoint(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateRadialVelocityCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
