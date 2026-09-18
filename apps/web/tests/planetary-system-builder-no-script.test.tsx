import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlanetarySystemBuilderNoScript } from "../src/components/planetary-system-builder-no-script";
import { DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE } from "../src/lib/simulations/planetary-system-builder";
import { PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT } from "./planetary-system-builder-fixture";

describe("PlanetarySystemBuilderNoScript", () => {
  it("keeps canonical results, caveats, and provenance visible without JavaScript", () => {
    const markup = renderToStaticMarkup(
      <PlanetarySystemBuilderNoScript
        initialCalculation={PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT}
        initialState={DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE}
        initialStateInvalid={false}
      />,
    );
    expect(markup).toContain("Planetary System Builder");
    expect(markup).toContain("planetary-system-builder-v1");
    expect(markup).toContain("365.2563");
    expect(markup).toContain("does not establish habitability or life");
    expect(markup).toContain("no long-term multi-planet stability claim");
    expect(markup).toContain("Habitable Zones Around Main-Sequence Stars");
  });

  it("shows invalid-share and unavailable states without fabricating scientific results", () => {
    const markup = renderToStaticMarkup(
      <PlanetarySystemBuilderNoScript
        initialCalculation={null}
        initialState={DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE}
        initialStateInvalid
      />,
    );
    expect(markup).toContain("Shared planetary-system state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).toContain("No browser-generated periods, HZ boundaries, or Hill diagnostics");
    expect(markup).not.toContain("365.2563");
  });
});
