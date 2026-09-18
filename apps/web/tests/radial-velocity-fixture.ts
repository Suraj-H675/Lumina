import type { RadialVelocityCalculationResponse } from "@lumina/api-client";

import {
  DEFAULT_RADIAL_VELOCITY_STATE,
  type RadialVelocityState,
} from "../src/lib/simulations/radial-velocity";

function curve() {
  return Array.from({ length: 301 }, (_, index) => ({
    time_s: (DEFAULT_RADIAL_VELOCITY_STATE.orbital_period_s * index) / 300,
    orbital_phase: index / 300,
    radial_velocity_m_s: index - 150,
  }));
}

export const RADIAL_VELOCITY_DEFAULT_RESULT: RadialVelocityCalculationResponse = {
  model_version: "radial-velocity-v1",
  schema_version: 1,
  inputs: {
    stellar_mass_kg: DEFAULT_RADIAL_VELOCITY_STATE.stellar_mass_kg,
    planet_mass_kg: DEFAULT_RADIAL_VELOCITY_STATE.planet_mass_kg,
    orbital_period_s: DEFAULT_RADIAL_VELOCITY_STATE.orbital_period_s,
    eccentricity: DEFAULT_RADIAL_VELOCITY_STATE.eccentricity,
    inclination_deg: DEFAULT_RADIAL_VELOCITY_STATE.inclination_deg,
    stellar_argument_of_periastron_deg:
      DEFAULT_RADIAL_VELOCITY_STATE.stellar_argument_of_periastron_deg,
    mean_anomaly_at_epoch_deg: DEFAULT_RADIAL_VELOCITY_STATE.mean_anomaly_at_epoch_deg,
  },
  inclination_projection: 1,
  semi_amplitude_m_s: 28.3,
  projected_planet_mass_kg: 2e27,
  mass_function_kg: 2e21,
  edge_on_minimum_mass_kg: 2e27,
  curve: curve(),
};

export function radialVelocityResponseFor(
  state: RadialVelocityState,
): RadialVelocityCalculationResponse {
  return {
    ...RADIAL_VELOCITY_DEFAULT_RESULT,
    inputs: {
      stellar_mass_kg: state.stellar_mass_kg,
      planet_mass_kg: state.planet_mass_kg,
      orbital_period_s: state.orbital_period_s,
      eccentricity: state.eccentricity,
      inclination_deg: state.inclination_deg,
      stellar_argument_of_periastron_deg: state.stellar_argument_of_periastron_deg,
      mean_anomaly_at_epoch_deg: state.mean_anomaly_at_epoch_deg,
    },
  };
}
