import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScaleExplorerNoScript } from "../src/components/scale-explorer-no-script";
import {
  DEFAULT_SCALE_EXPLORER_STATE,
  buildScaleExplorerModel,
} from "../src/lib/simulations/scale-explorer";

describe("ScaleExplorerNoScript", () => {
  it("renders every reviewed node with its quantities and normalized logarithmic position", () => {
    const markup = renderToStaticMarkup(
      <ScaleExplorerNoScript
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={false}
      />,
    );
    const model = buildScaleExplorerModel(DEFAULT_SCALE_EXPLORER_STATE);
    const tableBody = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";

    expect((tableBody.match(/<tr>/g) ?? []).length).toBe(12);
    for (const entry of model.nodes) {
      expect(tableBody).toContain(entry.node.name);
      expect(tableBody).toContain(
        `normalized logarithmic display position: ${entry.position_percent.toFixed(1)}%`,
      );
    }
    expect(tableBody).toContain("characteristic diameter");
    expect(tableBody).toContain("source radius");
    expect(markup).toContain("The log coordinate is dimensionless, not a physical location.");
  });

  it("renders one truthful malformed-state warning without duplicating the data alternative", () => {
    const markup = renderToStaticMarkup(
      <ScaleExplorerNoScript
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={true}
      />,
    );
    const tableBody = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";

    expect((markup.match(/role="alert"/g) ?? []).length).toBe(1);
    expect((markup.match(/<table>/g) ?? []).length).toBe(1);
    expect((tableBody.match(/<tr>/g) ?? []).length).toBe(12);
    expect(markup).not.toContain("Loading interactive controls");
  });
});
