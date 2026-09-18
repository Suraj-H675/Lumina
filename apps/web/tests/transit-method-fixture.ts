import type { TransitMethodCalculationResponse } from "@lumina/api-client";

import {
  DEFAULT_TRANSIT_METHOD_STATE,
  type TransitMethodState,
} from "../src/lib/simulations/transit-method";

function lightCurve() {
  return Array.from({ length: 301 }, (_, index) => {
    const time = (index - 150) * 100;
    return {
      time_from_mid_transit_s: time,
      orbital_phase: time / 259_200,
      projected_separation_stellar_radii: Math.abs(index - 150) / 150,
      relative_flux: index === 150 ? 0.99 : 1,
    };
  });
}

export const TRANSIT_DEFAULT_RESULT: TransitMethodCalculationResponse = {
  model_version: "transit-method-v1",
  schema_version: 1,
  inputs: {
    stellar_radius_m: DEFAULT_TRANSIT_METHOD_STATE.stellar_radius_m,
    planet_radius_m: DEFAULT_TRANSIT_METHOD_STATE.planet_radius_m,
    semi_major_axis_m: DEFAULT_TRANSIT_METHOD_STATE.semi_major_axis_m,
    orbital_period_s: DEFAULT_TRANSIT_METHOD_STATE.orbital_period_s,
    inclination_deg: DEFAULT_TRANSIT_METHOD_STATE.inclination_deg,
  },
  radius_ratio: 0.1,
  scaled_semi_major_axis: 10,
  impact_parameter: 0,
  classification: "full",
  central_depth_approximation_fraction: 0.01,
  maximum_depth_fraction: 0.01,
  maximum_depth_ppm: 10_000,
  total_duration_s: 9_100,
  full_duration_s: 7_400,
  light_curve: lightCurve(),
};

export function transitResponseFor(state: TransitMethodState): TransitMethodCalculationResponse {
  return {
    ...TRANSIT_DEFAULT_RESULT,
    inputs: {
      stellar_radius_m: state.stellar_radius_m,
      planet_radius_m: state.planet_radius_m,
      semi_major_axis_m: state.semi_major_axis_m,
      orbital_period_s: state.orbital_period_s,
      inclination_deg: state.inclination_deg,
    },
  };
}
