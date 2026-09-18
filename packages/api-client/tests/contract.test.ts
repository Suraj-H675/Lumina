import { describe, expect, expectTypeOf, it } from "vitest";

import {
  catalogEntitiesEndpoint,
  catalogEntityBySlugEndpoint,
  catalogEntityDetailEndpoint,
  catalogSuggestEndpoint,
  catalogSearchEndpoint,
  eclipseSimulatorEndpoint,
  ORBIT_SANDBOX_MAX_RESPONSE_BYTES,
  orbitSandboxEndpoint,
  radialVelocityEndpoint,
  seasonsSimulatorEndpoint,
  spectroscopyLabEndpoint,
  stellarLaboratoryEndpoint,
  telescopeBuilderEndpoint,
  transitMethodEndpoint,
  liveEndpoint,
  metaEndpoint,
  readyEndpoint,
  satellitePassEndpoint,
  satellitesEndpoint,
  validateExactGenerated,
} from "../src/contract";
import { MAX_RESPONSE_BYTES, requestEndpoint } from "../src/transport";
import type {
  EntityBrowsePageResponse,
  EntitySummaryResponse,
  EntityType,
  CalculateEclipseSimulatorData,
  CalculateOrbitSandboxData,
  CalculateRadialVelocityData,
  CalculateSeasonsSimulatorData,
  CalculateSpectroscopyLabData,
  CalculateStellarLaboratoryData,
  CalculateTelescopeBuilderData,
  CalculateTransitMethodData,
  GetCatalogEntityBySlugData,
  GetCatalogEntityData,
  LiveHealthLiveGetData,
  GetNowSatellitesData,
  ListCatalogEntitiesData,
  MetadataApiV1MetaGetData,
  PostNowSatellitePassesData,
  ReadyHealthReadyGetData,
  SearchCatalogEntitiesData,
  SuggestCatalogEntitiesData,
} from "../src/generated/types.gen";
import {
  zEntityBrowsePageResponse,
  zEntitySummaryResponse,
  zGetCatalogEntityBySlugResponse,
  zListCatalogEntitiesResponse,
  zLiveResponse,
  zMetaResponse,
  zSearchCatalogEntitiesResponse,
  zSuggestCatalogEntitiesResponse,
} from "../src/generated/zod.gen";
import { SPECTROSCOPY_DEFAULT_RESPONSE } from "./fixtures/spectroscopy-lab-response";

