import type { PlanetarySystemBuilderCalculationResponse } from "@lumina/api-client";

/* Generated from the canonical Python Planetary System Builder v1 model for tests only. */
export const PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT = {
  model_version: "planetary-system-builder-v1",
  schema_version: 1,
  inputs: {
    stellar_mass_msun: 1.0,
    stellar_luminosity_lsun: 1.0,
    stellar_effective_temperature_k: 5780.0,
    planets: [
      { mass_mearth: 1.0, semi_major_axis_au: 0.7 },
      { mass_mearth: 1.0, semi_major_axis_au: 1.0 },
      { mass_mearth: 1.0, semi_major_axis_au: 2.0 },
    ],
  },
  habitable_zone: {
    model_id: "kopparapu-2014-1earth-conservative",
    inner_edge_au: 0.950443247520335,
    outer_edge_au: 1.6760038078849773,
    inner_effective_flux: 1.107,
    outer_effective_flux: 0.356,
    habitability_note:
      "This is a 1-Earth-mass conservative climate-model reference band. Being inside it does not establish habitability or life.",
  },
  planets: [
    {
      index: 1,
      mass_mearth: 1.0,
      semi_major_axis_au: 0.7,
      orbital_period_s: 18482409.02800731,
      orbital_period_days: 213.916771157492,
      habitable_zone_relation: "interior_to_reference_hz",
    },
    {
      index: 2,
      mass_mearth: 1.0,
      semi_major_axis_au: 1.0,
      orbital_period_s: 31558148.628135167,
      orbital_period_days: 365.25634986267556,
      habitable_zone_relation: "inside_reference_hz",
    },
    {
      index: 3,
      mass_mearth: 1.0,
      semi_major_axis_au: 2.0,
      orbital_period_s: 89259923.58658928,
      orbital_period_days: 1033.1009674373759,
      habitable_zone_relation: "exterior_to_reference_hz",
    },
  ],
  adjacent_pairs: [
    {
      inner_index: 1,
      outer_index: 2,
      mutual_hill_radius_au: 0.010713479380320377,
      separation_mutual_hill: 28.00210737802613,
      pairwise_reference_threshold: 3.4641016151377544,
      spacing_assessment: "no_pairwise_hill_warning",
      interpretation:
        "This adjacent pair is above the cited two-circular-planet mutual-Hill reference threshold. This is not a long-term or whole-system stability guarantee.",
    },
    {
      inner_index: 2,
      outer_index: 3,
      mutual_hill_radius_au: 0.018906140082918313,
      separation_mutual_hill: 52.89286949182713,
      pairwise_reference_threshold: 3.4641016151377544,
      spacing_assessment: "no_pairwise_hill_warning",
      interpretation:
        "This adjacent pair is above the cited two-circular-planet mutual-Hill reference threshold. This is not a long-term or whole-system stability guarantee.",
    },
  ],
  stellar_consistency_note:
    "Stellar mass, luminosity, and effective temperature are independent educational controls; v1 does not certify their combination as a stellar-evolution solution.",
  stability_note:
    "Adjacent mutual-Hill values are pairwise circular-orbit context only. V1 performs no n-body integration and makes no long-term multi-planet stability claim.",
} as PlanetarySystemBuilderCalculationResponse;

/* Python-produced alternate state: first planet moved from 0.7 AU to 0.8 AU. */
export const PLANETARY_SYSTEM_BUILDER_AXIS_08_RESULT = {
  ...PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT,
  inputs: {
    ...PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT.inputs,
    planets: [
      { mass_mearth: 1.0, semi_major_axis_au: 0.8 },
      { mass_mearth: 1.0, semi_major_axis_au: 1.0 },
      { mass_mearth: 1.0, semi_major_axis_au: 2.0 },
    ],
  },
  planets: [
    {
      index: 1,
      mass_mearth: 1.0,
      semi_major_axis_au: 0.8,
      orbital_period_s: 22581172.98449663,
      orbital_period_days: 261.35616880204435,
      habitable_zone_relation: "interior_to_reference_hz",
    },
    PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT.planets[1]!,
    PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT.planets[2]!,
  ],
  adjacent_pairs: [
    {
      inner_index: 1,
      outer_index: 2,
      mutual_hill_radius_au: 0.011343684049750988,
      separation_mutual_hill: 17.630956497275704,
      pairwise_reference_threshold: 3.4641016151377544,
      spacing_assessment: "no_pairwise_hill_warning",
      interpretation:
        "This adjacent pair is above the cited two-circular-planet mutual-Hill reference threshold. This is not a long-term or whole-system stability guarantee.",
    },
    PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT.adjacent_pairs[1]!,
  ],
} as PlanetarySystemBuilderCalculationResponse;
