import { describe, expect, it } from "vitest";
import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SolarSystemDistanceExplorer } from "../src/app/explore/solar-system/solar-system-distance-explorer";
import { createSolarSystemDistanceMetadata } from "../src/app/explore/solar-system/route-page";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { SolarSystemDistanceMessages } from "../src/lib/i18n/messages/types";

function renderExplorer(
  messages: SolarSystemDistanceMessages["explorer"] = enMessages.explore.solarSystemDistance
    .explorer,
) {
  return render(<SolarSystemDistanceExplorer locale={DEFAULT_LOCALE} messages={messages} />);
}

describe("Phase 5B Solar System Distance Explorer", () => {
  it("renders the reviewed log-distance model accessibly without implying a current snapshot", async () => {
    const { container } = renderExplorer();

    expect(
      screen.getByRole("heading", { level: 2, name: "Mean distance from the Sun" }),
    ).toBeVisible();
    expect(screen.getByText(/not a live Solar System snapshot/i)).toBeVisible();
    expect(screen.getByText(/Marker sizes are uniform/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Log distance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const earthRegion = screen.getByRole("region", { name: "Earth" });
    expect(within(earthRegion).getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    expect(within(earthRegion).getByText("1 AU", { exact: true })).toBeVisible();
    expect(
      within(earthRegion).getByRole("link", { name: /Compare Earth's characteristic size/i }),
    ).toHaveAttribute("href", "/lab/scale-explorer/earth");
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("switches only between precomputed log and linear positions", async () => {
    renderExplorer();
    const user = userEvent.setup();

    expect(screen.getByText(/^0\.387 AU · 0\.00% of this log track$/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Linear distance" }));
    expect(screen.getByRole("button", { name: "Linear distance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(/^0\.387 AU · 1\.29% of this linear track$/i)).toBeVisible();
    expect(screen.getByText(/Inner-planet bars therefore become very short/i)).toBeVisible();
  });

  it("selects a planet while keeping distance and size semantics separate", async () => {
    renderExplorer();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Jupiter" }));
    const jupiterRegion = screen.getByRole("region", { name: "Jupiter" });
    expect(within(jupiterRegion).getByRole("heading", { level: 2, name: "Jupiter" })).toBeVisible();
    expect(within(jupiterRegion).getByText("5.2 AU", { exact: true })).toBeVisible();
    expect(within(jupiterRegion).getByText("0.72 hours", { exact: true })).toBeVisible();
    expect(within(jupiterRegion).getByText("5.2×", { exact: true })).toBeVisible();
    expect(
      within(jupiterRegion).getByRole("link", { name: /Compare Jupiter's characteristic size/i }),
    ).toHaveAttribute("href", "/lab/scale-explorer/jupiter");
    expect(
      within(jupiterRegion).getByText(/Distance and body size are different quantities/i),
    ).toBeVisible();
  });

  it("localizes explorer chrome without rewriting reviewed body/model data", () => {
    const messages: SolarSystemDistanceMessages["explorer"] = {
      ...enMessages.explore.solarSystemDistance.explorer,
      modelEyebrow: "Fixture model {modelVersion}",
      selected: {
        ...enMessages.explore.solarSystemDistance.explorer.selected,
        meanDistanceLabel: "Fixture mean distance",
      },
      title: "Fixture distance heading",
      trackSummary: "Fixture {distance} {unit} · {position}% · {mode}",
    };

    renderExplorer(messages);

    expect(screen.getByRole("heading", { name: "Fixture distance heading" })).toBeVisible();
    expect(screen.getByText("Fixture model solar-system-distance-v1")).toBeVisible();
    expect(screen.getByText("Fixture 0.387 AU · 0.00% · log")).toBeVisible();
    const earthRegion = screen.getByRole("region", { name: "Earth" });
    expect(within(earthRegion).getByText("Fixture mean distance")).toBeVisible();
    expect(within(earthRegion).getByText("1 AU", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Mercury" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Neptune" })).toBeVisible();
  });

  it("creates localized metadata without changing the canonical route", () => {
    const messages: SolarSystemDistanceMessages = {
      ...enMessages.explore.solarSystemDistance,
      metadataDescription: "Fixture Solar System metadata",
      metadataTitle: "Fixture Solar System title",
    };

    expect(createSolarSystemDistanceMetadata(messages)).toEqual({
      alternates: { canonical: "/explore/solar-system" },
      description: "Fixture Solar System metadata",
      title: "Fixture Solar System title",
    });
  });
});
