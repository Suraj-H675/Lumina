import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ExoplanetSystemExplorer } from "../src/app/explore/exoplanet-systems/exoplanet-system-explorer";

describe("Phase 5B Exoplanet System Explorer", () => {
  it("defaults to the five-planet Kepler-186 layout with honest model wording", async () => {
    const { container } = render(<ExoplanetSystemExplorer />);
    expect(
      screen.getByRole("heading", { level: 2, name: /Five known host systems/i }),
    ).toBeVisible();
    expect(screen.getByText(/not the planet's current distance/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Kepler-186, 5 confirmed planets/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("region", { name: /Kepler-186 orbital reference layout/i }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Kepler-186 f" })).toBeVisible();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("preserves split parameter references for HD 209458 b", async () => {
    render(<ExoplanetSystemExplorer />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /HD 209458, 1 confirmed planet/i }));

    const detail = screen.getByRole("region", { name: "HD 209458 b" });
    expect(within(detail).getByText("0.04707 AU", { exact: true })).toBeVisible();
    expect(within(detail).getByText("3.52474859 days", { exact: true })).toBeVisible();
    expect(within(detail).getByRole("link", { name: /Bonomo et al\. 2017/i })).toBeVisible();
    expect(within(detail).getByRole("link", { name: /Stassun et al\. 2017/i })).toBeVisible();
    expect(within(detail).getByText(/may come from different publications/i)).toBeVisible();
  });

  it("switches scale modes and keeps canonical host identity linked", async () => {
    render(<ExoplanetSystemExplorer />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Linear semi-major axis" }));
    expect(screen.getByRole("button", { name: "Linear semi-major axis" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const layout = screen.getByRole("region", { name: /Kepler-186 orbital reference layout/i });
    expect(within(layout).getByRole("button", { name: "Kepler-186 f" })).toBeVisible();
    expect(within(layout).getByText(/0\.432 AU · 41\.30% of shared linear track/i)).toBeVisible();
    expect(within(layout).getByRole("link", { name: /Open canonical host star/i })).toHaveAttribute(
      "href",
      "/objects/kepler-186",
    );
  });
});
