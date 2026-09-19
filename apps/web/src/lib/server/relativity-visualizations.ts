import "server-only";

import {
  requestEndpoint,
  type RelativityVisualizationsCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  relativityVisualizationsRequestEndpoint,
  validateRelativityVisualizationsCalculationResult,
  type RelativityVisualizationsState,
} from "../simulations/relativity-visualizations";
import { resolveWebApiOrigin } from "./api-origin";

export type RelativityVisualizationsCalculationOutcome =
  | Readonly<{ data: RelativityVisualizationsCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type RelativityVisualizationsLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadRelativityVisualizationsCalculation(
  state: RelativityVisualizationsState,
  options: RelativityVisualizationsLoaderOptions = {},
): Promise<RelativityVisualizationsCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(
    configured.origin,
    relativityVisualizationsRequestEndpoint(state),
    {
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  );
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateRelativityVisualizationsCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
