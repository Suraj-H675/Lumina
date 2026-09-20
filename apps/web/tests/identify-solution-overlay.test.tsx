import { axe } from "jest-axe";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SolutionOverlay } from "../src/app/identify/solution-overlay";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { IdentifyMessages } from "../src/lib/i18n/messages/types";

const solution = {
  annotations: [
    {
      category: "star",
      dec_deg: -8.2016,
      names: ["Rigel"],
      pixel_x: 24,
      pixel_y: 30,
      ra_deg: 78.6345,
    },
    {
      category: "deep_sky",
      dec_deg: -5.3911,
      names: ["Orion Nebula", "M42"],
      pixel_x: 68,
      pixel_y: 52,
      ra_deg: 83.8221,
    },
  ],
  calibration: {
    center_dec_deg: -6.2,
    center_ra_deg: 82.5,
    orientation_deg: 12.5,
    parity: 1 as const,
    pixel_scale_arcsec_per_pixel: 1.45,
    radius_deg: 0.72,
  },
  has_more: true,
  next_cursor: "fixture_cursor_1",
  remote_processing: true as const,
  solver_name: "astrometry.net-nova" as const,
  solver_type: "nova" as const,
  solver_version: "nova-fixture-v1",
  submission_id: "71000000-0000-4000-8000-000000000001",
  wcs: {
    coordinate_frame: "icrs" as const,
    header: "CTYPE1  = 'RA---TAN'",
    image_height: 80,
    image_width: 100,
    source_sha256: "a".repeat(64),
  },
};

const overlayDefaults = {
  imageUrl: "blob:local-preview",
  locale: DEFAULT_LOCALE,
  messages: enMessages.identify.solutionOverlay,
  solution,
};

describe("Identification solution overlay", () => {
  it("renders WCS-derived pixel annotations and calibration accessibly", async () => {
    const onLoadMore = vi.fn();
    const { container } = render(
      <SolutionOverlay
        {...overlayDefaults}
        completedAt="2026-09-16T12:00:01Z"
        loadingMore={false}
        loadMoreWarning={false}
        onLoadMore={onLoadMore}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Solved field and WCS-backed annotations" }),
    ).toBeVisible();
    expect(screen.getByText("82.500000°")).toBeVisible();
    expect(screen.getByText("ICRS")).toBeVisible();
    expect(screen.getByText("1.450 arcsec/pixel")).toBeVisible();

    const image = screen.getByRole("img", { name: "Solved astronomical image" });
    expect(image).toHaveAttribute("viewBox", "0 0 100 80");
    const localRaster = image.querySelector("image");
    expect(localRaster).toHaveStyle({ imageOrientation: "none" });
    expect(within(image).getByText("Rigel")).toBeVisible();
    expect(within(image).getByText("Orion Nebula")).toBeVisible();

    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("localizes overlay chrome without rewriting WCS, provider, annotation, or solver data", () => {
    const messages: IdentifyMessages["solutionOverlay"] = {
      ...enMessages.identify.solutionOverlay,
      comparison: {
        ...enMessages.identify.solutionOverlay.comparison,
        legend: "Fixture image comparison",
        zoomLabel: "Fixture zoom {zoom}×",
      },
      provenance: {
        ...enMessages.identify.solutionOverlay.provenance,
        solverLabel: "Fixture solver:",
        title: "Fixture solution provenance",
      },
      table: {
        ...enMessages.identify.solutionOverlay.table,
        caption: "Fixture annotation table",
      },
      title: "Fixture solved-field title",
    };

    render(
      <SolutionOverlay
        {...overlayDefaults}
        completedAt="2026-09-16T12:00:01Z"
        loadingMore={false}
        loadMoreWarning={false}
        messages={messages}
        onLoadMore={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Fixture solved-field title" })).toBeVisible();
    expect(screen.getByText("Fixture image comparison")).toBeVisible();
    expect(screen.getByText("Fixture zoom 1.0×")).toBeVisible();
    fireEvent.click(screen.getByText("Fixture solution provenance"));
    expect(
      screen.getByText(/Fixture solver: Astrometry.net Nova \(nova-fixture-v1\)/),
    ).toBeVisible();
    expect(screen.getByText("Fixture annotation table")).toBeVisible();
    expect(screen.getByText("82.500000°")).toBeVisible();
    expect(screen.getAllByText("Rigel").length).toBeGreaterThan(0);
    expect(
      screen.getByText("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ).toBeVisible();
  });

  it("preserves non-zero solution timestamp milliseconds in locale-aware presentation", () => {
    render(
      <SolutionOverlay
        {...overlayDefaults}
        completedAt="2026-09-16T12:00:01.123Z"
        loadingMore={false}
        loadMoreWarning={false}
        onLoadMore={() => undefined}
      />,
    );

    expect(screen.getByText(/12:00:01\.123/)).toBeVisible();
  });

  it("switches to the original image and filters annotation categories without moving pixels", async () => {
    const user = userEvent.setup();
    render(
      <SolutionOverlay
        {...overlayDefaults}
        completedAt={null}
        loadingMore={false}
        loadMoreWarning={false}
        onLoadMore={() => undefined}
      />,
    );

    const image = screen.getByRole("img", { name: "Solved astronomical image" });
    const rigelMarker = within(image).getByText("Rigel").previousElementSibling;
    expect(rigelMarker).toHaveAttribute("cx", "24");
    expect(rigelMarker).toHaveAttribute("cy", "30");

    await user.click(screen.getByRole("checkbox", { name: "Star" }));
    expect(within(image).queryByText("Rigel")).not.toBeInTheDocument();
    expect(within(image).getByText("Orion Nebula")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Original" }));
    expect(within(image).queryByText("Orion Nebula")).not.toBeInTheDocument();
    expect(
      screen.getByText(/original browser-local image is shown without annotations/i),
    ).toBeVisible();
  });

  it("supports bounded zoom, pagination, and a non-destructive load-more warning", async () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <SolutionOverlay
        {...overlayDefaults}
        completedAt={null}
        loadingMore={false}
        loadMoreWarning={false}
        onLoadMore={onLoadMore}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Zoom:/i), { target: { value: "2.5" } });
    expect(screen.getByText("Zoom: 2.5×")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Load more annotations" }));
    expect(onLoadMore).toHaveBeenCalledOnce();

    rerender(
      <SolutionOverlay
        {...overlayDefaults}
        completedAt={null}
        loadingMore={false}
        loadMoreWarning
        onLoadMore={onLoadMore}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    expect(screen.getByText("Rigel", { selector: "td" })).toBeVisible();
  });
});
