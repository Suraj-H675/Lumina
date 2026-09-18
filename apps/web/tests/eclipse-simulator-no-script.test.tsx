import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EclipseSimulatorNoScript } from "../src/components/eclipse-simulator-no-script";
import { DEFAULT_ECLIPSE_SIMULATOR_STATE } from "../src/lib/simulations/eclipse-simulator";
import { ECLIPSE_DALLAS_TOTAL_RESULT } from "./eclipse-simulator-fixture";

describe("EclipseSimulatorNoScript", () => {
  it("keeps safety, canonical geometry, timing caveat, and provenance visible", () => {
    const markup = renderToStaticMarkup(
      <EclipseSimulatorNoScript
        initialCalculation={ECLIPSE_DALLAS_TOTAL_RESULT}
        initialState={DEFAULT_ECLIPSE_SIMULATOR_STATE}
        initialStateInvalid={false}
      />,
    );
    expect(markup).toContain("Solar-viewing safety");
    expect(markup).toContain("NASA");
    expect(markup).toContain("eclipse-simulator-v1");
    expect(markup).toContain("umbra");
    expect(markup).toContain("whole UTC minutes");
    expect(markup).toContain("not monthly");
    expect(markup).toContain("ERFA");
  });

  it("shows invalid-share and unavailable states without fabricating geometry", () => {
    const markup = renderToStaticMarkup(
      <EclipseSimulatorNoScript
        initialCalculation={null}
        initialState={DEFAULT_ECLIPSE_SIMULATOR_STATE}
        initialStateInvalid
      />,
    );
    expect(markup).toContain("Solar-viewing safety");
    expect(markup).toContain("Shared eclipse state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).not.toContain("Geometric Solar-disk obscuration");
  });
});
