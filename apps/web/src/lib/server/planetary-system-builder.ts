import "server-only";

import {
  requestEndpoint,
  type PlanetarySystemBuilderCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  planetarySystemBuilderRequestEndpoint,
  validatePlanetarySystemBuilderCalculationResult,
  type PlanetarySystemBuilderState,
} from "../simulations/planetary-system-builder";
import { resolveWebApiOrigin } from "./api-origin";

export type PlanetarySystemBuilderCalculationOutcome =
  | Readonly<{ data: PlanetarySystemBuilderCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type PlanetarySystemBuilderLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadPlanetarySystemBuilderCalculation(
  state: PlanetarySystemBuilderState,
  options: PlanetarySystemBuilderLoaderOptions = {},
): Promise<PlanetarySystemBuilderCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(
    configured.origin,
    planetarySystemBuilderRequestEndpoint(state),
    {
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  );
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validatePlanetarySystemBuilderCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
