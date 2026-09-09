import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TelescopeBuilderCalculationResponse } from "@lumina/api-client";

import { TelescopeBuilderView } from "../src/components/telescope-builder-view";
import {
  DEFAULT_TELESCOPE_BUILDER_STATE,
  type TelescopeType,
  type TelescopeBuilderState,
} from "../src/lib/simulations/telescope-builder";

const DEFAULT_RESULT: TelescopeBuilderCalculationResponse = {
  model_version: "telescope-builder-v1",
  schema_version: 1,
  inputs: {
    aperture_mm: 100,
    telescope_focal_length_mm: 1000,
    telescope_type: "refractor",
    eyepiece_focal_length_mm: 20,
    eyepiece_apparent_field_deg: 50,
    optical_modifier_kind: "none",
    optical_modifier_factor: 1,
    target_angular_size_arcmin: 30,
  },
  effective_focal_length_mm: 1000,
  native_focal_ratio: 10,
  effective_focal_ratio: 10,
  magnification_x: 50,
  approx_true_field_deg: 1,
  exit_pupil_mm: 2,
  dawes_limit_arcsec: 1.16,
  rayleigh_limit_arcsec: 1.3840368499180167,
  ideal_light_gathering_ratio_vs_7mm_pupil: 204.08163265306123,
  target_angular_size_deg: 0.5,
  target_field_fraction: 0.5,
  target_fit: "fits",
  warning_codes: [],
};

function responseFor(state: TelescopeBuilderState): TelescopeBuilderCalculationResponse {
  return {
    ...DEFAULT_RESULT,
    inputs: {
      ...DEFAULT_RESULT.inputs,
      aperture_mm: state.aperture_mm,
      telescope_focal_length_mm: state.telescope_focal_length_mm,
      telescope_type: state.telescope_type,
      eyepiece_focal_length_mm: state.eyepiece_focal_length_mm,
      eyepiece_apparent_field_deg: state.eyepiece_apparent_field_deg,
      optical_modifier_kind: state.optical_modifier_kind,
      optical_modifier_factor: state.optical_modifier_factor,
      target_angular_size_arcmin: state.target_angular_size_arcmin,
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/lab/telescope-builder");
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("telescope_focal_length_mm") === "10000") {
        return Promise.resolve(new Response(null, { status: 422 }));
      }
      const state: TelescopeBuilderState = {
        ...DEFAULT_TELESCOPE_BUILDER_STATE,
        telescope_type: (url.searchParams.get("telescope_type") ?? "refractor") as TelescopeType,
      };
      return Promise.resolve(
        new Response(JSON.stringify(responseFor(state)), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(
  initialState: TelescopeBuilderState = DEFAULT_TELESCOPE_BUILDER_STATE,
  initialCalculation: TelescopeBuilderCalculationResponse | null = DEFAULT_RESULT,
  initialStateInvalid = false,
) {
  return render(
    <TelescopeBuilderView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={initialCalculation}
      initialState={initialState}
      initialStateInvalid={initialStateInvalid}
    />,
  );
}

describe("TelescopeBuilderView", () => {
  it("renders the real canonical outputs, schematic alternatives, model disclosures, and sources", async () => {
    const { container } = renderView();

    expect(screen.getByRole("heading", { level: 1, name: "Telescope Builder" })).toBeVisible();
    expect(screen.getByText("50.0×")).toBeVisible();
    expect(screen.getByText("1.00°")).toBeVisible();
    expect(screen.getByText("2.00 mm")).toBeVisible();
    expect(screen.getByText(/Ideal collecting-area ratio vs 7 mm reference pupil/i)).toBeVisible();
    expect(screen.getByTestId("telescope-optical-train-figure")).toBeVisible();
    expect(screen.getByTestId("telescope-field-fit-figure")).toBeVisible();
    expect(screen.getByText(/not a product recommendation or a guaranteed view/i)).toBeVisible();
    expect(screen.getByText("Pushing Limits: A Spring Sky Double Star Romp")).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("calculates a changed descriptive type through the GET boundary without changing the numeric result", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("telescope_type")).toBe("reflector");
      return Promise.resolve(
        new Response(
          JSON.stringify(
            responseFor({ ...DEFAULT_TELESCOPE_BUILDER_STATE, telescope_type: "reflector" }),
          ),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    await user.selectOptions(screen.getByLabelText("Telescope type"), "reflector");
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Telescope type")).toHaveValue("reflector");
    expect(screen.getByText(/Numeric outputs are invariant across the three/i)).toHaveTextContent(
      "reflector",
    );
    expect(screen.getByText("50.0×")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toContain(
      '"telescope_type":"reflector"',
    );
  });

  it("retains the last valid result when a relationally invalid draft is submitted", async () => {
    const user = userEvent.setup();
    renderView();

    const focalLength = screen.getByRole("spinbutton", {
      name: "Native telescope focal length",
    });
    await user.clear(focalLength);
    await user.type(focalLength, "10000");
    await user.click(screen.getByRole("button", { name: "Calculate" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /canonical Telescope Builder model rejected this configuration/i,
      ),
    );
    expect(screen.getByTestId("telescope-results-table")).toHaveTextContent("1000.00 mm");
    expect(screen.getByRole("status")).not.toHaveTextContent("Calculating");
  });

  it("reports malformed incoming state and offers an explicit reset", async () => {
    const user = userEvent.setup();
    renderView(DEFAULT_TELESCOPE_BUILDER_STATE, DEFAULT_RESULT, true);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /shared Telescope Builder state was not valid/i,
    );
    await user.click(screen.getByRole("button", { name: "Reset to default state" }));
    await waitFor(() =>
      expect(
        screen.queryByText(/shared Telescope Builder state was not valid/i),
      ).not.toBeInTheDocument(),
    );
    expect(new URL(window.location.href).search).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent(
      /reset to the balanced-reference default/i,
    );
  });
});
