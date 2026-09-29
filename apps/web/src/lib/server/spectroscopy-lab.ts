import "server-only";

import type { SpectroscopyCalculationResponse } from "@nova-lumina/api-client";

import {
  spectroscopyRequestEndpoint,
  validateSpectroscopyCalculationResult,
  type SpectroscopyState,
} from "../simulations/spectroscopy-lab";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type SpectroscopyCalculationOutcome =
  SimulationCalculationOutcome<SpectroscopyCalculationResponse>;

export type SpectroscopyLoaderOptions = SimulationLoaderOptions;

export async function loadSpectroscopyCalculation(
  state: SpectroscopyState,
  options: SpectroscopyLoaderOptions = {},
): Promise<SpectroscopyCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    spectroscopyRequestEndpoint,
    validateSpectroscopyCalculationResult,
  );
}
