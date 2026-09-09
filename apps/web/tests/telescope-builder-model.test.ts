import { describe, expect, it } from "vitest";

import type { TelescopeBuilderCalculationResponse } from "@lumina/api-client";

import {
  DEFAULT_TELESCOPE_BUILDER_STATE,
  TELESCOPE_BUILDER_MODEL_VERSION,
  TELESCOPE_DEFINITION,
  TELESCOPE_SOURCES,
  buildTelescopeBuilderVisualTransform,
  decodeTelescopeBuilderState,
  encodeTelescopeBuilderState,
  validateTelescopeBuilderCalculationResult,
  validateTelescopeBuilderState,
} from "../src/lib/simulations/telescope-builder";

const defaultResponse: TelescopeBuilderCalculationResponse = {
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

describe("Telescope Builder reviewed model boundary", () => {
  it("keeps the default state and deterministic field order canonical", () => {
    expect(DEFAULT_TELESCOPE_BUILDER_STATE).toEqual({
      version: 1,
      model_version: "telescope-builder-v1",
      aperture_mm: 100,
      telescope_focal_length_mm: 1000,
      telescope_type: "refractor",
      eyepiece_focal_length_mm: 20,
      eyepiece_apparent_field_deg: 50,
      optical_modifier_kind: "none",
      optical_modifier_factor: 1,
      target_angular_size_arcmin: 30,
    });
    expect(encodeTelescopeBuilderState(DEFAULT_TELESCOPE_BUILDER_STATE)).toBe(
      '{"version":1,"model_version":"telescope-builder-v1","aperture_mm":100,"telescope_focal_length_mm":1000,"telescope_type":"refractor","eyepiece_focal_length_mm":20,"eyepiece_apparent_field_deg":50,"optical_modifier_kind":"none","optical_modifier_factor":1,"target_angular_size_arcmin":30}',
    );
    expect(
      decodeTelescopeBuilderState(encodeTelescopeBuilderState(DEFAULT_TELESCOPE_BUILDER_STATE)),
    ).toEqual(DEFAULT_TELESCOPE_BUILDER_STATE);
  });

  it("rejects malformed, additive, and noncanonical share state while deferring derived validity to the API", () => {
    const encoded = encodeTelescopeBuilderState(DEFAULT_TELESCOPE_BUILDER_STATE);
    expect(decodeTelescopeBuilderState(`${encoded.slice(0, -1)},"extra":true}`)).toBeNull();
    expect(decodeTelescopeBuilderState(` ${encoded}`)).toBeNull();
    expect(
      validateTelescopeBuilderState({
        ...DEFAULT_TELESCOPE_BUILDER_STATE,
        aperture_mm: 19,
      }),
    ).toBeNull();
    expect(
      validateTelescopeBuilderState({
        ...DEFAULT_TELESCOPE_BUILDER_STATE,
        optical_modifier_kind: "reducer",
        optical_modifier_factor: 0.5,
        eyepiece_focal_length_mm: 60,
        aperture_mm: 20,
        telescope_focal_length_mm: 100,
      }),
    ).not.toBeNull();
    expect(
      validateTelescopeBuilderState({
        ...DEFAULT_TELESCOPE_BUILDER_STATE,
        aperture_mm: Number.NaN,
      }),
    ).toBeNull();
  });

  it("accepts the canonical API response only when it binds to the requested state", () => {
    expect(
      validateTelescopeBuilderCalculationResult(DEFAULT_TELESCOPE_BUILDER_STATE, defaultResponse),
    ).toEqual(defaultResponse);
    expect(
      validateTelescopeBuilderCalculationResult(DEFAULT_TELESCOPE_BUILDER_STATE, {
        ...defaultResponse,
        inputs: { ...defaultResponse.inputs, telescope_type: "reflector" },
      }),
    ).toBeNull();
    expect(
      validateTelescopeBuilderCalculationResult(DEFAULT_TELESCOPE_BUILDER_STATE, {
        ...defaultResponse,
        warning_codes: ["invented-warning"],
      }),
    ).toBeNull();
    expect(
      validateTelescopeBuilderCalculationResult(DEFAULT_TELESCOPE_BUILDER_STATE, {
        ...defaultResponse,
        extra: true,
      }),
    ).toBeNull();
  });

  it("keeps the field-fit visual transform proportional without owning optical formulas", () => {
    const visual = buildTelescopeBuilderVisualTransform(
      DEFAULT_TELESCOPE_BUILDER_STATE,
      defaultResponse,
    );
    expect(visual?.field).toEqual({
      field_diameter_percent: 100,
      target_diameter_percent: 50,
      target_exceeds_field: false,
    });
    expect(visual?.opticalTrain.modifier_x_percent).toBeNull();
    expect(visual?.opticalTrain.native_focal_length_label).toBe("1000 mm native");
    expect(visual?.opticalTrain.effective_focal_length_label).toBe("1000 mm effective");
  });

  it("binds every reviewed source ID to its checked-in URL and page title", () => {
    const expected = {
      "openstax-telescopes": [
        "https://openstax.org/books/astronomy/pages/6-1-telescopes",
        "6.1 Telescopes",
      ],
      "openstax-circular-apertures": [
        "https://openstax.org/books/university-physics-volume-3/pages/4-5-circular-apertures-and-resolution",
        "4.5 Circular Apertures and Resolution",
      ],
      "sky-telescope-dawes": [
        "https://skyandtelescope.org/stargazing-and-observing/pushing-limits-a-spring-sky-double-star-romp/",
        "Pushing Limits: A Spring Sky Double Star Romp",
      ],
      "celestron-astronomy-glossary": [
        "https://www.celestron.com/blogs/knowledgebase/astronomy-glossary-of-terms",
        "Astronomy Glossary of Terms",
      ],
      "wwu-astropages-telescopes": ["https://astro101.wwu.edu/a101_telescopes.html", "Telescopes"],
      "celestron-exit-pupil": [
        "https://www.celestron.com/blogs/knowledgebase/what-is-exit-pupil-and-eye-relief-for-sport-optics",
        "What is Exit Pupil and Eye Relief for Sport Optics?",
      ],
      "sky-telescope-magnification": [
        "https://skyandtelescope.org/astronomy-equipment/choosing-your-telescopes-magnification/",
        "How to Choose Your Telescope Magnification",
      ],
    } as const;
    expect(
      Object.fromEntries(
        TELESCOPE_SOURCES.map((source) => [source.id, [source.url, source.title]]),
      ),
    ).toEqual(expected);
    expect(TELESCOPE_DEFINITION.model_version).toBe(TELESCOPE_BUILDER_MODEL_VERSION);
  });
});
