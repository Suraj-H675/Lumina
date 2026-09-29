import "server-only";

import type { EclipseSimulatorCalculationResponse } from "@nova-lumina/api-client";

import {
  eclipseSimulatorRequestEndpoint,
  validateEclipseSimulatorCalculationResult,
  type EclipseSimulatorState,
} from "../simulations/eclipse-simulator";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type EclipseSimulatorCalculationOutcome =
  SimulationCalculationOutcome<EclipseSimulatorCalculationResponse>;

export type EclipseSimulatorLoaderOptions = SimulationLoaderOptions;

export async function loadEclipseSimulatorCalculation(
  state: EclipseSimulatorState,
  options: EclipseSimulatorLoaderOptions = {},
): Promise<EclipseSimulatorCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    eclipseSimulatorRequestEndpoint,
    validateEclipseSimulatorCalculationResult,
  );
}
