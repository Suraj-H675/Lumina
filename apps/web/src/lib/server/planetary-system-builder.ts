import "server-only";

import type { PlanetarySystemBuilderCalculationResponse } from "@nova-lumina/api-client";

import {
  planetarySystemBuilderRequestEndpoint,
  validatePlanetarySystemBuilderCalculationResult,
  type PlanetarySystemBuilderState,
} from "../simulations/planetary-system-builder";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type PlanetarySystemBuilderCalculationOutcome =
  SimulationCalculationOutcome<PlanetarySystemBuilderCalculationResponse>;

export type PlanetarySystemBuilderLoaderOptions = SimulationLoaderOptions;

export async function loadPlanetarySystemBuilderCalculation(
  state: PlanetarySystemBuilderState,
  options: PlanetarySystemBuilderLoaderOptions = {},
): Promise<PlanetarySystemBuilderCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    planetarySystemBuilderRequestEndpoint,
    validatePlanetarySystemBuilderCalculationResult,
  );
}
