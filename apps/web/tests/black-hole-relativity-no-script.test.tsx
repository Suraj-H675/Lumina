import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlackHoleRelativityNoScript } from "../src/components/black-hole-relativity-no-script";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { DEFAULT_BLACK_HOLE_RELATIVITY_STATE } from "../src/lib/simulations/black-hole-relativity";
import { BLACK_HOLE_RELATIVITY_DEFAULT_RESULT } from "./black-hole-relativity-fixture";

describe("BlackHoleRelativityNoScript", () => {
  it("keeps canonical landmarks, static-clock semantics, equations, and provenance visible without JavaScript", () => {
    const markup = renderToStaticMarkup(
      <BlackHoleRelativityNoScript
        initialCalculation={BLACK_HOLE_RELATIVITY_DEFAULT_RESULT}
        initialState={DEFAULT_BLACK_HOLE_RELATIVITY_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.blackHoleRelativity}
      />,
    );
    expect(markup).toContain("Black-Hole / Relativity Lab");
    expect(markup).toContain("black-hole-relativity-v1");
    expect(markup).toContain("29,532.5");
    expect(markup).toContain("accelerated");
    expect(markup).toContain("not freely falling");
    expect(markup).toContain("ray tracing");
    expect(markup).toContain("R_s=2*mu/c^2");
    expect(markup).toContain("IAU 2015 Resolution B3");
  });

  it("shows invalid-share and unavailable states without fabricating relativity results", () => {
    const markup = renderToStaticMarkup(
      <BlackHoleRelativityNoScript
        initialCalculation={null}
        initialState={DEFAULT_BLACK_HOLE_RELATIVITY_STATE}
        initialStateInvalid
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.blackHoleRelativity}
      />,
    );
    expect(markup).toContain("Shared relativity state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).toContain("No browser-generated horizon, photon-sphere, ISCO");
    expect(markup).not.toContain("29,532.5");
  });
});
