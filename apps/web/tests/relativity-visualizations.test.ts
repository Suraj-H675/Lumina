import { describe, expect, it } from "vitest";

import rawRelativityArtifact from "../../../data/seed/relativity-visualizations-v1.json";
import {
  DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
  RELATIVITY_LIGHT_CONE,
  RelativityVisualizationsArtifactValidationError,
  decodeRelativityVisualizationsState,
  encodeRelativityVisualizationsState,
  relativityVisualizationsRequestEndpoint,
  validateRelativityVisualizationsArtifact,
  validateRelativityVisualizationsCalculationResult,
  validateRelativityVisualizationsState,
} from "../src/lib/simulations/relativity-visualizations";
import { RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT } from "./relativity-visualizations-fixture";

describe("Relativity Visualizations browser contract", () => {
  it("round-trips only the exact canonical ordered share state", () => {
    const encoded = encodeRelativityVisualizationsState(DEFAULT_RELATIVITY_VISUALIZATIONS_STATE);
    expect(decodeRelativityVisualizationsState(encoded)).toEqual(
      DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
    );
    expect(decodeRelativityVisualizationsState(`${encoded} `)).toBeNull();
    expect(
      validateRelativityVisualizationsState({
        ...DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects out-of-domain state without normalizing", () => {
    expect(
      validateRelativityVisualizationsState({
        ...DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
        relative_speed_fraction_c: 1,
      }),
    ).toBeNull();
    expect(
      validateRelativityVisualizationsState({
        ...DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
        proper_time_s: 0,
      }),
    ).toBeNull();
    expect(
      validateRelativityVisualizationsState({
        ...DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
        simultaneous_event_separation_m: -1,
      }),
    ).toBeNull();
  });

  it("builds the exact GET query and accepts only the exact echoed canonical result", () => {
    const endpoint = relativityVisualizationsRequestEndpoint(
      DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
    );
    const url = new URL(endpoint.path, "http://localhost");
    expect(url.pathname).toBe("/api/v1/simulations/relativity-visualizations");
    expect(Object.fromEntries(url.searchParams.entries())).toEqual({
      relative_speed_fraction_c: "0.6",
      proper_time_s: "10",
      proper_length_m: "100",
      simultaneous_event_separation_m: "299792458",
    });
    expect(
      validateRelativityVisualizationsCalculationResult(
        DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
        RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT,
      ),
    ).toEqual(RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT);
    expect(
      validateRelativityVisualizationsCalculationResult(DEFAULT_RELATIVITY_VISUALIZATIONS_STATE, {
        ...RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT,
        invented: true,
      }),
    ).toBeNull();
  });

  it("rejects result/state echo mismatch without recalculating special relativity", () => {
    expect(
      validateRelativityVisualizationsCalculationResult(
        {
          ...DEFAULT_RELATIVITY_VISUALIZATIONS_STATE,
          relative_speed_fraction_c: 0.8,
        },
        RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT,
      ),
    ).toBeNull();
  });

  it("takes the light-cone geometry from the reviewed artifact", () => {
    expect(RELATIVITY_LIGHT_CONE.segments.map((segment) => segment.id)).toEqual([
      "future-left",
      "future-right",
      "past-left",
      "past-right",
    ]);
    expect(RELATIVITY_LIGHT_CONE.coordinate_system).toContain("c=1");
  });

  it("fails closed if a reviewed source or fixed light-cone segment drifts", () => {
    const sourceMutation = structuredClone(rawRelativityArtifact);
    sourceMutation.sources[0]!.id = "invented-source";
    expect(() => validateRelativityVisualizationsArtifact(sourceMutation)).toThrow(
      RelativityVisualizationsArtifactValidationError,
    );

    const coneMutation = structuredClone(rawRelativityArtifact);
    coneMutation.light_cone.segments[0]!.x1 = -0.9;
    expect(() => validateRelativityVisualizationsArtifact(coneMutation)).toThrow(
      RelativityVisualizationsArtifactValidationError,
    );
  });
});
