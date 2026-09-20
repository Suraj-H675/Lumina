import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RadialVelocityNoScript } from "../src/components/radial-velocity-no-script";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { DEFAULT_RADIAL_VELOCITY_STATE } from "../src/lib/simulations/radial-velocity";
import { RADIAL_VELOCITY_DEFAULT_RESULT } from "./radial-velocity-fixture";

describe("RadialVelocityNoScript", () => {
  it("keeps the canonical result, minimum-mass distinction, limitations, and sources available", () => {
    const markup = renderToStaticMarkup(
      <RadialVelocityNoScript
        initialCalculation={RADIAL_VELOCITY_DEFAULT_RESULT}
        initialState={DEFAULT_RADIAL_VELOCITY_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.radialVelocity}
      />,
    );

    expect(markup).toContain("Canonical result");
    expect(markup).toContain("radial-velocity-v1");
    expect(markup).toContain("RV semi-amplitude");
    expect(markup).toContain("Projected companion mass Mp sin(i)");
    expect(markup).toContain("exact edge-on minimum mass");
    expect(markup).toContain("No stellar activity");
    expect(markup).toContain("Keplerian Orbits and Dynamics of Exoplanets");
  });

  it("reports invalid shared state and unavailable calculation without fabricating output", () => {
    const markup = renderToStaticMarkup(
      <RadialVelocityNoScript
        initialCalculation={null}
        initialState={DEFAULT_RADIAL_VELOCITY_STATE}
        initialStateInvalid
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.radialVelocity}
      />,
    );

    expect(markup).toContain("Shared radial-velocity state rejected");
    expect(markup).toContain("Calculation unavailable");
    expect(markup).toContain("No substitute or browser-generated RV curve was fabricated");
    expect(markup).not.toContain("RV semi-amplitude");
  });
});
