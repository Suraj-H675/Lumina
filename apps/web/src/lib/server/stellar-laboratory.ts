import "server-only";

import {
  requestEndpoint,
  type StellarLaboratoryCalculationResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  stellarLaboratoryRequestEndpoint,
  validateStellarLaboratoryCalculationResult,
  type StellarLaboratoryState,
} from "../simulations/stellar-laboratory";
import { resolveWebApiOrigin } from "./api-origin";

export type StellarLaboratoryCalculationOutcome =
  | Readonly<{ data: StellarLaboratoryCalculationResponse; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

export type StellarLaboratoryLoaderOptions = TransportOptions &
  Readonly<{ environment?: string; origin?: string }>;

export async function loadStellarLaboratoryCalculation(
  state: StellarLaboratoryState,
  options: StellarLaboratoryLoaderOptions = {},
): Promise<StellarLaboratoryCalculationOutcome> {
  const configured = resolveWebApiOrigin(options.origin, options.environment);
  if (!configured.valid) return { kind: "unavailable" };
  const result = await requestEndpoint(configured.origin, stellarLaboratoryRequestEndpoint(state), {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  if (result.kind !== "ok") return { kind: "unavailable" };
  const validated = validateStellarLaboratoryCalculationResult(state, result.data);
  return validated === null ? { kind: "unavailable" } : { data: validated, kind: "ok" };
}
