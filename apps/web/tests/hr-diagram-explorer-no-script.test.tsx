import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HRDiagramExplorerNoScript } from "../src/components/hr-diagram-explorer-no-script";
import {
  DEFAULT_HR_DIAGRAM_STATE,
  type HRDiagramState,
} from "../src/lib/simulations/hr-diagram-explorer";

describe("HRDiagramExplorerNoScript", () => {
  it("renders the complete default dataset, selected detail, axes, and provenance", () => {
    const markup = renderToStaticMarkup(
      <HRDiagramExplorerNoScript
        initialState={DEFAULT_HR_DIAGRAM_STATE}
        initialStateInvalid={false}
      />,
    );
    const tableBody = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";

    expect((tableBody.match(/<tr/g) ?? []).length).toBe(128);
    expect(markup).toContain("Physical H-R view");
    expect(markup).toContain("Effective temperature, T_eff");
    expect(markup).toContain("Gaia BP−RP");
    expect(markup).toContain("gaia-dr3-598546371788334080");
    expect(markup).toContain("Gaia Data Release 3 Documentation release 1.3");
    expect(markup).toContain("does not convert BP−RP to temperature");
  });

  it("renders serialized filters and alternate view without recomputing scientific values", () => {
    const state: HRDiagramState = {
      ...DEFAULT_HR_DIAGRAM_STATE,
      view: "gaia_cmd",
      clusters: ["m67"],
      spectral_classes: ["G"],
      stage_groups: ["main_sequence"],
    };
    const markup = renderToStaticMarkup(
      <HRDiagramExplorerNoScript initialState={state} initialStateInvalid={false} />,
    );
    const tableBody = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";

    expect((tableBody.match(/<tr/g) ?? []).length).toBe(4);
    expect(markup).toContain("Gaia colour–magnitude view");
    expect(markup).toContain("M 67");
    expect(markup).toContain("BP−RP");
    expect(markup).not.toContain("Effective temperature, T_eff (K)");
  });

  it("reports invalid shared state without pretending it decoded successfully", () => {
    const markup = renderToStaticMarkup(
      <HRDiagramExplorerNoScript initialState={DEFAULT_HR_DIAGRAM_STATE} initialStateInvalid />,
    );

    expect(markup).toContain("The shared H-R Diagram Explorer state was not valid");
    expect(markup).toContain("Reset to the default explorer state");
    expect(markup).toContain("128 of 128 curated stars");
  });
});
