import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SeasonsSimulatorNoScript } from "../src/components/seasons-simulator-no-script";
import { DEFAULT_SEASONS_STATE } from "../src/lib/simulations/seasons-simulator";
import type { SeasonsCalculationResponse } from "@lumina/api-client";

const RESULT: SeasonsCalculationResponse = {
  model_version: "seasons-simulator-v1",
  schema_version: 1,
  inputs: {
    axial_tilt_deg: 23.43928,
    orbital_position_deg: 90,
    latitude_deg: 40,
    eccentricity_preset: "earth",
  },
  solar_declination_deg: 23.43928,
  selected: {
    latitude_deg: 40,
    noon_solar_zenith_deg: 16.56072,
    noon_sun_altitude_deg: 73.43928,
    illumination_incidence_deg: 16.56072,
    day_length_hours: 14.8444511275,
    polar_state: "none",
  },
  comparison_latitude_deg: -40,
  opposite_hemisphere: {
    latitude_deg: -40,
    noon_solar_zenith_deg: 63.43928,
    noon_sun_altitude_deg: 26.56072,
    illumination_incidence_deg: 63.43928,
    day_length_hours: 9.1555488725,
    polar_state: "none",
  },
  eccentricity: 0.01671123,
  distance_over_semimajor_axis: 1.0162727707813541,
  relative_solar_flux: 0.9682319752100141,
};

describe("SeasonsSimulatorNoScript", () => {
  it("renders a complete textual result, table, model disclosure, and provenance", () => {
    const markup = renderToStaticMarkup(
      <SeasonsSimulatorNoScript
        initialCalculation={RESULT}
        initialState={DEFAULT_SEASONS_STATE}
        initialStateInvalid={false}
      />,
    );
    const tableBody = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";

    expect((tableBody.match(/<tr>/g) ?? []).length).toBe(2);
    expect(markup).toContain("Solar declination");
    expect(markup).toContain("14.8 h");
    expect(markup).toContain("The exaggerated preset is hypothetical.");
    expect(markup).toContain("NASA Space Place");
    expect(markup).toContain("Geometric day-length approximation");
    expect(markup).not.toContain("Loading interactive controls");
  });

  it("reports invalid state exactly once and does not fabricate unavailable output", () => {
    const markup = renderToStaticMarkup(
      <SeasonsSimulatorNoScript
        initialCalculation={null}
        initialState={DEFAULT_SEASONS_STATE}
        initialStateInvalid
      />,
    );

    expect((markup.match(/role="alert"/g) ?? []).length).toBe(2);
    expect(markup).toContain("The shared Seasons Simulator state was not valid");
    expect(markup).toContain("Calculation unavailable");
    expect(markup).not.toContain("73.4°");
  });
});
