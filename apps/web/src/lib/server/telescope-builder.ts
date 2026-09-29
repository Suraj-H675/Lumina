import "server-only";

import {
  requestEndpoint,
  type TelescopeBuilderCalculationResponse,
  type TransportOptions,
} from "@nova-lumina/api-client";

import {
  telescopeBuilderEndpointForState,
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

export async function loadTelescopeBuilderCalculation(
  state: TelescopeBuilderState,
  options: TelescopeBuilderLoaderOptions = {},
): Promise<TelescopeBuilderCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result = await requestEndpoint(configured.origin, telescopeBuilderEndpointForState(state), {
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
