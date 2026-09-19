import type { RelativityVisualizationsCalculationResponse } from "@lumina/api-client";

export const RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT = {
  model_version: "relativity-visualizations-v1",
  schema_version: 1,
  inputs: {
    relative_speed_fraction_c: 0.6,
    proper_time_s: 10.0,
    proper_length_m: 100.0,
    simultaneous_event_separation_m: 299792458.0,
  },
  relative_speed_m_s: 179875474.79999998,
  lorentz_factor: 1.25,
  dilated_time_s: 12.5,
  contracted_length_m: 80.0,
  simultaneity_offset_s: -0.75,
  simultaneity_interpretation:
    "In S', event B at +x occurs earlier than event A under the frozen sign convention.",
  time_dilation_note:
    "Proper time is measured in the frame where both defining events occur at the same position. The returned dilated interval belongs to the inertial frame that sees that clock moving at the selected relative speed.",
  length_contraction_note:
    "Proper length is measured in the object's rest frame. The returned contracted length uses simultaneous endpoint positions in the inertial frame where the object moves; it is not a photographic appearance prediction.",
  light_cone_note:
    "The companion light-cone lesson uses fixed reviewed normalized c=1 geometry to teach causal boundaries. It is not derived from these user inputs in the browser.",
  model_note:
    "Educational one-dimensional inertial special-relativity model only. V1 omits acceleration, twin-paradox turnaround dynamics, velocity addition, relativistic Doppler shift, momentum/energy, four-vectors, arbitrary 3D boosts, rotating frames, general relativity, gravitational-redshift calculations, and GPS correction models.",
} as const satisfies RelativityVisualizationsCalculationResponse;

export const RELATIVITY_VISUALIZATIONS_BETA_08_RESULT = {
  model_version: "relativity-visualizations-v1",
  schema_version: 1,
  inputs: {
    relative_speed_fraction_c: 0.8,
    proper_time_s: 10.0,
    proper_length_m: 100.0,
    simultaneous_event_separation_m: 299792458.0,
  },
  relative_speed_m_s: 239833966.4,
  lorentz_factor: 1.666666666666667,
  dilated_time_s: 16.66666666666667,
  contracted_length_m: 59.99999999999999,
  simultaneity_offset_s: -1.3333333333333337,
  simultaneity_interpretation:
    "In S', event B at +x occurs earlier than event A under the frozen sign convention.",
  time_dilation_note:
    "Proper time is measured in the frame where both defining events occur at the same position. The returned dilated interval belongs to the inertial frame that sees that clock moving at the selected relative speed.",
  length_contraction_note:
    "Proper length is measured in the object's rest frame. The returned contracted length uses simultaneous endpoint positions in the inertial frame where the object moves; it is not a photographic appearance prediction.",
  light_cone_note:
    "The companion light-cone lesson uses fixed reviewed normalized c=1 geometry to teach causal boundaries. It is not derived from these user inputs in the browser.",
  model_note:
    "Educational one-dimensional inertial special-relativity model only. V1 omits acceleration, twin-paradox turnaround dynamics, velocity addition, relativistic Doppler shift, momentum/energy, four-vectors, arbitrary 3D boosts, rotating frames, general relativity, gravitational-redshift calculations, and GPS correction models.",
} as const satisfies RelativityVisualizationsCalculationResponse;
