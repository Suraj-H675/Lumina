import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TransitMethodNoScript } from "../src/components/transit-method-no-script";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { DEFAULT_TRANSIT_METHOD_STATE } from "../src/lib/simulations/transit-method";
import { TRANSIT_DEFAULT_RESULT } from "./transit-method-fixture";

describe("TransitMethodNoScript", () => {
  it("keeps the canonical result, equations, limitations, and reviewed sources available", () => {
    const markup = renderToStaticMarkup(
      <TransitMethodNoScript
        initialCalculation={TRANSIT_DEFAULT_RESULT}
        initialState={DEFAULT_TRANSIT_METHOD_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.transitMethod}
      />,
    );

    expect(markup).toContain("Canonical result");
    expect(markup).toContain("Phase 7 / Transit Method Lab");
    expect(markup).toContain("transit-method-v1");
    expect(markup).toContain("Alignment classification");
    expect(markup).toContain("Radius ratio");
    expect(markup).toContain("Scaled semi-major axis");
    expect(markup).toContain("Maximum uniform-source depth");
    expect(markup).toContain("Full transit");
    expect(markup).toContain("projected separation circular");
    expect(markup).toContain("No limb darkening");
    expect(markup).toContain("Analytic Lightcurves for Planetary Transit Searches");
  });

  it("reports invalid shared state and unavailable calculation without fabricating output", () => {
    const markup = renderToStaticMarkup(
      <TransitMethodNoScript
        initialCalculation={null}
        initialState={DEFAULT_TRANSIT_METHOD_STATE}
        initialStateInvalid
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.transitMethod}
      />,
    );

    expect(markup).toContain("Shared transit state rejected");
    expect(markup).toContain("Calculation unavailable");
    expect(markup).toContain("No substitute or browser-generated light curve was fabricated");
    expect(markup).not.toContain("Maximum uniform-source depth");
  });
});
