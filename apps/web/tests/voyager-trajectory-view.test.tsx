import { axe } from "jest-axe";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VoyagerTrajectoryExplorer } from "../src/app/explore/missions/voyager-1/voyager-trajectory-explorer";

describe("Phase 5B Voyager 1 trajectory explorer", () => {
  it("defaults to the latest pinned vector with both accessible plot descriptions", async () => {
    const { container } = render(<VoyagerTrajectoryExplorer />);
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
    render(<VoyagerTrajectoryExplorer />);
    const slider = screen.getByRole("slider", { name: "Voyager annual trajectory sample" });
    fireEvent.change(slider, { target: { value: "0" } });

    expect(screen.getByText(/Selected annual sample: 1977/i)).toBeVisible();
    const selected = screen.getByRole("region", { name: /Selected Horizons vector · 1977/i });
    expect(within(selected).getByText("0.967932 AU", { exact: true })).toBeVisible();
    expect(within(selected).getByText("-0.282100 AU", { exact: true })).toBeVisible();
    expect(within(selected).getByText("0.000171 AU", { exact: true })).toBeVisible();
  });
});
