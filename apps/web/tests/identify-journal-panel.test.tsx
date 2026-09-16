import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentificationSolutionResponse } from "@lumina/api-client";

const journalMocks = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("../src/lib/journal/identification", () => ({
  IdentificationJournalSaveError: class IdentificationJournalSaveError extends Error {
    reason = "storage-write-failed";
  },
  saveIdentificationSolutionToJournal: journalMocks.save,
}));

import { IdentifyJournalPanel } from "../src/app/identify/identify-journal-panel";

const solution: IdentificationSolutionResponse = {
  annotations: [
    {
      category: "object",
      dec_deg: -5.45,
      names: ["Orion Nebula"],
      pixel_x: 40,
      pixel_y: 32,
      ra_deg: 83.82,
    },
  ],
  calibration: {
    center_dec_deg: -6.2,
    center_ra_deg: 82.5,
    orientation_deg: 12.5,
    parity: 1,
    pixel_scale_arcsec_per_pixel: 1.45,
    radius_deg: 0.72,
  },
  has_more: false,
  next_cursor: null,
  remote_processing: true,
  solver_name: "astrometry.net-nova",
  solver_type: "nova",
  solver_version: "nova-fixture-v1",
  submission_id: "71000000-0000-4000-8000-000000000001",
  wcs: {
    coordinate_frame: "icrs",
    header: "CTYPE1  = 'RA---TAN'",
    image_height: 80,
    image_width: 100,
    source_sha256: "a".repeat(64),
  },
};

beforeEach(() => {
  journalMocks.save.mockReset();
  journalMocks.save.mockResolvedValue({ id: "11000000-0000-4000-8000-000000000001" });
});

describe("Identify journal save panel", () => {
  it("keeps time, location, and image retention opt-in blank by default", async () => {
    const { container } = render(
      <IdentifyJournalPanel
        completedAt="2026-09-16T15:04:00.000Z"
        solution={solution}
        sourceImage={null}
      />,
    );

    expect(screen.getByText(/does not read EXIF time or location/i)).toBeVisible();
    expect(screen.getByLabelText(/Observation date and time/i)).toHaveValue("");
    expect(screen.getByLabelText(/Location label/i)).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /Keep a local copy/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Keep a local copy/i })).toBeDisabled();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("saves a derived solution without inventing observation metadata", async () => {
    const user = userEvent.setup();
    render(
      <IdentifyJournalPanel
        completedAt="2026-09-16T15:04:00.000Z"
        solution={solution}
        sourceImage={null}
      />,
    );
    await user.type(screen.getByLabelText("Journal title"), "Orion test");
    await user.click(screen.getByRole("button", { name: "Save to local journal" }));

    expect(journalMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attachImage: false,
        latitudeDeg: null,
        locationLabel: "",
        longitudeDeg: null,
        observationTimeUtc: null,
        sourceImage: null,
        title: "Orion test",
      }),
    );
    expect(screen.getByText(/Saved to this browser's local journal/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Journal" })).toHaveAttribute("href", "/journal");
  });

  it("requires a complete coordinate pair and an explicit location label", async () => {
    const user = userEvent.setup();
    render(
      <IdentifyJournalPanel
        completedAt="2026-09-16T15:04:00.000Z"
        solution={solution}
        sourceImage={null}
      />,
    );
    await user.type(screen.getByLabelText("Journal title"), "Coordinate test");
    await user.type(screen.getByLabelText(/^Latitude/i), "12.9");
    await user.click(screen.getByRole("button", { name: "Save to local journal" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/location label/i);
    expect(journalMocks.save).not.toHaveBeenCalled();
  });

  it("persists exact user-entered metadata and only attaches the image after opt-in", async () => {
    const user = userEvent.setup();
    const file = new File([new Uint8Array([1, 2, 3])], "private-name.png", { type: "image/png" });
    render(
      <IdentifyJournalPanel
        completedAt="2026-09-16T15:04:00.000Z"
        solution={solution}
        sourceImage={file}
      />,
    );
    await user.type(screen.getByLabelText("Journal title"), "Back garden Orion");
    await user.type(screen.getByLabelText(/Observation date and time/i), "2026-09-16T21:30");
    await user.type(screen.getByLabelText(/Location label/i), "Back garden");
    await user.type(screen.getByLabelText(/^Latitude/i), "12.9716");
    await user.type(screen.getByLabelText(/^Longitude/i), "77.5946");
    await user.type(screen.getByLabelText(/Telescope/i), "100 mm refractor");
    await user.type(screen.getByLabelText(/^Camera/i), "APS-C");
    await user.click(screen.getByRole("checkbox", { name: /Keep a local copy/i }));
    await user.click(screen.getByRole("button", { name: "Save to local journal" }));

    expect(journalMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attachImage: true,
        camera: "APS-C",
        latitudeDeg: 12.9716,
        locationLabel: "Back garden",
        longitudeDeg: 77.5946,
        sourceImage: file,
        telescope: "100 mm refractor",
      }),
    );
  });
});
