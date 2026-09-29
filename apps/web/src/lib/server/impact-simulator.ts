import "server-only";

import type { ImpactSimulatorCalculationResponse } from "@nova-lumina/api-client";

import {
  impactSimulatorRequestEndpoint,
  validateImpactSimulatorCalculationResult,
  type ImpactSimulatorState,
} from "../simulations/impact-simulator";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type ImpactSimulatorCalculationOutcome =
  SimulationCalculationOutcome<ImpactSimulatorCalculationResponse>;

export type ImpactSimulatorLoaderOptions = SimulationLoaderOptions;

export async function loadImpactSimulatorCalculation(
  state: ImpactSimulatorState,
  options: ImpactSimulatorLoaderOptions = {},
): Promise<ImpactSimulatorCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    impactSimulatorRequestEndpoint,
    validateImpactSimulatorCalculationResult,
  );
}
