import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StellarLaboratoryNoScript } from "../src/components/stellar-laboratory-no-script";
import { DEFAULT_STELLAR_LABORATORY_STATE } from "../src/lib/simulations/stellar-laboratory";
import { STELLAR_LABORATORY_DEFAULT_RESULT } from "./stellar-laboratory-fixture";

describe("StellarLaboratoryNoScript", () => {
  it("renders the canonical result, model version, lifecycle caveat, limits, and sources", () => {
    const markup = renderToStaticMarkup(
      <StellarLaboratoryNoScript
        initialCalculation={STELLAR_LABORATORY_DEFAULT_RESULT}
        initialState={DEFAULT_STELLAR_LABORATORY_STATE}
        initialStateInvalid={false}
      />,
    );
    expect(markup).toContain("Stellar Laboratory");
    expect(markup).toContain("stellar-laboratory-v1");
    expect(markup).toContain("Approximate main-sequence result");
    expect(markup).toContain("carbon-oxygen white dwarf");
    expect(markup).toContain("not a stellar-evolution grid");
    expect(markup).toContain("Eker");
    expect(markup).toContain("OpenStax");
  });

  it("shows invalid-share and unavailable states without fabricating results", () => {
    const markup = renderToStaticMarkup(
      <StellarLaboratoryNoScript
        initialCalculation={null}
        initialState={DEFAULT_STELLAR_LABORATORY_STATE}
        initialStateInvalid
      />,
    );
    expect(markup).toContain("Shared stellar-laboratory state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).not.toContain("Typical main-sequence luminosity");
  });
});
