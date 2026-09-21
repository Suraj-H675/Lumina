import type { IdentificationSolutionResponse } from "@lumina/api-client";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { IdentifyMessages } from "../src/lib/i18n/messages/types";

const wwt = vi.hoisted(() => ({
  attach: vi.fn(),
  callbacks: null as { onRenderFailed?: () => void } | null,
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
  wwt.callbacks = null;
  wwt.detach.mockReset();
  wwt.focus.mockReset();
  wwt.probe.mockReset();
  wwt.setLayer.mockReset();
  wwt.probe.mockResolvedValue(true);
  wwt.focus.mockResolvedValue(undefined);
  wwt.attach.mockImplementation(
    (_container: HTMLElement, callbacks: { onRenderFailed?: () => void } = {}) => {
      wwt.callbacks = callbacks;
      return Promise.resolve({
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
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});

function renderSurvey(
  messages: IdentifyMessages["surveyComparison"] = enMessages.identify.surveyComparison,
) {
  return render(
    <SurveyComparisonPanel
      imageUrl="blob:local"
      locale={DEFAULT_LOCALE}
      messages={messages}
      solution={solution}
    />,
  );
}

describe("SurveyComparisonPanel", () => {
  it("keeps survey network and WWT dormant until explicit activation", async () => {
    const { container } = renderSurvey();

    expect(wwt.probe).not.toHaveBeenCalled();
    expect(wwt.attach).not.toHaveBeenCalled();
    expect(screen.getByText(/not pixel-registered/i)).toBeVisible();
    expect(screen.getByText(/uploaded image bytes.*not sent/i)).toBeVisible();
    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:local");
    expect((await axe(container)).violations).toEqual([]);
  });

  it("focuses the certified atlas on the exact solved center and field diameter", async () => {
    const user = userEvent.setup();
    renderSurvey();
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
    renderSurvey();

    await user.click(screen.getByRole("button", { name: "Open survey comparison" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable right now/i);
    expect(wwt.attach).not.toHaveBeenCalled();
  });

  it("keeps renderer failure visible when rendering dies while initial focus is pending", async () => {
    let resolveFocus: (() => void) | null = null;
    wwt.focus.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFocus = resolve;
        }),
    );
    const user = userEvent.setup();
    renderSurvey();

    await user.click(screen.getByRole("button", { name: "Open survey comparison" }));
    await waitFor(() => expect(wwt.focus).toHaveBeenCalledOnce());
    await act(async () => {
      wwt.callbacks?.onRenderFailed?.();
      resolveFocus?.();
      await Promise.resolve();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enMessages.identify.surveyComparison.states.rendererFailed,
    );
    expect(
      screen.queryByText(enMessages.identify.surveyComparison.states.comparisonReady),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /survey comparison/i })).toHaveAttribute(
      "src",
      "blob:local",
    );
  });

  it("keeps renderer failure visible when rendering dies while a layer probe is pending", async () => {
    let resolveLayerProbe: ((available: boolean) => void) | null = null;
    wwt.probe.mockResolvedValueOnce(true).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveLayerProbe = resolve;
        }),
    );
    const user = userEvent.setup();
    renderSurvey();

    await user.click(screen.getByRole("button", { name: "Open survey comparison" }));
    await waitFor(() =>
      expect(
        screen.getByText(enMessages.identify.surveyComparison.states.comparisonReady),
      ).toBeVisible(),
    );
    await user.selectOptions(screen.getByLabelText("Survey layer"), "infrared-wise");
    await waitFor(() => expect(wwt.probe).toHaveBeenCalledTimes(2));
    await act(async () => {
      wwt.callbacks?.onRenderFailed?.();
      resolveLayerProbe?.(false);
      await Promise.resolve();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      enMessages.identify.surveyComparison.states.rendererFailed,
    );
    expect(screen.queryByText(/Infrared · WISE.*unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: /survey comparison/i })).toHaveAttribute(
      "src",
      "blob:local",
    );
  });

  it("switches only to an available reviewed layer and detaches on unmount", async () => {
    const user = userEvent.setup();
    const view = renderSurvey();
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

  it("localizes wrapper and state copy without rewriting survey or solved-field data", async () => {
    const user = userEvent.setup();
    const messages: IdentifyMessages["surveyComparison"] = {
      ...enMessages.identify.surveyComparison,
      action: "Fixture open survey",
      description: "Fixture comparison through {service}.",
      fieldDescription: "Fixture field {fieldOfView}°.",
      figures: {
        ...enMessages.identify.surveyComparison.figures,
        surveyCaption: "Fixture context: {layer}",
      },
      states: {
        ...enMessages.identify.surveyComparison.states,
        showingLayer: "Fixture showing {layer}.",
      },
      title: "Fixture survey comparison",
    };

    renderSurvey(messages);

    expect(screen.getByRole("heading", { name: "Fixture survey comparison" })).toBeVisible();
    expect(screen.getByText("Fixture comparison through WorldWide Telescope.")).toBeVisible();
    expect(screen.getByText("Fixture field 5.000°.")).toBeVisible();
    expect(screen.getByText("Fixture context: Visible · DSS2")).toBeVisible();
    expect(screen.getByText(/Copyright DSS Consortium/)).toBeVisible();
    expect(wwt.probe).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Fixture open survey" }));
    await waitFor(() => expect(wwt.focus).toHaveBeenCalledOnce());
    expect(wwt.focus).toHaveBeenCalledWith({
      declinationDegrees: -6.2,
      fieldOfViewDegrees: 5,
      reducedMotion: false,
      rightAscensionDegrees: 82.5,
    });
    await user.selectOptions(screen.getByLabelText("Survey layer"), "infrared-wise");
    await waitFor(() => expect(screen.getByText("Fixture showing Infrared · WISE.")).toBeVisible());
    expect(wwt.setLayer).toHaveBeenLastCalledWith("infrared-wise");
  });
});