describe("generated contract boundary", () => {
  it("keeps request methods and paths tied to generated operation types", () => {
    expect(liveEndpoint.method).toBe("GET");
    expect(readyEndpoint.method).toBe("GET");
    expect(metaEndpoint.method).toBe("GET");
    expectTypeOf(liveEndpoint.path).toEqualTypeOf<LiveHealthLiveGetData["url"]>();
    expectTypeOf(readyEndpoint.path).toEqualTypeOf<ReadyHealthReadyGetData["url"]>();
    expectTypeOf(metaEndpoint.path).toEqualTypeOf<MetadataApiV1MetaGetData["url"]>();
    expect(satellitesEndpoint.method).toBe("GET");
    expect(satellitePassEndpoint.method).toBe("POST");
    expectTypeOf(satellitesEndpoint.path).toEqualTypeOf<GetNowSatellitesData["url"]>();
    expectTypeOf(satellitePassEndpoint.path).toEqualTypeOf<PostNowSatellitePassesData["url"]>();
    expect(eclipseSimulatorEndpoint.method).toBe("GET");
    expectTypeOf(eclipseSimulatorEndpoint.path).toEqualTypeOf<
      CalculateEclipseSimulatorData["url"]
    >();
    expect(orbitSandboxEndpoint.method).toBe("GET");
    expectTypeOf(orbitSandboxEndpoint.path).toEqualTypeOf<CalculateOrbitSandboxData["url"]>();
    expect(radialVelocityEndpoint.method).toBe("GET");
    expectTypeOf(radialVelocityEndpoint.path).toEqualTypeOf<CalculateRadialVelocityData["url"]>();
    expect(seasonsSimulatorEndpoint.method).toBe("GET");
    expectTypeOf(seasonsSimulatorEndpoint.path).toEqualTypeOf<
      CalculateSeasonsSimulatorData["url"]
    >();
    expect(spectroscopyLabEndpoint.method).toBe("GET");
    expectTypeOf(spectroscopyLabEndpoint.path).toEqualTypeOf<CalculateSpectroscopyLabData["url"]>();
    expect(stellarLaboratoryEndpoint.method).toBe("GET");
    expectTypeOf(stellarLaboratoryEndpoint.path).toEqualTypeOf<
      CalculateStellarLaboratoryData["url"]
    >();
    expect(transitMethodEndpoint.method).toBe("GET");
    expectTypeOf(transitMethodEndpoint.path).toEqualTypeOf<CalculateTransitMethodData["url"]>();
  });

  it("accepts exact generated responses", () => {
    expect(validateExactGenerated(zLiveResponse, { status: "live" })).toEqual({
      data: { status: "live" },
      valid: true,
    });
    expect(
      validateExactGenerated(zMetaResponse, {
        api_version: "v1",
        application_name: "Lumina",
        application_version: "0.0.0",
        build_commit: null,
        feature_flags: {},
      }).valid,
    ).toBe(true);
  });

  it("exposes the Phase 1B2 summary, browse, and operation contracts", () => {
    expectTypeOf<EntitySummaryResponse>().toEqualTypeOf<{
      id: string;
      slug: string;
      entity_type: EntityType;
      canonical_name: string;
    }>();
    expectTypeOf<EntityBrowsePageResponse["items"]>().toEqualTypeOf<Array<EntitySummaryResponse>>();
    expectTypeOf<
      GetCatalogEntityBySlugData["url"]
    >().toEqualTypeOf<"/api/v1/catalog/entities/by-slug/{slug}">();
    expectTypeOf<ListCatalogEntitiesData["url"]>().toEqualTypeOf<"/api/v1/catalog/entities">();
    expectTypeOf<NonNullable<ListCatalogEntitiesData["query"]>["entity_type"]>().toEqualTypeOf<
      EntityType | null | undefined
    >();
    expectTypeOf<SearchCatalogEntitiesData["url"]>().toEqualTypeOf<"/api/v1/search">();
    expectTypeOf<SuggestCatalogEntitiesData["url"]>().toEqualTypeOf<"/api/v1/search/suggest">();
  });

  it("validates the exact four-field navigation responses", () => {
    const summary = {
      id: "12345678-1234-4234-9234-123456789abc",
      slug: "hd-209458",
      entity_type: "star" as const,
      canonical_name: "HD 209458",
    };
    const page = {
      items: [summary],
      page: { next_cursor: null, has_more: false, limit: 20 },
    };

    expect(validateExactGenerated(zEntitySummaryResponse, summary).valid).toBe(true);
    expect(validateExactGenerated(zEntityBrowsePageResponse, page).valid).toBe(true);
    expect(validateExactGenerated(zGetCatalogEntityBySlugResponse, summary).valid).toBe(true);
    expect(validateExactGenerated(zListCatalogEntitiesResponse, page).valid).toBe(true);
    expect(
      validateExactGenerated(zSearchCatalogEntitiesResponse, {
        items: [{ entity: summary, match_reason: "exact_slug", matched_alias: null }],
      }).valid,
    ).toBe(true);
    expect(
      validateExactGenerated(zSuggestCatalogEntitiesResponse, { items: [summary] }).valid,
    ).toBe(true);
    expect(validateExactGenerated(zEntitySummaryResponse, { ...summary, id: 42 })).toEqual({
      valid: false,
    });
    expect(validateExactGenerated(zEntitySummaryResponse, { ...summary, extra: true })).toEqual({
      valid: false,
    });
    expect(
      validateExactGenerated(zEntityBrowsePageResponse, {
        ...page,
        items: [{ ...summary, canonical_name: "" }],
      }),
    ).toEqual({ valid: false });
  });

  it("rejects additive unknown fields instead of inheriting Zod's strip default", () => {
    expect(zLiveResponse.parse({ status: "live", unexpected: true })).toEqual({ status: "live" });
    expect(validateExactGenerated(zLiveResponse, { status: "live", unexpected: true })).toEqual({
      valid: false,
    });
    expect(
      validateExactGenerated(zMetaResponse, {
        api_version: "v1",
        application_name: "Lumina",
        application_version: "0.0.0",
        build_commit: null,
        feature_flags: {},
        nested_future_field: {},
      }),
    ).toEqual({ valid: false });
  });
});

