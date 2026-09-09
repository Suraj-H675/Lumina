import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TelescopeBuilderCalculationResponse } from "@lumina/api-client";

import { TelescopeBuilderNoScript } from "../src/components/telescope-builder-no-script";
import { DEFAULT_TELESCOPE_BUILDER_STATE } from "../src/lib/simulations/telescope-builder";

const RESULT: TelescopeBuilderCalculationResponse = {
  model_version: "telescope-builder-v1",
  schema_version: 1,
  inputs: {
    aperture_mm: 100,
    telescope_focal_length_mm: 1000,
    telescope_type: "refractor",
    eyepiece_focal_length_mm: 20,
    eyepiece_apparent_field_deg: 50,
    optical_modifier_kind: "none",
    optical_modifier_factor: 1,
    target_angular_size_arcmin: 30,
  },
  effective_focal_length_mm: 1000,
  native_focal_ratio: 10,
  effective_focal_ratio: 10,
  magnification_x: 50,
  approx_true_field_deg: 1,
  exit_pupil_mm: 2,
  dawes_limit_arcsec: 1.16,
  rayleigh_limit_arcsec: 1.3840368499180167,
  ideal_light_gathering_ratio_vs_7mm_pupil: 204.08163265306123,
  target_angular_size_deg: 0.5,
  target_field_fraction: 0.5,
  target_fit: "fits",
  warning_codes: [],
};

describe("TelescopeBuilderNoScript", () => {
  it("renders the complete canonical textual result and model disclosures", () => {
    const markup = renderToStaticMarkup(
      <TelescopeBuilderNoScript
        initialCalculation={RESULT}
        initialState={DEFAULT_TELESCOPE_BUILDER_STATE}
        initialStateInvalid={false}
      />,
    );
    const tableBody = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";

    expect((tableBody.match(/<tr>/g) ?? []).length).toBe(12);
    expect(tableBody).toContain("50.0×");
    expect(tableBody).toContain("1.00°");
    expect(tableBody).toContain("2.00 mm");
    expect(markup).toContain("These are idealized optical estimates, not guaranteed views");
    expect(markup).toContain("Astronomy Glossary of Terms");
    expect(markup).not.toContain("Loading interactive controls");
  });

  it("reports malformed state and unavailable calculation without fabricating output", () => {
    const markup = renderToStaticMarkup(
      <TelescopeBuilderNoScript
        initialCalculation={null}
        initialState={DEFAULT_TELESCOPE_BUILDER_STATE}
        initialStateInvalid
      />,
    );

    expect(markup).toContain("The shared Telescope Builder state was not valid");
    expect(markup).toContain("Calculation unavailable");
    expect(markup).not.toContain("50.00×");
  });

  it("keeps practical warning explanations available without JavaScript", () => {
    const markup = renderToStaticMarkup(
      <TelescopeBuilderNoScript
        initialCalculation={{
          ...RESULT,
          warning_codes: ["high_magnification_guideline"],
        }}
        initialState={DEFAULT_TELESCOPE_BUILDER_STATE}
        initialStateInvalid={false}
      />,
    );

    expect(markup).toContain("Rules-of-thumb warnings");
    expect(markup).toContain("common ~2× per millimetre aperture visual-magnification guideline");
  });
});
