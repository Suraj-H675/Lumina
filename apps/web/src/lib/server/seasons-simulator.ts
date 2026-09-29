import "server-only";

import {
  requestEndpoint,
  type SeasonsCalculationResponse,
  type TransportOptions,
} from "@nova-lumina/api-client";

import {
  seasonsEndpointForState,
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

export async function loadSeasonsCalculation(
  state: SeasonsState,
  options: SeasonsLoaderOptions = {},
): Promise<SeasonsCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };

  const result = await requestEndpoint(configured.origin, seasonsEndpointForState(state), {
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
