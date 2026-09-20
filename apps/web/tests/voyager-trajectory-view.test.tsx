import { axe } from "jest-axe";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVoyagerMetadata } from "../src/app/explore/missions/voyager-1/route-page";
import { VoyagerTrajectoryExplorer } from "../src/app/explore/missions/voyager-1/voyager-trajectory-explorer";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { VoyagerMessages } from "../src/lib/i18n/messages/types";

function renderExplorer(
  messages: VoyagerMessages["trajectory"] = enMessages.explore.voyager.trajectory,
  centerBodyName: string = enMessages.explore.voyager.centerBodyName,
) {
  return render(
    <VoyagerTrajectoryExplorer
      centerBodyName={centerBodyName}
      locale={DEFAULT_LOCALE}
      messages={messages}
    />,
  );
}

describe("Phase 5B Voyager 1 trajectory explorer", () => {
  it("defaults to the latest pinned vector with both accessible plot descriptions", async () => {
    const { container } = renderExplorer();
    expect(
      screen.getByRole("heading", { level: 2, name: "Voyager 1 trajectory reference" }),
    ).toBeVisible();
    expect(screen.getByText(/Selected annual sample: 2026/i)).toBeVisible();
    expect(
      screen.getByRole("img", { name: /heliocentric ecliptic XY trajectory projection/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: /heliocentric distance by annual sample/i }),
    ).toBeVisible();
    const selected = screen.getByRole("region", { name: /Selected Horizons vector · 2026/i });
    expect(within(selected).getByText(/98\.853270 AU/i)).toBeVisible();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("moves only among pinned annual samples and exposes full XYZ", async () => {
    renderExplorer();
    const slider = screen.getByRole("slider", { name: "Voyager 1 annual trajectory sample" });
    fireEvent.change(slider, { target: { value: "0" } });

    expect(screen.getByText(/Selected annual sample: 1977/i)).toBeVisible();
    const selected = screen.getByRole("region", { name: /Selected Horizons vector · 1977/i });
    expect(within(selected).getByText("0.967932 AU", { exact: true })).toBeVisible();
    expect(within(selected).getByText("-0.282100 AU", { exact: true })).toBeVisible();
    expect(within(selected).getByText("0.000171 AU", { exact: true })).toBeVisible();
  });

  it("localizes trajectory chrome without rewriting mission, frame, axes, or vectors", () => {
    const messages: VoyagerMessages["trajectory"] = {
      ...enMessages.explore.voyager.trajectory,
      eyebrow: "Fixture provider: {provider}",
      projection: {
        ...enMessages.explore.voyager.trajectory.projection,
        title: "Fixture {frame} {xyAxes}",
      },
      selectedVectorTitle: "Fixture {provider} vector · {year}",
      title: "Fixture {mission} trajectory",
    };

    renderExplorer(messages, "Fixture Sun");

    expect(
      screen.getByRole("heading", { level: 2, name: "Fixture Voyager 1 trajectory" }),
    ).toBeVisible();
    expect(screen.getByText("Fixture provider: JPL Horizons")).toBeVisible();
    expect(screen.getByText("Fixture J2000 XY")).toBeVisible();
    expect(screen.getByText("Fixture Sun")).toBeVisible();
    const selected = screen.getByRole("region", { name: "Fixture Horizons vector · 2026" });
    expect(within(selected).getByText("98.853270 AU", { exact: true })).toBeVisible();
    expect(within(selected).getByText("X")).toBeVisible();
    expect(within(selected).getByText("Y")).toBeVisible();
    expect(within(selected).getByText("Z")).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Voyager 1 heliocentric ecliptic XY trajectory projection",
      }),
    ).toBeVisible();
  });

  it("creates localized metadata without changing the canonical route", () => {
    const messages: VoyagerMessages = {
      ...enMessages.explore.voyager,
      metadataDescription: "Fixture {mission} metadata from {provider}.",
      metadataTitle: "Fixture {mission} title",
    };

    expect(createVoyagerMetadata(messages)).toEqual({
      alternates: { canonical: "/explore/missions/voyager-1" },
      description: "Fixture Voyager 1 metadata from JPL Horizons.",
      title: "Fixture Voyager 1 title",
    });
  });
});
