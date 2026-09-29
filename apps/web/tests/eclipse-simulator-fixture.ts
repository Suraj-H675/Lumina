import { zEclipseSimulatorCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "./e2e/fixtures/eclipse-simulator.json";

export const ECLIPSE_DALLAS_TOTAL_RESULT = zEclipseSimulatorCalculationResponse.parse(
  fixtures.dallas_total,
);

export const ECLIPSE_DALLAS_NONE_RESULT = zEclipseSimulatorCalculationResponse.parse(
  fixtures.dallas_none,
);