describe("catalogue discovery endpoints", () => {
  const summary: EntitySummaryResponse = {
    id: "0b6e7c30-1e2a-5c4d-9f3e-6a5b7c8d9e0f",
    slug: "k2-18",
    entity_type: "star",
    canonical_name: "K2-18",
  };

  function respondWith(body: unknown): typeof fetch {
    return () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
  }

  it("binds the search endpoint to the generated operation contract", async () => {
    expectTypeOf(catalogSearchEndpoint.path).toEqualTypeOf<SearchCatalogEntitiesData["url"]>();
    expectTypeOf(catalogSearchEndpoint.method).toEqualTypeOf<"GET">();

    const result = await requestEndpoint("http://127.0.0.1:8000", catalogSearchEndpoint, {
      fetchImplementation: respondWith({
        items: [{ entity: summary, match_reason: "canonical_name_prefix", matched_alias: null }],
      }),
    });

    expect(result).toEqual({
      data: {
        items: [{ entity: summary, match_reason: "canonical_name_prefix", matched_alias: null }],
      },
      kind: "ok",
      status: 200,
    });
  });

  it("binds the suggest endpoint to the generated operation contract", async () => {
    expectTypeOf(catalogSuggestEndpoint.path).toEqualTypeOf<SuggestCatalogEntitiesData["url"]>();
    expectTypeOf(catalogSuggestEndpoint.method).toEqualTypeOf<"GET">();

    const result = await requestEndpoint("http://127.0.0.1:8000", catalogSuggestEndpoint, {
      fetchImplementation: respondWith({ items: [summary] }),
    });

    expect(result).toEqual({ data: { items: [summary] }, kind: "ok", status: 200 });
  });

  it("rejects malformed discovery payloads instead of trusting them", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", catalogSearchEndpoint, {
      fetchImplementation: respondWith({
        items: [{ entity: summary, match_reason: "invented_tier", matched_alias: null }],
      }),
    });

    expect(result).toEqual({ kind: "malformed-response" });
  });

  it("binds the catalogue read endpoints used by explore and object pages", async () => {
    expectTypeOf(catalogEntitiesEndpoint.path).toEqualTypeOf<ListCatalogEntitiesData["url"]>();
    expectTypeOf(catalogEntityBySlugEndpoint.path).toEqualTypeOf<
      GetCatalogEntityBySlugData["url"]
    >();
    expectTypeOf(catalogEntityDetailEndpoint.path).toEqualTypeOf<GetCatalogEntityData["url"]>();

    const browse = await requestEndpoint("http://127.0.0.1:8000", catalogEntitiesEndpoint, {
      fetchImplementation: respondWith({
        items: [summary],
        page: { has_more: false, limit: 20, next_cursor: null },
      }),
    });
    expect(browse).toEqual({
      data: { items: [summary], page: { has_more: false, limit: 20, next_cursor: null } },
      kind: "ok",
      status: 200,
    });

    const bySlug = await requestEndpoint("http://127.0.0.1:8000", catalogEntityBySlugEndpoint, {
      fetchImplementation: respondWith(summary),
    });
    expect(bySlug.kind).toBe("ok");

    const detail = await requestEndpoint("http://127.0.0.1:8000", catalogEntityDetailEndpoint, {
      fetchImplementation: respondWith({
        canonical_name: "K2-18",
        entity_type: "star",
        id: summary.id,
        quantities: [],
      }),
    });
    expect(detail.kind).toBe("ok");
  });
});

