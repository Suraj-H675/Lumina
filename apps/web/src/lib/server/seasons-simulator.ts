import "server-only";

import type { SeasonsCalculationResponse } from "@nova-lumina/api-client";

import {
  seasonsEndpointForState,
  validateSeasonsCalculationResult,
  type SeasonsState,
} from "../simulations/seasons-simulator";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type SeasonsCalculationOutcome = SimulationCalculationOutcome<SeasonsCalculationResponse>;

export type SeasonsLoaderOptions = SimulationLoaderOptions;

export async function loadSeasonsCalculation(
  state: SeasonsState,
  options: SeasonsLoaderOptions = {},
): Promise<SeasonsCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    seasonsEndpointForState,
    validateSeasonsCalculationResult,
  );
}
