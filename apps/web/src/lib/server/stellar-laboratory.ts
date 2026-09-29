import "server-only";

import type { StellarLaboratoryCalculationResponse } from "@nova-lumina/api-client";

import {
  stellarLaboratoryRequestEndpoint,
  validateStellarLaboratoryCalculationResult,
  type StellarLaboratoryState,
} from "../simulations/stellar-laboratory";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type StellarLaboratoryCalculationOutcome =
  SimulationCalculationOutcome<StellarLaboratoryCalculationResponse>;

export type StellarLaboratoryLoaderOptions = SimulationLoaderOptions;

export async function loadStellarLaboratoryCalculation(
  state: StellarLaboratoryState,
  options: StellarLaboratoryLoaderOptions = {},
): Promise<StellarLaboratoryCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    stellarLaboratoryRequestEndpoint,
    validateStellarLaboratoryCalculationResult,
  );
}
