import { zSpectroscopyCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "../../../packages/api-client/tests/fixtures/spectroscopy-lab.json";

export const SPECTROSCOPY_DEFAULT_RESULT = zSpectroscopyCalculationResponse.parse(
  fixtures.default_absorption,
);

export const SPECTROSCOPY_CONTINUUM_RESULT = zSpectroscopyCalculationResponse.parse(
  fixtures.continuum_6000,
);
