import "server-only";

import type { TransitMethodCalculationResponse } from "@nova-lumina/api-client";

import {
  transitMethodRequestEndpoint,
  validateTransitMethodCalculationResult,
  type TransitMethodState,
} from "../simulations/transit-method";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type TransitMethodCalculationOutcome =
  SimulationCalculationOutcome<TransitMethodCalculationResponse>;

export type TransitMethodLoaderOptions = SimulationLoaderOptions;

export async function loadTransitMethodCalculation(
  state: TransitMethodState,
  options: TransitMethodLoaderOptions = {},
): Promise<TransitMethodCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    transitMethodRequestEndpoint,
    validateTransitMethodCalculationResult,
  );
}
