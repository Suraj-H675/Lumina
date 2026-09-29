import { zPlanetarySystemBuilderCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "../../../packages/api-client/tests/fixtures/planetary-system-builder.json";

export const PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT =
  zPlanetarySystemBuilderCalculationResponse.parse(fixtures.default_system);

export const PLANETARY_SYSTEM_BUILDER_AXIS_08_RESULT =
  zPlanetarySystemBuilderCalculationResponse.parse(fixtures.accepted_axis_0_8);
