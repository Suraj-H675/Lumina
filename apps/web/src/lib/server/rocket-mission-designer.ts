import "server-only";

import type { RocketMissionDesignerCalculationResponse } from "@nova-lumina/api-client";

import {
  rocketMissionDesignerRequestEndpoint,
  validateRocketMissionDesignerCalculationResult,
  type RocketMissionDesignerState,
} from "../simulations/rocket-mission-designer";
import {
  loadSimulationCalculation,
  type SimulationCalculationOutcome,
  type SimulationLoaderOptions,
} from "./simulation-calculation";

export type RocketMissionDesignerCalculationOutcome =
  SimulationCalculationOutcome<RocketMissionDesignerCalculationResponse>;

export type RocketMissionDesignerLoaderOptions = SimulationLoaderOptions;

export async function loadRocketMissionDesignerCalculation(
  state: RocketMissionDesignerState,
  options: RocketMissionDesignerLoaderOptions = {},
): Promise<RocketMissionDesignerCalculationOutcome> {
  return loadSimulationCalculation(
    state,
    options,
    rocketMissionDesignerRequestEndpoint,
    validateRocketMissionDesignerCalculationResult,
  );
}
