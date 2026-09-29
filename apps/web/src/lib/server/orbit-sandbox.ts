import "server-only";

import type { OrbitSandboxCalculationResponse } from "@nova-lumina/api-client";

import {
  orbitSandboxRequestEndpoint,
  validateOrbitSandboxCalculationResult,
  type OrbitSandboxState,
} from "../simulations/orbit-sandbox";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type OrbitSandboxCalculationOutcome =
  SimulationCalculationOutcome<OrbitSandboxCalculationResponse>;

export type OrbitSandboxLoaderOptions = SimulationLoaderOptions;

export async function loadOrbitSandboxCalculation(
  state: OrbitSandboxState,
  options: OrbitSandboxLoaderOptions = {},
): Promise<OrbitSandboxCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    orbitSandboxRequestEndpoint,
    validateOrbitSandboxCalculationResult,
  );
}
