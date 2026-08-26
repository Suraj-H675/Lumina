import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import type { CompareModel } from "../src/lib/compare-model";
import { buildCompareModel } from "../src/lib/compare-model";
import { CompareView } from "../src/components/compare-view";
import { fixtureDetail } from "./support/compare-fixtures";

afterEach(() => {
  pushMock.mockReset();
});

function twoObjectModel(): CompareModel {
  return buildCompareModel([
    { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
    { detail: fixtureDetail.kepler452, kind: "ok", slug: "kepler-452" },
  ]);
}

describe("CompareView", () => {
  it("renders the empty state with the add-object control", () => {
    render(<CompareView model={buildCompareModel([])} selectedSlugs={[]} />);
    expect(screen.getByRole("heading", { name: "Nothing selected yet" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: /add an object to compare/i })).toBeEnabled();
  });

  it("shows the one-object partial state inviting another object", () => {
    const model = buildCompareModel([{ detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" }]);
    render(<CompareView model={model} selectedSlugs={["k2-18"]} />);

    // A polite live region invites adding another object.
    expect(
      screen
        .getAllByRole("status")
        .map((region) => region.textContent)
        .join(" "),
    ).toMatch(/add one more object/i);
    // The single measured quantity still renders as a row.
    expect(screen.getAllByText(/Gaia G-band mean magnitude/i).length).toBeGreaterThan(0);
  });

  it("renders the desktop matrix with provenance per value", () => {
    render(<CompareView model={twoObjectModel()} selectedSlugs={["k2-18", "kepler-452"]} />);

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3); // quantity + 2 objects
    expect(screen.getAllByRole("rowgroup").length).toBeGreaterThanOrEqual(2);

    // Values shown exactly as the display formatter renders them, units kept.
    expect(table.textContent).toContain("12.4008");
    expect(table.textContent).toContain("13.3929");
    expect(table.textContent).toContain("mag");
    // Provenance is visible for every value (3 rows x 2 objects).
    expect(table.textContent.match(/ESA Gaia Archive/gu)?.length).toBe(6);
    expect(table.textContent.match(/\(dr3\)/gu)?.length).toBe(6);
    // No winner/score language anywhere.
    expect(document.body.textContent).not.toMatch(/\b(winner|better|worse|best|score)\b/i);
  });

  it("marks missing cells as unavailable without color-only signalling", () => {
    const detail = {
      ...fixtureDetail.kepler452,
      quantities: fixtureDetail.kepler452.quantities.slice(0, 1),
    };
    const model = buildCompareModel([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { detail, kind: "ok", slug: "kepler-452" },
    ]);
    render(<CompareView model={model} selectedSlugs={["k2-18", "kepler-452"]} />);

    expect(screen.getAllByText("Not available").length).toBeGreaterThanOrEqual(2);
  });

  it("represents an unknown slot with its slug and remove control", async () => {
    const model = buildCompareModel([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { kind: "unknown", slug: "ghost-planet" },
    ]);
    render(<CompareView model={model} selectedSlugs={["k2-18", "ghost-planet"]} />);

    expect(screen.getAllByText(/ghost-planet/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("No catalogue object").length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /remove Unknown object/i }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/compare?object=k2-18");
    });
  });

  it("announces the full state at three objects instead of offering the input", () => {
    const model = buildCompareModel([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { detail: fixtureDetail.kepler452, kind: "ok", slug: "kepler-452" },
      { detail: fixtureDetail.hd209458, kind: "ok", slug: "hd-209458" },
    ]);
    render(<CompareView model={model} selectedSlugs={["k2-18", "kepler-452", "hd-209458"]} />);

    expect(screen.getByText(/comparison full — 3 objects maximum/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /add an object to compare/i })).toBeNull();
  });

  it("removes a selected object through the committed URL", async () => {
    render(<CompareView model={twoObjectModel()} selectedSlugs={["k2-18", "kepler-452"]} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Remove K2-18 from the comparison/i }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/compare?object=kepler-452");
    });
  });
});
