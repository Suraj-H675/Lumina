import { zImpactSimulatorCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "../../../packages/api-client/tests/fixtures/impact-simulator.json";

export const IMPACT_SIMULATOR_DEFAULT_RESULT = zImpactSimulatorCalculationResponse.parse(
  fixtures.default_impact,
);

export const IMPACT_SIMULATOR_DIAMETER_2000_RESULT = zImpactSimulatorCalculationResponse.parse(
  fixtures.accepted_diameter_2000,
);
