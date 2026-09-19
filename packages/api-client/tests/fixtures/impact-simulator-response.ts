import type { ImpactSimulatorCalculationResponse } from "../../src/generated/types.gen";

export const IMPACT_SIMULATOR_DEFAULT_RESPONSE = {
  model_version: "impact-simulator-v1",
  schema_version: 1,
  inputs: {
    diameter_m: 1500.0,
    impactor_density_kg_m3: 3000.0,
    speed_km_s: 17.0,
    impact_angle_deg: 45.0,
    target_material: "sedimentary_rock",
  },
  target_density_kg_m3: 2500.0,
  impactor_mass_kg: 5301437602932.775,
  kinetic_energy_j: 7.66057733623786e20,
  tnt_equivalent_megatons: 183267.40038846555,
  best_estimate_crater: {
    scaling_coefficient: 1.161,
    transient_diameter_m: 14508.944797012044,
    final_diameter_m: 20661.642867131854,
    classification: "complex",
  },
  coefficient_sensitivity: [
    {
      scaling_coefficient: 0.8,
      transient_diameter_m: 9997.550247725785,
      final_diameter_m: 13564.260681357457,
      classification: "complex",
    },
    {
      scaling_coefficient: 1.161,
      transient_diameter_m: 14508.944797012044,
      final_diameter_m: 20661.642867131854,
      classification: "complex",
    },
    {
      scaling_coefficient: 1.5,
      transient_diameter_m: 18745.40671448584,
      final_diameter_m: 27598.632595257543,
      classification: "complex",
    },
  ],
  ejecta_thickness_radii: [
    {
      thickness_m: 100.0,
      radius_m: 15816.428784083284,
    },
    {
      thickness_m: 10.0,
      radius_m: 34075.46284484783,
    },
    {
      thickness_m: 1.0,
      radius_m: 73413.3592318327,
    },
    {
      thickness_m: 0.1,
      radius_m: 158164.2878408328,
    },
  ],
  uncertainty_note:
    "The low/high crater values vary only the published Eq. 21 scaling coefficient from 0.8 to 1.5. They are a coefficient-sensitivity range, not a complete statistical confidence interval or full geological uncertainty estimate.",
  model_note:
    "Educational large solid-rock Earth-impact model only. V1 omits atmospheric entry, airbursts, water/tsunami, thermal radiation, seismic and blast effects, climate, casualty/property damage, maps, named locations, targeting, and optimization. Ejecta thickness radii are location-free lower-bound deposit estimates.",
} as const satisfies ImpactSimulatorCalculationResponse;
