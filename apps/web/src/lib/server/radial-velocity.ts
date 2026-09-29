import "server-only";

import type { RadialVelocityCalculationResponse } from "@nova-lumina/api-client";

import {
  radialVelocityRequestEndpoint,
  validateRadialVelocityCalculationResult,
  type RadialVelocityState,
} from "../simulations/radial-velocity";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type RadialVelocityCalculationOutcome =
  SimulationCalculationOutcome<RadialVelocityCalculationResponse>;

export type RadialVelocityLoaderOptions = SimulationLoaderOptions;

export async function loadRadialVelocityCalculation(
  state: RadialVelocityState,
  options: RadialVelocityLoaderOptions = {},
): Promise<RadialVelocityCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    radialVelocityRequestEndpoint,
    validateRadialVelocityCalculationResult,
  );
}
