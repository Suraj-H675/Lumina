import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpectroscopyLabNoScript } from "../src/components/spectroscopy-lab-no-script";
import { DEFAULT_SPECTROSCOPY_STATE } from "../src/lib/simulations/spectroscopy-lab";
import { SPECTROSCOPY_DEFAULT_RESULT } from "./spectroscopy-lab-fixture";

describe("SpectroscopyLabNoScript", () => {
  it("keeps canonical spectrum metadata, caveats, and provenance visible", () => {
    const markup = renderToStaticMarkup(
      <SpectroscopyLabNoScript
        initialCalculation={SPECTROSCOPY_DEFAULT_RESULT}
        initialState={DEFAULT_SPECTROSCOPY_STATE}
        initialStateInvalid={false}
      />,
    );
    expect(markup).toContain("Spectroscopy Lab");
    expect(markup).toContain("spectroscopy-lab-v1");
    expect(markup).toContain("Wien peak");
    expect(markup).toContain("H-alpha representative");
    expect(markup).toContain("observed-vacuum");
    expect(markup).toContain("NIST Atomic Spectra Database");
    expect(markup).toContain("not a photon/read/sky/telluric");
  });

  it("shows invalid-share and unavailable states without fabricating a spectrum", () => {
    const markup = renderToStaticMarkup(
      <SpectroscopyLabNoScript
        initialCalculation={null}
        initialState={DEFAULT_SPECTROSCOPY_STATE}
        initialStateInvalid
      />,
    );
    expect(markup).toContain("Shared spectroscopy state rejected");
    expect(markup).toContain("No canonical result available");
    expect(markup).toContain("No browser-generated spectrum");
    expect(markup).not.toContain("H-alpha representative");
  });
});
