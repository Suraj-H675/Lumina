import { zRelativityVisualizationsCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "../../../packages/api-client/tests/fixtures/relativity-visualizations.json";

export const RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT =
  zRelativityVisualizationsCalculationResponse.parse(fixtures.default_beta_06);

export const RELATIVITY_VISUALIZATIONS_BETA_08_RESULT =
  zRelativityVisualizationsCalculationResponse.parse(fixtures.accepted_beta_08);
