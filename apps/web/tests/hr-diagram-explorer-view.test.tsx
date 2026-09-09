import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { HRDiagramExplorerEnhanced } from "../src/components/hr-diagram-explorer-enhanced";
import { DEFAULT_HR_DIAGRAM_STATE } from "../src/lib/simulations/hr-diagram-explorer";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/lab/hr-diagram-explorer");
});

describe("HRDiagramExplorerEnhanced", () => {
  it("renders the real curated plot/table result and accessible model surface", async () => {
    const { container } = render(
      <HRDiagramExplorerEnhanced
        initialState={DEFAULT_HR_DIAGRAM_STATE}
        initialStateInvalid={false}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "H-R Diagram Explorer" })).toBeVisible();
    expect(screen.getByTestId("hr-diagram-plot")).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(129);
    expect(screen.getByText(/Gaia DR3 source ID/)).toBeVisible();
    expect(screen.getByText(/does not convert BP−RP to temperature/i)).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  }, 15_000);

  it("changes the view and filters while keeping the selected star independent", async () => {
    const user = userEvent.setup();
    render(
      <HRDiagramExplorerEnhanced
        initialState={{ ...DEFAULT_HR_DIAGRAM_STATE, spectral_classes: ["O"] }}
        initialStateInvalid={false}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Diagram view"), "gaia_cmd");
    expect(screen.getByText(/Gaia BP−RP colour \(mag\)/)).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toContain('"view":"gaia_cmd"');

    expect(screen.getByText(/0 of 128 stars match the active filters/)).toBeVisible();
    await user.click(screen.getByLabelText("O"));
    expect(screen.getByText(/0 of 128 stars match the active filters/)).toBeVisible();
    expect(screen.getByText(/This selected star is outside the active filters/)).toBeVisible();
    expect(screen.getByText("598546371788334080")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Reset$/ }));
    expect(screen.getByText(/128 of 128 stars match the active filters/)).toBeVisible();
    expect(new URL(window.location.href).search).toBe("");
  });

  it("supports keyboard selection through the complete table and reports invalid state recovery", async () => {
    const user = userEvent.setup();
    render(
      <HRDiagramExplorerEnhanced initialState={DEFAULT_HR_DIAGRAM_STATE} initialStateInvalid />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /shared H-R Diagram Explorer state was not valid/i,
    );
    await user.click(screen.getByRole("button", { name: "Reset to default state" }));
    const firstPoint = screen.getAllByRole("button", { name: /Select /i })[0];
    expect(firstPoint).toBeDefined();
    if (firstPoint === undefined) return;
    firstPoint.focus();
    expect(firstPoint).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText(/Selected star/)).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
