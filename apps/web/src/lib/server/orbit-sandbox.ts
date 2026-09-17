import "server-only";

import {
  requestEndpoint,
  type OrbitSandboxCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  orbitSandboxRequestEndpoint,
  validateOrbitSandboxCalculationResult,
  type OrbitSandboxState,
} from "../simulations/orbit-sandbox";
import { resolveWebApiOrigin } from "./api-origin";

export type OrbitSandboxCalculationOutcome =
  | Readonly<{ data: OrbitSandboxCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type OrbitSandboxLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadOrbitSandboxCalculation(
  state: OrbitSandboxState,
  options: OrbitSandboxLoaderOptions = {},
): Promise<OrbitSandboxCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(configured.origin, orbitSandboxRequestEndpoint(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateOrbitSandboxCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
