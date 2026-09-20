import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import type { CompareModel } from "../src/lib/compare-model";
import { buildCompareModel } from "../src/lib/compare-model";
import { collectionSaveMessageSlice } from "../src/lib/collections-messages";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { CompareView } from "../src/components/compare-view";
import { fixtureDetail } from "./support/compare-fixtures";

const SAVE_MESSAGES = collectionSaveMessageSlice(enMessages.collections);
const DEFAULT_COMPARE_PROPS = {
  collectionSaveMessages: SAVE_MESSAGES,
  entityTypeMessages: enMessages.entityTypes,
  locale: DEFAULT_LOCALE,
  messages: enMessages.compare,
} as const;

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
    render(
      <CompareView {...DEFAULT_COMPARE_PROPS} model={buildCompareModel([])} selectedSlugs={[]} />,
    );
    expect(screen.getByRole("heading", { name: "Nothing selected yet" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: /add an object to compare/i })).toBeEnabled();
  });

  it("shows the one-object partial state inviting another object", () => {
    const model = buildCompareModel([{ detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" }]);
    render(<CompareView {...DEFAULT_COMPARE_PROPS} model={model} selectedSlugs={["k2-18"]} />);

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
    render(
      <CompareView
        {...DEFAULT_COMPARE_PROPS}
        model={twoObjectModel()}
        selectedSlugs={["k2-18", "kepler-452"]}
      />,
    );

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

  it("localizes Compare chrome without rewriting catalogue science, identity, or URLs", async () => {
    const messages = {
      ...enMessages.compare,
      cells: {
        ...enMessages.compare.cells,
        measurementDetails: {
          one: "Fixture source {sourceLabel}",
          multiple: "Fixture {count} sources {sourceLabel}",
        },
        original: "Fixture original {originalValue} {originalUnit}",
      },
      comparison: {
        ...enMessages.compare.comparison,
        heading: "Fixture scientific comparison",
        identityHeading: "Fixture identity",
      },
      removeAction: "Fixture remove {displayName}",
      selection: {
        ...enMessages.compare.selection,
        ariaLabel: "Fixture selected objects",
      },
    };
    const entityTypes = {
      ...enMessages.entityTypes,
      star: "Fixture star",
    };

    render(
      <CompareView
        {...DEFAULT_COMPARE_PROPS}
        entityTypeMessages={entityTypes}
        messages={messages}
        model={twoObjectModel()}
        selectedSlugs={["k2-18", "kepler-452"]}
      />,
    );

    expect(screen.getByRole("list", { name: "Fixture selected objects" })).toBeVisible();
    expect(screen.getAllByText("Fixture star").length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: "K2-18" })) {
      expect(link).toHaveAttribute("href", "/objects/k2-18");
    }
    for (const link of screen.getAllByRole("link", { name: "Kepler-452" })) {
      expect(link).toHaveAttribute("href", "/objects/kepler-452");
    }
    expect(screen.getByRole("heading", { name: "Fixture identity" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fixture scientific comparison" })).toBeVisible();
    expect(
      screen.getAllByText(/Gaia G-band mean magnitude \(Vega scale\)/u).length,
    ).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("12.4008");
    expect(document.body.textContent).toContain("13.3929");
    expect(document.body.textContent).toContain("mag");
    expect(document.body.textContent).toContain(
      "ESA Gaia Archive · Gaia Data Release 3 main source catalogue (dr3)",
    );
    expect(document.body.textContent).toContain("Fixture original 12.400764 mag");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Fixture remove K2-18" }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/compare?object=kepler-452");
    });
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
    render(
      <CompareView
        {...DEFAULT_COMPARE_PROPS}
        model={model}
        selectedSlugs={["k2-18", "kepler-452"]}
      />,
    );

    expect(screen.getAllByText("Not available").length).toBeGreaterThanOrEqual(2);
  });

  it("represents an unknown slot with its slug and remove control", async () => {
    const model = buildCompareModel([
      { detail: fixtureDetail.k2_18, kind: "ok", slug: "k2-18" },
      { kind: "unknown", slug: "ghost-planet" },
    ]);
    render(
      <CompareView
        {...DEFAULT_COMPARE_PROPS}
        model={model}
        selectedSlugs={["k2-18", "ghost-planet"]}
      />,
    );

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
    render(
      <CompareView
        {...DEFAULT_COMPARE_PROPS}
        model={model}
        selectedSlugs={["k2-18", "kepler-452", "hd-209458"]}
      />,
    );

    expect(screen.getByText(/comparison full — 3 objects maximum/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /add an object to compare/i })).toBeNull();
  });

  it("removes a selected object through the committed URL", async () => {
    render(
      <CompareView
        {...DEFAULT_COMPARE_PROPS}
        model={twoObjectModel()}
        selectedSlugs={["k2-18", "kepler-452"]}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Remove K2-18 from the comparison/i }));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/compare?object=kepler-452");
    });
  });
});
