import "server-only";

import type { RelativityVisualizationsCalculationResponse } from "@nova-lumina/api-client";

import {
  relativityVisualizationsRequestEndpoint,
  validateRelativityVisualizationsCalculationResult,
  type RelativityVisualizationsState,
} from "../simulations/relativity-visualizations";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type RelativityVisualizationsCalculationOutcome =
  SimulationCalculationOutcome<RelativityVisualizationsCalculationResponse>;

export type RelativityVisualizationsLoaderOptions = SimulationLoaderOptions;

export async function loadRelativityVisualizationsCalculation(
  state: RelativityVisualizationsState,
  options: RelativityVisualizationsLoaderOptions = {},
): Promise<RelativityVisualizationsCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    relativityVisualizationsRequestEndpoint,
    validateRelativityVisualizationsCalculationResult,
  );
}
