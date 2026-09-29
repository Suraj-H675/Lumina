import { zBlackHoleRelativityCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "../../../packages/api-client/tests/fixtures/black-hole-relativity.json";

export const BLACK_HOLE_RELATIVITY_DEFAULT_RESULT = zBlackHoleRelativityCalculationResponse.parse(
  fixtures.default_static_radius_2,
);

export const BLACK_HOLE_RELATIVITY_RADIUS_4_RESULT = zBlackHoleRelativityCalculationResponse.parse(
  fixtures.accepted_static_radius_4,
);
