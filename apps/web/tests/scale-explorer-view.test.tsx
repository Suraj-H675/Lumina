import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ScaleExplorerView } from "../src/components/scale-explorer-view";
import {
  DEFAULT_SCALE_EXPLORER_STATE,
  decodeScaleExplorerState,
} from "../src/lib/simulations/scale-explorer";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/lab/scale-explorer");
});

describe("ScaleExplorerView", () => {
  it("renders the interactive result, model page, data alternative, and sources accessibly", async () => {
    const { container } = render(
      <ScaleExplorerView initialState={DEFAULT_SCALE_EXPLORER_STATE} initialStateInvalid={false} />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Scale Explorer" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Model and assumptions" })).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "Text and data alternative" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    expect(screen.getByText(/Exactly 12 discrete IDs: Moon, Mercury, Mars/i)).toBeVisible();
    expect(screen.getByText("about 12.7 thousand km characteristic diameter")).toBeVisible();
    expect(screen.getByText(/NASA lists an approximate radius of 6,371 km/i)).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Transition evidence" })).toBeVisible();
    expect(screen.getByText(/Content review/)).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Evidence" })).toBeVisible();
    expect(screen.getByText(/Display coordinate: 0–100%/i)).toBeVisible();
    expect(screen.getByText("Selected node marker")).toBeVisible();
    expect(screen.getByText("Other curated node marker")).toBeVisible();
    expect(screen.getAllByText("nasa-solar-system-sizes").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Solar System Sizes" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "NASA Earth facts" })).toHaveAttribute(
      "href",
      "https://science.nasa.gov/earth/facts/",
    );
    expect(screen.getByText(/scale-relative-ratio-v1 v1/i)).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("exposes comparison provenance and numeric transition contracts beside the result", () => {
    const { unmount } = render(
      <ScaleExplorerView
        initialState={{ model_version: "scale-explorer-v1", node_id: "milky-way", version: 1 }}
        initialStateInvalid={false}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Milky Way galaxy" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 3, name: "Comparison evidence" })).toBeVisible();
    expect(screen.getByText("milky-way, earth")).toBeVisible();
    expect(screen.getAllByText("nasa-solar-system-sizes").length).toBeGreaterThan(0);
    expect(screen.queryByText(/stellar-disk diameter/i)).not.toBeInTheDocument();

    unmount();
    render(
      <ScaleExplorerView
        initialState={{ model_version: "scale-explorer-v1", node_id: "mercury", version: 1 }}
        initialStateInvalid={false}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Transition calculation contract" }),
    ).toBeVisible();
    expect(screen.getByText("mercury, moon")).toBeVisible();
    expect(screen.getAllByText("scale-relative-ratio-v1").length).toBeGreaterThan(0);
  });

  it("changes the deterministic model with the slider and updates the shareable URL state", async () => {
    const user = userEvent.setup();
    render(
      <ScaleExplorerView initialState={DEFAULT_SCALE_EXPLORER_STATE} initialStateInvalid={false} />,
    );

    const slider = screen.getByRole("slider", { name: "Curated scale position" });
    slider.focus();
    fireEvent.change(slider, { target: { value: "5" } });

    expect(screen.getByRole("heading", { level: 2, name: "Neptune" })).toBeVisible();
    expect(screen.getByText("Node 6 of 12: Neptune")).toBeVisible();
    const encoded = new URL(window.location.href).searchParams.get("state");
    expect(encoded).not.toBeNull();
    expect(decodeScaleExplorerState(encoded)).toEqual({
      model_version: "scale-explorer-v1",
      version: 1,
      node_id: "neptune",
    });

    await user.click(screen.getByRole("button", { name: "Copy share link" }));
    expect(await screen.findByText(/share link ready below|share link copied/i)).toBeVisible();
    expect((screen.getByLabelText("Share link") as HTMLInputElement).value).toContain("state=");
  });

  it("keeps an invalid incoming state visible as an explicit warning and recovers with reset", async () => {
    const user = userEvent.setup();
    render(<ScaleExplorerView initialState={DEFAULT_SCALE_EXPLORER_STATE} initialStateInvalid />);

    expect(screen.getByRole("alert")).toHaveTextContent(/shared scale state was not valid/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/serialized form/i);
    expect(screen.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reset to Earth" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(new URL(window.location.href).search).toBe("");
    expect(screen.getAllByRole("status").at(-1)).toHaveTextContent(/reset to Earth/i);
  });

  it("changes presentation copy without changing the selected scientific result", async () => {
    const user = userEvent.setup();
    render(
      <ScaleExplorerView initialState={DEFAULT_SCALE_EXPLORER_STATE} initialStateInvalid={false} />,
    );

    expect(screen.getByText(/explorer mode keeps the model explanation concise/i)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Derived quantity contracts" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Presentation mode"), "student");
    expect(screen.getByText(/student mode foregrounds the vocabulary/i)).toBeVisible();
    expect(screen.getByText(/a radius is half a diameter/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Maths to notice" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Derived quantity contracts" })).toBeNull();

    await user.selectOptions(screen.getByLabelText("Presentation mode"), "deep-dive");
    expect(screen.getByText(/converts each source value to metres for ordering/i)).toBeVisible();
    expect(screen.getByText(/deep dive mode exposes the model boundary/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Relationships used" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Derived quantity contracts" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Earth" })).toBeVisible();
    expect(screen.getByText("about 12.7 thousand km characteristic diameter")).toBeVisible();
  });
});