describe("Eclipse Simulator endpoint", () => {
  const response = {
    model_version: "eclipse-simulator-v1",
    schema_version: 1,
    inputs: {
      at_utc: "2024-04-08T18:42:00Z",
      latitude_deg: 32.7767,
      longitude_deg: -96.797,
      elevation_m: 130,
    },
    instant: {
      phase: "total" as const,
      shadow_region: "umbra" as const,
      sun_angular_radius_deg: 0.266061098358121,
      moon_angular_radius_deg: 0.28115446961677854,
      center_separation_deg: 0.008257460757938725,
      obscuration_fraction: 1,
      sun_distance_km: 149818283.5031317,
      moon_distance_km: 354061.90398480877,
      sun_altitude_deg: 64.63500288803954,
      sun_above_geometric_horizon: true,
    },
    local_event: {
      classification: "total" as const,
      partial_begin_utc: "2024-04-08T17:23:00Z",
      central_begin_utc: "2024-04-08T18:41:00Z",
      maximum_utc: "2024-04-08T18:43:00Z",
      central_end_utc: "2024-04-08T18:45:00Z",
      partial_end_utc: "2024-04-08T20:03:00Z",
      maximum_obscuration_fraction: 1,
      sun_altitude_deg_at_maximum: 64.61411692634734,
      sun_above_geometric_horizon_at_maximum: true,
    },
    ephemeris_note:
      "Astropy 8.0.1 builtin offline ephemeris; ERFA moon98 is approximate/non-canonical and v1 is bounded to the locked offline Earth-orientation interval.",
    timing_note:
      "Local event contacts and maximum are approximate educational estimates rounded to whole UTC minutes; no second-level precision is claimed.",
    safety_reference_id: "nasa-eclipse-safety",
  };

  it("binds the generated URL and accepts the exact canonical result shape", async () => {
    expectTypeOf(eclipseSimulatorEndpoint.path).toEqualTypeOf<
      CalculateEclipseSimulatorData["url"]
    >();
    const result = await requestEndpoint("http://127.0.0.1:8000", eclipseSimulatorEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ data: response, kind: "ok", status: 200 });
  });

  it("rejects additive Eclipse Simulator result fields", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", eclipseSimulatorEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...response, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ kind: "malformed-response" });
  });
});

describe("Spectroscopy Lab endpoint", () => {
  it("binds the generated URL and accepts the exact Python-produced response shape", async () => {
    expectTypeOf(spectroscopyLabEndpoint.path).toEqualTypeOf<CalculateSpectroscopyLabData["url"]>();
    const result = await requestEndpoint("http://127.0.0.1:8000", spectroscopyLabEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify(SPECTROSCOPY_DEFAULT_RESPONSE), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({
      data: SPECTROSCOPY_DEFAULT_RESPONSE,
      kind: "ok",
      status: 200,
    });
  });

  it("rejects additive Spectroscopy Lab result fields", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", spectroscopyLabEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...SPECTROSCOPY_DEFAULT_RESPONSE, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ kind: "malformed-response" });
  });
});

describe("Orbit Sandbox endpoint", () => {
  const response = {
    model_version: "orbit-sandbox-v1",
    schema_version: 1,
    inputs: {
      central_mass_kg: 5.9722e24,
      central_radius_m: 6_371_000,
      orbiting_body_mass_kg: 0,
      position_x_m: 7_000_000,
      position_y_m: 0,
      velocity_x_m_s: 0,
      velocity_y_m_s: 7546.073194525935,
      duration_s: 10,
      time_step_s: 10,
    },
    gravitational_parameter_m3_s2: 398602544600000,
    reduced_mass_kg: null,
    specific_orbital_energy_j_per_kg: -28471610.32857143,
    orbital_energy_j: null,
    specific_angular_momentum_m2_per_s: 52822512361.68155,
    angular_momentum_kg_m2_per_s: null,
    eccentricity: 0,
    semi_major_axis_m: 7_000_000,
    period_s: 5828.501263698674,
    periapsis_m: 7_000_000,
    apoapsis_m: 7_000_000,
    classification: "bound" as const,
    collision_time_s: null,
    trajectory: [
      {
        time_s: 0,
        x_m: 7_000_000,
        y_m: 0,
        distance_m: 7_000_000,
        speed_m_s: 7546.073194525935,
      },
    ],
    max_specific_energy_drift_fraction: 0,
    max_specific_angular_momentum_drift_fraction: 0,
  };

  it("binds the operation to its generated URL and exact result shape", async () => {
    expectTypeOf(orbitSandboxEndpoint.path).toEqualTypeOf<CalculateOrbitSandboxData["url"]>();
    const result = await requestEndpoint("http://127.0.0.1:8000", orbitSandboxEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ data: response, kind: "ok", status: 200 });
  });

  it("accepts a valid trajectory response larger than the generic response budget", async () => {
    const largeResponse = {
      ...response,
      inputs: { ...response.inputs, duration_s: 9_000 },
      trajectory: Array.from({ length: 901 }, (_, index) => ({
        time_s: index * 10,
        x_m: 7_000_000 - index,
        y_m: index,
        distance_m: 7_000_000,
        speed_m_s: 7546.073194525935,
      })),
    };
    const serialized = JSON.stringify(largeResponse);
    expect(new TextEncoder().encode(serialized).byteLength).toBeGreaterThan(MAX_RESPONSE_BYTES);

    const result = await requestEndpoint("http://127.0.0.1:8000", orbitSandboxEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(serialized, {
            headers: {
              "content-length": String(new TextEncoder().encode(serialized).byteLength),
              "content-type": "application/json",
            },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ data: largeResponse, kind: "ok", status: 200 });
  });

  it("rejects an Orbit response above its explicit endpoint response budget", async () => {
    expect(ORBIT_SANDBOX_MAX_RESPONSE_BYTES).toBeGreaterThan(MAX_RESPONSE_BYTES);
    const result = await requestEndpoint("http://127.0.0.1:8000", orbitSandboxEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response("{}", {
            headers: {
              "content-length": String(ORBIT_SANDBOX_MAX_RESPONSE_BYTES + 1),
              "content-type": "application/json",
            },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ kind: "malformed-response" });
  });

  it("rejects additive orbital result fields", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", orbitSandboxEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...response, unexpected: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ kind: "malformed-response" });
  });
});

