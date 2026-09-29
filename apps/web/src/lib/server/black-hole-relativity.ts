import "server-only";

import type { BlackHoleRelativityCalculationResponse } from "@nova-lumina/api-client";

import {
  blackHoleRelativityRequestEndpoint,
  validateBlackHoleRelativityCalculationResult,
  type BlackHoleRelativityState,
} from "../simulations/black-hole-relativity";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type BlackHoleRelativityCalculationOutcome =
  SimulationCalculationOutcome<BlackHoleRelativityCalculationResponse>;

export type BlackHoleRelativityLoaderOptions = SimulationLoaderOptions;

export async function loadBlackHoleRelativityCalculation(
  state: BlackHoleRelativityState,
  options: BlackHoleRelativityLoaderOptions = {},
): Promise<BlackHoleRelativityCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    blackHoleRelativityRequestEndpoint,
    validateBlackHoleRelativityCalculationResult,
  );
}
