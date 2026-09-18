import type { StellarLaboratoryCalculationResponse } from "@lumina/api-client";

export const STELLAR_LABORATORY_DEFAULT_RESULT: StellarLaboratoryCalculationResponse = {
  model_version: "stellar-laboratory-v1",
  schema_version: 1,
  inputs: { initial_mass_msun: 1 },
  luminosity_lsun: 0.9840111057611337,
  radius_rsun: 0.992,
  effective_temperature_k: 5771.922436015128,
  nearest_spectral_type_anchor: "G5",
  colour_anchor_mass_msun: 1.031,
  approximate_b_minus_v_mag: 0.68,
  main_sequence_lifetime_years: 10_000_000_000,
  evolutionary_path: [
    "main sequence",
    "red giant evolution",
    "planetary nebula",
    "carbon-oxygen white dwarf",
  ],
  expected_remnant: "carbon-oxygen white dwarf",
  remnant_boundary_note:
    "Broad OpenStax Astronomy 2e Table 23.1 initial-mass bands; the source explicitly notes that these boundaries may change as stellar models improve.",
  metallicity_scope:
    "Approximately Solar-neighbourhood main-sequence calibration; v1 has no metallicity control and is not a stellar-evolution grid.",
};

export const STELLAR_LABORATORY_TEN_SOLAR_MASS_RESULT: StellarLaboratoryCalculationResponse = {
  model_version: "stellar-laboratory-v1",
  schema_version: 1,
  inputs: { initial_mass_msun: 10 },
  luminosity_lsun: 9332.543007969914,
  radius_rsun: 5.366024421126927,
  effective_temperature_k: 24490.632418447418,
  nearest_spectral_type_anchor: "B1",
  colour_anchor_mass_msun: 10.459,
  approximate_b_minus_v_mag: -0.28,
  main_sequence_lifetime_years: 32_000_000,
  evolutionary_path: [
    "main sequence",
    "massive-star supergiant evolution",
    "core-collapse supernova",
    "neutron star",
  ],
  expected_remnant: "neutron star",
  remnant_boundary_note: STELLAR_LABORATORY_DEFAULT_RESULT.remnant_boundary_note,
  metallicity_scope: STELLAR_LABORATORY_DEFAULT_RESULT.metallicity_scope,
};
