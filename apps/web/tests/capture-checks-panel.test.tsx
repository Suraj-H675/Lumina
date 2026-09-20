import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { IdentifyMessages } from "../src/lib/i18n/messages/types";

const captureMocks = vi.hoisted(() => ({ analyze: vi.fn() }));

vi.mock("../src/lib/identification/capture-checks", () => ({
  CaptureCheckError: class CaptureCheckError extends Error {
    reason = "decode-failed";
  },
  MAX_CAPTURE_SAMPLE_PIXELS: 262_144,
  analyzeCaptureFile: captureMocks.analyze,
}));

import { CaptureChecksPanel } from "../src/app/identify/capture-checks-panel";

function renderCaptureChecks(
  sourceImage: File | null,
  messages: IdentifyMessages["captureChecks"] = enMessages.identify.captureChecks,
) {
  return render(
    <CaptureChecksPanel
      locale={DEFAULT_LOCALE}
      messages={messages}
      sourceHeightPx={32}
      sourceImage={sourceImage}
      sourceWidthPx={32}
    />,
  );
}

const histogram = Array.from({ length: 16 }, (_, index) => ({
  code_max: index === 15 ? 255 : index * 16 + 15,
  code_min: index * 16,
  percentage: index === 4 ? 100 : 0,
  pixel_count: index === 4 ? 1_024 : 0,
}));

beforeEach(() => {
  captureMocks.analyze.mockReset();
  captureMocks.analyze.mockResolvedValue({
    high_endpoint_percentage: 1.25,
    low_endpoint_percentage: 2.5,
    luminance_histogram: histogram,
    model_version: "browser-raster-sample-v1",
    non_opaque_sample_pixels: 0,
    opaque_sample_pixels: 1_024,
    sample_height_px: 32,
    sample_width_px: 32,
    source_height_px: 32,
    source_width_px: 32,
  });
});

describe("CaptureChecksPanel", () => {
  it("does not decode until the user explicitly runs local checks", async () => {
    const user = userEvent.setup();
    const file = new File(["image"], "private.png", { type: "image/png" });
    renderCaptureChecks(file);

    expect(captureMocks.analyze).not.toHaveBeenCalled();
    expect(screen.getByText(/makes no additional upload/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Run local capture checks" }));

    expect(captureMocks.analyze).toHaveBeenCalledOnce();
    expect(captureMocks.analyze).toHaveBeenCalledWith(file, 32, 32);
    expect(await screen.findByText("32 × 32 pixels")).toBeVisible();
    expect(screen.getByText("2.50%")).toBeVisible();
    expect(screen.getByText("1.25%")).toBeVisible();
  });
  it("states the proxy limitations and passes an axe scan after analysis", async () => {
    const user = userEvent.setup();
    const file = new File(["image"], "private.png", { type: "image/png" });
    const { container } = renderCaptureChecks(file);

    await user.click(screen.getByRole("button", { name: "Run local capture checks" }));
    await screen.findByRole("list", { name: "Display-RGB luma histogram" });
    expect(screen.getByText(/not sensor\/raw measurements/i)).toBeVisible();
    expect(screen.getByText(/does not diagnose exposure/i)).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("keeps the solved workflow usable if local decoding fails", async () => {
    const user = userEvent.setup();
    captureMocks.analyze.mockRejectedValueOnce(new Error("decode unavailable"));
    const file = new File(["image"], "private.png", { type: "image/png" });
    renderCaptureChecks(file);

    await user.click(screen.getByRole("button", { name: "Run local capture checks" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no additional upload occurred/i);
    expect(screen.getByRole("button", { name: "Retry local capture checks" })).toBeVisible();
  });

  it("renders nothing when no browser-local source image remains", () => {
    const { container } = renderCaptureChecks(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("localizes diagnostic chrome without changing the local sample result or provider identity", async () => {
    const user = userEvent.setup();
    const file = new File(["image"], "private.png", { type: "image/png" });
    const messages: IdentifyMessages["captureChecks"] = {
      ...enMessages.identify.captureChecks,
      actions: {
        ...enMessages.identify.captureChecks.actions,
        run: "Fixture local checks",
      },
      description: "Fixture browser-only diagnostics; no request to {provider}.",
      metrics: {
        ...enMessages.identify.captureChecks.metrics,
        sourceDimensions: "Fixture source dimensions",
      },
      title: "Fixture capture checks",
    };

    renderCaptureChecks(file, messages);

    expect(screen.getByRole("heading", { name: "Fixture capture checks" })).toBeVisible();
    expect(
      screen.getByText("Fixture browser-only diagnostics; no request to Astrometry.net."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Fixture local checks" }));
    expect(await screen.findByText("32 × 32 pixels")).toBeVisible();
    expect(screen.getByText("Fixture source dimensions")).toBeVisible();
    expect(screen.getByText("2.50%")).toBeVisible();
    expect(captureMocks.analyze).toHaveBeenCalledWith(file, 32, 32);
  });
});
