import { zStellarLaboratoryCalculationResponse } from "@nova-lumina/api-client/generated/zod";

import fixtures from "./e2e/fixtures/stellar-laboratory.json";

export const STELLAR_LABORATORY_DEFAULT_RESULT = zStellarLaboratoryCalculationResponse.parse(
  fixtures.default,
);

export const STELLAR_LABORATORY_TEN_SOLAR_MASS_RESULT = zStellarLaboratoryCalculationResponse.parse(
  fixtures.ten_solar_mass,
);
