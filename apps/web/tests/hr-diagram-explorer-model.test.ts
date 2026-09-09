import { describe, expect, it } from "vitest";

import {
  DEFAULT_HR_DIAGRAM_STATE,
  HR_DIAGRAM_RECORDS,
  HR_DIAGRAM_SOURCES,
  HR_DIAGRAM_VALIDATION_FIXTURES,
  cmdColourXFraction,
  cmdMagnitudeYFraction,
  decodeHRDiagramState,
  displayUncertainty,
  encodeHRDiagramState,
  filterHRDiagramRecords,
  physicalLuminosityYFraction,
  physicalTemperatureXFraction,
  selectedHRDiagramRecord,
  validateHRDiagramState,
} from "../src/lib/simulations/hr-diagram-explorer";

describe("H-R Diagram Explorer reviewed artifact and state", () => {
  it("keeps the exact curated population and source-backed count fixtures", () => {
    expect(HR_DIAGRAM_RECORDS).toHaveLength(128);
    expect(new Set(HR_DIAGRAM_RECORDS.map((record) => record.star_id)).size).toBe(128);

    expect(
      Object.fromEntries(
        ["pleiades", "hyades", "praesepe", "m67"].map((cluster) => [
          cluster,
          HR_DIAGRAM_RECORDS.filter((record) => record.cluster === cluster).length,
        ]),
      ),
    ).toEqual({ pleiades: 32, hyades: 32, praesepe: 32, m67: 32 });
    expect(
      Object.fromEntries(
        ["main_sequence", "turnoff_transition", "red_giant_branch"].map((stage) => [
          stage,
          HR_DIAGRAM_RECORDS.filter((record) => record.stage_group === stage).length,
        ]),
      ),
    ).toEqual({ main_sequence: 78, turnoff_transition: 39, red_giant_branch: 11 });
    expect(
      Object.fromEntries(
        ["O", "B", "A", "F", "G", "K", "M"].map((spectralClass) => [
          spectralClass,
          HR_DIAGRAM_RECORDS.filter((record) => record.spectral_class === spectralClass).length,
        ]),
      ),
    ).toEqual({ O: 0, B: 6, A: 16, F: 21, G: 31, K: 36, M: 18 });
    expect(HR_DIAGRAM_VALIDATION_FIXTURES.fingerprint).toBe(
      "sha256:3d1f2a32cee1f834bdd5c9f07162884789096385323a36bb3712a1f52659be9f",
    );
    expect(selectedHRDiagramRecord(DEFAULT_HR_DIAGRAM_STATE).star_id).toBe(
      "gaia-dr3-598546371788334080",
    );
  });

  it("binds every reviewed source identity to its checked-in title and URL", () => {
    expect(HR_DIAGRAM_SOURCES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gaia-dr3-main-source-catalogue",
          title: "20.1.1 gaia_source",
          url: "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html",
        }),
        expect.objectContaining({
          id: "gaia-dr3-astrophysical-parameters",
          title: "20.2.1 astrophysical_parameters",
          url: "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_astrophysical_parameter_tables/ssec_dm_astrophysical_parameters.html",
        }),
        expect.objectContaining({
          id: "hunt-reffert-2024-vizier-members",
          title: "Improving the open cluster census. III. : J/A+A/686/A42",
          url: "https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A%2BA/686/A42",
        }),
      ]),
    );
  });

  it("applies the frozen axis transforms only at their display-domain endpoints", () => {
    expect(physicalTemperatureXFraction(50000)).toBe(0);
    expect(physicalTemperatureXFraction(2500)).toBe(1);
    expect(physicalLuminosityYFraction(1e5)).toBe(0);
    expect(physicalLuminosityYFraction(1e-3)).toBe(1);
    expect(cmdColourXFraction(-0.5)).toBe(0);
    expect(cmdColourXFraction(4)).toBe(1);
    expect(cmdMagnitudeYFraction(-5)).toBe(0);
    expect(cmdMagnitudeYFraction(15)).toBe(1);

    const selected = selectedHRDiagramRecord(DEFAULT_HR_DIAGRAM_STATE);
    const physicalUncertainty = displayUncertainty(selected, "physical_hr");
    const cmdUncertainty = displayUncertainty(selected, "gaia_cmd");
    expect(physicalUncertainty.x).not.toBeNull();
    expect(physicalUncertainty.y[0]).toBeGreaterThan(physicalUncertainty.y[1]);
    expect(cmdUncertainty.x).toBeNull();
    expect(cmdUncertainty.y[0]).toBeLessThan(cmdUncertainty.y[1]);
  });

  it("preserves the frozen logarithmic and linear interior transforms", () => {
    expect(physicalTemperatureXFraction(10000)).toBeCloseTo(0.5372435736804816, 12);
    expect(physicalLuminosityYFraction(10)).toBeCloseTo(0.5, 12);
    expect(cmdColourXFraction(1.25)).toBeCloseTo(0.3888888888888889, 12);
    expect(cmdMagnitudeYFraction(0)).toBeCloseTo(0.25, 12);
  });

  it("preserves the same selected records when the alternate view changes", () => {
    const cmdState = { ...DEFAULT_HR_DIAGRAM_STATE, view: "gaia_cmd" as const };
    expect(filterHRDiagramRecords(cmdState).map((record) => record.star_id)).toEqual(
      filterHRDiagramRecords(DEFAULT_HR_DIAGRAM_STATE).map((record) => record.star_id),
    );
    expect(selectedHRDiagramRecord(cmdState).star_id).toBe(
      DEFAULT_HR_DIAGRAM_STATE.selected_star_id,
    );
  });

  it("implements OR-within and AND-across filter semantics, including empty dimensions", () => {
    const filtered = filterHRDiagramRecords({
      ...DEFAULT_HR_DIAGRAM_STATE,
      spectral_classes: ["F", "G"],
      stage_groups: ["main_sequence"],
      clusters: ["hyades", "praesepe"],
    });
    expect(filtered.every((record) => ["F", "G"].includes(record.spectral_class))).toBe(true);
    expect(filtered.every((record) => record.stage_group === "main_sequence")).toBe(true);
    expect(filtered.every((record) => ["hyades", "praesepe"].includes(record.cluster))).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filterHRDiagramRecords({ ...DEFAULT_HR_DIAGRAM_STATE, clusters: [] })).toHaveLength(0);
  });

  it("round-trips canonical share state and rejects malformed, extra, duplicate, and non-canonical state", () => {
    const encoded = encodeHRDiagramState(DEFAULT_HR_DIAGRAM_STATE);
    expect(decodeHRDiagramState(encoded)).toEqual(DEFAULT_HR_DIAGRAM_STATE);
    expect(decodeHRDiagramState(`${encoded.slice(0, -1)},"extra":true}`)).toBeNull();
    expect(
      decodeHRDiagramState(
        encoded.replace('"view":"physical_hr"', '"view":"gaia_cmd","view":"physical_hr"'),
      ),
    ).toBeNull();
    expect(
      validateHRDiagramState({ ...DEFAULT_HR_DIAGRAM_STATE, spectral_classes: ["G", "F"] }),
    ).toBe(false);
    expect(decodeHRDiagramState("not-json")).toBeNull();
  });
});