describe("Seasons Simulator endpoint", () => {
  const response = {
    model_version: "seasons-simulator-v1",
    schema_version: 1,
    inputs: {
      axial_tilt_deg: 23.43928,
      orbital_position_deg: 90,
      latitude_deg: 40,
      eccentricity_preset: "earth" as const,
    },
    solar_declination_deg: 23.43928,
    selected: {
      latitude_deg: 40,
      noon_solar_zenith_deg: 16.56072,
      noon_sun_altitude_deg: 73.43928,
      illumination_incidence_deg: 16.56072,
      day_length_hours: 14.8444511275,
      polar_state: "none" as const,
    },
    comparison_latitude_deg: -40,
    opposite_hemisphere: {
      latitude_deg: -40,
      noon_solar_zenith_deg: 63.43928,
      noon_sun_altitude_deg: 26.56072,
      illumination_incidence_deg: 63.43928,
      day_length_hours: 9.1555488725,
      polar_state: "none" as const,
    },
    eccentricity: 0.01671123,
    distance_over_semimajor_axis: 1.0162727707813541,
    relative_solar_flux: 0.9682319752100141,
  };

  it("accepts the exact generated result shape through the transport boundary", async () => {
    const result = await requestEndpoint(
      "http://127.0.0.1:8000",
      {
        ...seasonsSimulatorEndpoint,
        path: `${seasonsSimulatorEndpoint.path}?axial_tilt_deg=23.43928&orbital_position_deg=90&latitude_deg=40&eccentricity_preset=earth`,
      },
      {
        fetchImplementation: () =>
          Promise.resolve(
            new Response(JSON.stringify(response), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          ),
      },
    );

    expect(result).toEqual({ data: response, kind: "ok", status: 200 });
  });

  it("rejects additive fields in a scientific result", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", seasonsSimulatorEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...response, unexpected: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });

    expect(result).toEqual({ kind: "malformed-response" });
  });
});

describe("Telescope Builder endpoint", () => {
  const response = {
    model_version: "telescope-builder-v1",
    schema_version: 1,
    inputs: {
      aperture_mm: 100,
      telescope_focal_length_mm: 1000,
      telescope_type: "refractor" as const,
      eyepiece_focal_length_mm: 20,
      eyepiece_apparent_field_deg: 50,
      optical_modifier_kind: "none" as const,
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
    target_fit: "fits" as const,
    warning_codes: [],
  };

  it("binds the read-only operation to its generated URL and exact result", async () => {
    expect(telescopeBuilderEndpoint.method).toBe("GET");
    expectTypeOf(telescopeBuilderEndpoint.path).toEqualTypeOf<
      CalculateTelescopeBuilderData["url"]
    >();

    const result = await requestEndpoint(
      "http://127.0.0.1:8000",
      { ...telescopeBuilderEndpoint, path: `${telescopeBuilderEndpoint.path}?aperture_mm=100` },
      {
        fetchImplementation: () =>
          Promise.resolve(
            new Response(JSON.stringify(response), {
              headers: { "content-type": "application/json" },
              status: 200,
            }),
          ),
      },
    );

    expect(result).toEqual({ data: response, kind: "ok", status: 200 });
  });

  it("rejects additive optical result fields at the transport boundary", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", telescopeBuilderEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...response, unexpected: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });

    expect(result).toEqual({ kind: "malformed-response" });
  });
});

