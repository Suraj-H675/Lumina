import { zEclipseSimulatorCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "../../../packages/api-client/tests/fixtures/eclipse-simulator.json";

export const ECLIPSE_DALLAS_TOTAL_RESULT = zEclipseSimulatorCalculationResponse.parse(
  fixtures.dallas_total,
);

export const ECLIPSE_DALLAS_NONE_RESULT = zEclipseSimulatorCalculationResponse.parse(
  fixtures.dallas_none,
);
