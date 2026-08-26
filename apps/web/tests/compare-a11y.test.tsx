import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { buildCompareModel } from "../src/lib/compare-model";
import { CompareView } from "../src/components/compare-view";
import { fixtureDetail } from "./support/compare-fixtures";

describe("CompareView accessibility", () => {
  it("passes an axe scan with a loaded two-object comparison", async () => {
    const model = buildCompareModel([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { detail: fixtureDetail.kepler452, kind: "ok", slug: "kepler-452" },
    ]);
    const { container } = render(
      <CompareView model={model} selectedSlugs={["k2-18", "kepler-452"]} />,
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it("passes an axe scan in the empty state", async () => {
    const { container } = render(<CompareView model={buildCompareModel([])} selectedSlugs={[]} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