describe("Radial Velocity endpoint", () => {
  const response = {
    model_version: "radial-velocity-v1",
    schema_version: 1,
    inputs: {
      stellar_mass_kg: 2e30,
      planet_mass_kg: 2e27,
      orbital_period_s: 31_557_600,
      eccentricity: 0,
      inclination_deg: 90,
      stellar_argument_of_periastron_deg: 0,
      mean_anomaly_at_epoch_deg: 0,
    },
    inclination_projection: 1,
    semi_amplitude_m_s: 28.348,
    projected_planet_mass_kg: 2e27,
    mass_function_kg: 1.996e21,
    edge_on_minimum_mass_kg: 2e27,
    curve: [
      {
        time_s: 0,
        orbital_phase: 0,
        radial_velocity_m_s: 28.348,
      },
    ],
  };

  it("binds the generated URL and accepts the exact scientific result shape", async () => {
    expectTypeOf(radialVelocityEndpoint.path).toEqualTypeOf<CalculateRadialVelocityData["url"]>();
    const result = await requestEndpoint("http://127.0.0.1:8000", radialVelocityEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ data: response, kind: "ok", status: 200 });
  });

  it("rejects additive Radial Velocity result fields", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", radialVelocityEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...response, unexpected: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ kind: "malformed-response" });
  });
});

describe("Stellar Laboratory endpoint", () => {
  const response = {
    model_version: "stellar-laboratory-v1",
    schema_version: 1,
    inputs: {
      initial_mass_msun: 1,
    },
    luminosity_lsun: 0.984,
    radius_rsun: 0.992,
    effective_temperature_k: 5760,
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

  it("binds the generated URL and accepts the exact approximate-model result shape", async () => {
    expectTypeOf(stellarLaboratoryEndpoint.path).toEqualTypeOf<
      CalculateStellarLaboratoryData["url"]
    >();
    const result = await requestEndpoint("http://127.0.0.1:8000", stellarLaboratoryEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ data: response, kind: "ok", status: 200 });
  });

  it("rejects additive Stellar Laboratory result fields", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", stellarLaboratoryEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...response, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ kind: "malformed-response" });
  });
});

describe("Transit Method endpoint", () => {
  const response = {
    model_version: "transit-method-v1",
    schema_version: 1,
    inputs: {
      stellar_radius_m: 1_000_000_000,
      planet_radius_m: 100_000_000,
      semi_major_axis_m: 10_000_000_000,
      orbital_period_s: 259_200,
      inclination_deg: 90,
    },
    radius_ratio: 0.1,
    scaled_semi_major_axis: 10,
    impact_parameter: 0,
    classification: "full" as const,
    central_depth_approximation_fraction: 0.01,
    maximum_depth_fraction: 0.01,
    maximum_depth_ppm: 10_000,
    total_duration_s: 9_101.350775122473,
    full_duration_s: 7_438.113097713966,
    light_curve: [
      {
        time_from_mid_transit_s: 0,
        orbital_phase: 0,
        projected_separation_stellar_radii: 0,
        relative_flux: 0.99,
      },
    ],
  };

  it("binds the generated URL and accepts the exact scientific result shape", async () => {
    expectTypeOf(transitMethodEndpoint.path).toEqualTypeOf<CalculateTransitMethodData["url"]>();
    const result = await requestEndpoint("http://127.0.0.1:8000", transitMethodEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ data: response, kind: "ok", status: 200 });
  });

  it("rejects additive Transit result fields", async () => {
    const result = await requestEndpoint("http://127.0.0.1:8000", transitMethodEndpoint, {
      fetchImplementation: () =>
        Promise.resolve(
          new Response(JSON.stringify({ ...response, unexpected: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
    });
    expect(result).toEqual({ kind: "malformed-response" });
  });
});
