import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RelativityVisualizationsNoScript } from "../src/components/relativity-visualizations-no-script";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { DEFAULT_RELATIVITY_VISUALIZATIONS_STATE } from "../src/lib/simulations/relativity-visualizations";
import { RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT } from "./relativity-visualizations-fixture";

describe("RelativityVisualizationsNoScript", () => {
  it("keeps canonical special-relativity lessons, frame semantics, light cones, and provenance visible without JavaScript", () => {
    const markup = renderToStaticMarkup(
      <RelativityVisualizationsNoScript
        initialCalculation={RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT}
        initialState={DEFAULT_RELATIVITY_VISUALIZATIONS_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.relativityVisualizations}
      />,
    );
    expect(markup).toContain("Relativity Visualizations");
    expect(markup).toContain("relativity-visualizations-v1");
    expect(markup).toContain("12.5");
    expect(markup).toContain("80");
    expect(markup).toContain("-0.75");
    expect(markup).toContain("not a photographic appearance");
    expect(markup).toContain("Light cones");
    expect(markup).toContain("future-left");
    expect(markup).toContain("/lab/black-hole-relativity");
    expect(markup).toContain("5.3 Time Dilation");
  });

  it("shows invalid-share and unavailable states without fabricating relativity results", () => {
    const markup = renderToStaticMarkup(
      <RelativityVisualizationsNoScript
        initialCalculation={null}
        initialState={DEFAULT_RELATIVITY_VISUALIZATIONS_STATE}
        initialStateInvalid
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.relativityVisualizations}
      />,
    );
    expect(markup).toContain("Shared relativity state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).toContain("No browser-generated Lorentz factor");
    expect(markup).not.toContain("12.5");
  });
});
