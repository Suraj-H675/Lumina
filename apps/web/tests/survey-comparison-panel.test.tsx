import type { IdentificationSolutionResponse } from "@lumina/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const wwt = vi.hoisted(() => ({
  attach: vi.fn(),
  detach: vi.fn(),
  focus: vi.fn(),
  probe: vi.fn(),
  setLayer: vi.fn(),
}));

vi.mock("../src/lib/wwt/client", () => ({
  attachWwtAtlas: wwt.attach,
  probeAtlasLayerAvailability: wwt.probe,
}));

import { SurveyComparisonPanel } from "../src/app/identify/survey-comparison-panel";

const solution: IdentificationSolutionResponse = {
  annotations: [],
  calibration: {
    center_dec_deg: -6.2,
    center_ra_deg: 82.5,
    orientation_deg: 12.5,
    parity: 1,
    pixel_scale_arcsec_per_pixel: 1.45,
    radius_deg: 2.5,
  },
  has_more: false,
  next_cursor: null,
  remote_processing: true,
  solver_name: "astrometry.net-nova",
  solver_type: "nova",
  solver_version: "fixture",
  submission_id: "00000000-0000-4000-8000-000000000001",
  wcs: {
    coordinate_frame: "icrs",
    header: "fixture-wcs",
    image_height: 80,
    image_width: 100,
    source_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
};

beforeEach(() => {
  wwt.attach.mockReset();
  wwt.detach.mockReset();
  wwt.focus.mockReset();
  wwt.probe.mockReset();
  wwt.setLayer.mockReset();
  wwt.probe.mockResolvedValue(true);
  wwt.focus.mockResolvedValue(undefined);
  wwt.attach.mockResolvedValue({
    detach: wwt.detach,
    focus: wwt.focus,
    pan: vi.fn(),
    setLayer: wwt.setLayer,
    setLocalHorizon: vi.fn(),
    setObserver: vi.fn(),
    setTime: vi.fn(),
    syncTimeNow: vi.fn(),
    zoom: vi.fn(),
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});

describe("SurveyComparisonPanel", () => {
  it("keeps survey network and WWT dormant until explicit activation", async () => {
    const { container } = render(
      <SurveyComparisonPanel imageUrl="blob:local" solution={solution} />,
    );

    expect(wwt.probe).not.toHaveBeenCalled();
    expect(wwt.attach).not.toHaveBeenCalled();
    expect(screen.getByText(/not pixel-registered/i)).toBeVisible();
    expect(screen.getByText(/uploaded image bytes.*not sent/i)).toBeVisible();
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:local");
    expect((await axe(container)).violations).toEqual([]);
  });

  it("focuses the certified atlas on the exact solved center and field diameter", async () => {
    const user = userEvent.setup();
    render(<SurveyComparisonPanel imageUrl="blob:local" solution={solution} />);
    await user.click(screen.getByRole("button", { name: "Open survey comparison" }));
    await waitFor(() => expect(wwt.attach).toHaveBeenCalledOnce());
    expect(wwt.probe).toHaveBeenCalledWith("visible-dss2");
    expect(wwt.setLayer).toHaveBeenCalledWith("visible-dss2");
    expect(wwt.focus).toHaveBeenCalledWith({
      declinationDegrees: -6.2,
      fieldOfViewDegrees: 5,
      reducedMotion: false,
      rightAscensionDegrees: 82.5,
    });
    expect(screen.getByText(/requests a 5\.000° atlas field/i)).toBeVisible();
  });

  it("refuses an unavailable survey before starting WWT", async () => {
    const user = userEvent.setup();
    wwt.probe.mockResolvedValueOnce(false);
    render(<SurveyComparisonPanel imageUrl="blob:local" solution={solution} />);

    await user.click(screen.getByRole("button", { name: "Open survey comparison" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable right now/i);
    expect(wwt.attach).not.toHaveBeenCalled();
  });

  it("switches only to an available reviewed layer and detaches on unmount", async () => {
    const user = userEvent.setup();
    const view = render(<SurveyComparisonPanel imageUrl="blob:local" solution={solution} />);
    await user.click(screen.getByRole("button", { name: "Open survey comparison" }));
    await waitFor(() => expect(wwt.attach).toHaveBeenCalledOnce());
    await user.selectOptions(screen.getByLabelText("Survey layer"), "infrared-wise");
    await waitFor(() => expect(wwt.probe).toHaveBeenLastCalledWith("infrared-wise"));
    expect(wwt.setLayer).toHaveBeenLastCalledWith("infrared-wise");
    expect(wwt.focus).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Showing Infrared · WISE/i)).toBeVisible();

    view.unmount();
    expect(wwt.detach).toHaveBeenCalledOnce();
  });
});
