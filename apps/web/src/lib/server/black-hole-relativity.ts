import "server-only";

import {
  requestEndpoint,
  type BlackHoleRelativityCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  blackHoleRelativityRequestEndpoint,
  validateBlackHoleRelativityCalculationResult,
  type BlackHoleRelativityState,
} from "../simulations/black-hole-relativity";
import { resolveWebApiOrigin } from "./api-origin";

export type BlackHoleRelativityCalculationOutcome =
  | Readonly<{ data: BlackHoleRelativityCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type BlackHoleRelativityLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadBlackHoleRelativityCalculation(
  state: BlackHoleRelativityState,
  options: BlackHoleRelativityLoaderOptions = {},
): Promise<BlackHoleRelativityCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(
    configured.origin,
    blackHoleRelativityRequestEndpoint(state),
    {
      ...(options.fetchImplementation === undefined
        ? {}
        : { fetchImplementation: options.fetchImplementation }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    },
  );
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateBlackHoleRelativityCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
