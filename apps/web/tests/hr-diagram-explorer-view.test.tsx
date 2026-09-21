import { axe } from "jest-axe";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { HRDiagramExplorerEnhanced } from "../src/components/hr-diagram-explorer-enhanced";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { DEFAULT_HR_DIAGRAM_STATE } from "../src/lib/simulations/hr-diagram-explorer";
import { renderWithEnglishMessages as render } from "./i18n-render";

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
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.hrDiagramExplorer}
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
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.hrDiagramExplorer}
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
      <HRDiagramExplorerEnhanced
        initialState={DEFAULT_HR_DIAGRAM_STATE}
        initialStateInvalid
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.hrDiagramExplorer}
      />,
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

  it("localizes interface chrome without rewriting reviewed Gaia science or source identity", () => {
    const messages = {
      ...enMessages.simulationLabs.hrDiagramExplorer,
      header: {
        ...enMessages.simulationLabs.hrDiagramExplorer.header,
        title: "Localized H-R Explorer",
      },
      table: {
        ...enMessages.simulationLabs.hrDiagramExplorer.table,
        title: "Localized stellar table",
      },
    };

    render(
      <HRDiagramExplorerEnhanced
        initialState={DEFAULT_HR_DIAGRAM_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={messages}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Localized H-R Explorer" })).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Localized stellar table" }),
    ).toBeVisible();
    expect(screen.getByText(/does not convert BP−RP to temperature/i)).toBeVisible();
    expect(screen.getAllByText("Main sequence", { exact: true })[0]).toBeVisible();
    expect(screen.getByRole("link", { name: "20.1.1 gaia_source" })).toBeVisible();
  });
});
