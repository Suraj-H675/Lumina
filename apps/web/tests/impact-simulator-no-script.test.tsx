import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ImpactSimulatorNoScript } from "../src/components/impact-simulator-no-script";
import { DEFAULT_IMPACT_SIMULATOR_STATE } from "../src/lib/simulations/impact-simulator";
import { IMPACT_SIMULATOR_DEFAULT_RESULT } from "./impact-simulator-fixture";

describe("ImpactSimulatorNoScript", () => {
  it("keeps canonical results, uncertainty, limitations, and provenance visible without JavaScript", () => {
    const markup = renderToStaticMarkup(
      <ImpactSimulatorNoScript
        initialCalculation={IMPACT_SIMULATOR_DEFAULT_RESULT}
        initialState={DEFAULT_IMPACT_SIMULATOR_STATE}
        initialStateInvalid={false}
      />,
    );
    expect(markup).toContain("Impact Simulator");
    expect(markup).toContain("impact-simulator-v1");
    expect(markup).toContain("20,661.64");
    expect(markup).toContain("not a complete statistical confidence interval");
    expect(markup).toContain("not an equivalent blast-damage footprint");
    expect(markup).toContain("lower-bound deposit");
    expect(markup).toContain("Collins et al. (2005) Eq. 21");
    expect(markup).toContain("Earth Impact Effects Program");
  });

  it("shows invalid-share and unavailable states without fabricating scientific results", () => {
    const markup = renderToStaticMarkup(
      <ImpactSimulatorNoScript
        initialCalculation={null}
        initialState={DEFAULT_IMPACT_SIMULATOR_STATE}
        initialStateInvalid
      />,
    );
    expect(markup).toContain("Shared impact state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).toContain("No browser-generated energy, crater diameter");
    expect(markup).not.toContain("20,661.64");
  });
});
