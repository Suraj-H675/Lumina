import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RocketMissionDesignerNoScript } from "../src/components/rocket-mission-designer-no-script";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { DEFAULT_ROCKET_MISSION_DESIGNER_STATE } from "../src/lib/simulations/rocket-mission-designer";
import { ROCKET_MISSION_DESIGNER_DEFAULT_RESULT } from "./rocket-mission-designer-fixture";

describe("RocketMissionDesignerNoScript", () => {
  it("keeps canonical results, caveats, and provenance visible without JavaScript", () => {
    const markup = renderToStaticMarkup(
      <RocketMissionDesignerNoScript
        initialCalculation={ROCKET_MISSION_DESIGNER_DEFAULT_RESULT}
        initialState={DEFAULT_ROCKET_MISSION_DESIGNER_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.rocketMissionDesigner}
      />,
    );
    expect(markup).toContain("Rocket / Mission Designer");
    expect(markup).toContain("rocket-mission-designer-v1");
    expect(markup).toContain("10,004.97");
    expect(markup).toContain("not a mission delta-v requirement");
    expect(markup).toContain("operational launch planning");
    expect(markup).toContain("Ideal Rocket Equation");
    expect(markup).toContain("CODATA Value: standard acceleration of gravity");
  });

  it("shows invalid-share and unavailable states without fabricating scientific results", () => {
    const markup = renderToStaticMarkup(
      <RocketMissionDesignerNoScript
        initialCalculation={null}
        initialState={DEFAULT_ROCKET_MISSION_DESIGNER_STATE}
        initialStateInvalid
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.rocketMissionDesigner}
      />,
    );
    expect(markup).toContain("Shared rocket state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).toContain("No browser-generated delta-v, staging, TWR");
    expect(markup).not.toContain("10,004.97");
  });
});
