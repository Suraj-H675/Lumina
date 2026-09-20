import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createSystemScaleCompareMetadata } from "../src/app/explore/system-compare/route-page";
import { SystemScaleCompareExplorer } from "../src/app/explore/system-compare/system-scale-compare-explorer";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { SystemScaleCompareMessages } from "../src/lib/i18n/messages/types";

function renderExplorer(
  messages: SystemScaleCompareMessages["explorer"] = enMessages.explore.systemScaleCompare.explorer,
) {
  return render(<SystemScaleCompareExplorer locale={DEFAULT_LOCALE} messages={messages} />);
}

describe("Phase 5B System Scale Compare", () => {
  it("renders three distinct default definitions without ranking them", async () => {
    const { container } = renderExplorer();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /Three AU-valued references, three different scientific meanings/i,
      }),
    ).toBeVisible();
    expect(screen.getByText(/does not make mean Sun distance/i)).toBeVisible();
    expect(screen.getByRole("region", { name: "Earth shared scale reference" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Kepler-452 b shared scale reference" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Voyager 1 · 2026 shared scale reference" }),
    ).toBeVisible();
    expect(screen.queryByText(/winner|best|score/i)).not.toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("switches category-specific references and the shared display scale", async () => {
    renderExplorer();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Solar System reference"), "solar:neptune");
    await user.selectOptions(
      screen.getByLabelText("Exoplanet orbital reference"),
      "exoplanet:51-peg-b",
    );
    await user.selectOptions(screen.getByLabelText("Voyager annual reference"), "voyager:1977");
    await user.click(screen.getByRole("button", { name: "Linear AU scale" }));

    expect(screen.getByRole("button", { name: "Linear AU scale" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("region", { name: "Neptune shared scale reference" })).toBeVisible();
    expect(screen.getByRole("region", { name: "51 Peg b shared scale reference" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Voyager 1 · 1977 shared scale reference" }),
    ).toBeVisible();
    const voyagerCard = screen.getByRole("article", { name: "Voyager 1 · 1977" });
    expect(within(voyagerCard).getByText(/Heliocentric position-vector magnitude/i)).toBeVisible();
    expect(within(voyagerCard).getByText(/1977-Sep-06/i)).toBeVisible();
  });

  it("localizes comparison chrome without rewriting reviewed reference science", () => {
    const messages: SystemScaleCompareMessages["explorer"] = {
      ...enMessages.explore.systemScaleCompare.explorer,
      card: {
        ...enMessages.explore.systemScaleCompare.explorer.card,
        quantityLabel: "Fixture quantity",
      },
      laneAriaLabel: "Fixture lane for {name}",
      selectedDefinitionsTitle: "Fixture selected definitions",
      title: "Fixture three {unit} references",
    };

    renderExplorer(messages);

    expect(
      screen.getByRole("heading", { level: 2, name: "Fixture three AU references" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Fixture lane for Earth" })).toBeVisible();
    expect(screen.getAllByText("Fixture quantity")).toHaveLength(3);
    expect(screen.getAllByText("Mean distance from the Sun", { exact: true })).toHaveLength(2);
    expect(screen.getAllByText("Earth", { exact: true })).toHaveLength(2);
  });

  it("creates localized metadata without changing the canonical route", () => {
    const messages: SystemScaleCompareMessages = {
      ...enMessages.explore.systemScaleCompare,
      metadataDescription: "Fixture comparison metadata.",
      metadataTitle: "Fixture comparison title",
    };

    expect(createSystemScaleCompareMetadata(messages)).toEqual({
      alternates: { canonical: "/explore/system-compare" },
      description: "Fixture comparison metadata.",
      title: "Fixture comparison title",
    });
  });
});
