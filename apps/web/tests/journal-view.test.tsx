import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JournalEntry } from "../src/lib/journal/model";

const journalMocks = vi.hoisted(() => ({
  deleteEntry: vi.fn(),
  listEntries: vi.fn(),
}));

vi.mock("../src/lib/journal/database", () => ({
  deleteJournalEntry: journalMocks.deleteEntry,
  listJournalEntries: journalMocks.listEntries,
}));

import { JournalView } from "../src/app/journal/journal-view";

const entry: JournalEntry = {
  attachment_ids: ["13000000-0000-4000-8000-000000000001"],
  conditions: "Clear with light haze",
  created_at: "2026-09-16T16:00:00.000Z",
  equipment: ["Telescope: 100 mm refractor", "Camera: APS-C"],
  follow_up: false,
  id: "11000000-0000-4000-8000-000000000001",
  import_provenance: null,
  location: {
    confirmed_by_user: true,
    label: "Back garden",
    latitude_deg: 12.9716,
    longitude_deg: 77.5946,
  },
  notes: "Broad core visible.",
  objects: [{ entity_id: null, name: "Orion Nebula", source: "plate_annotation" }],
  observed_time: { confirmed_by_user: true, utc: "2026-09-16T15:00:00.000Z" },
  plate_solve: {
    center_dec_deg: -6.2,
    center_ra_deg: 82.5,
    frame: "ICRS",
    orientation_deg: 12.5,
    parity: "positive",
    pixel_scale_arcsec: 1.45,
    radius_deg: 0.72,
    snapshot_id: "71000000-0000-4000-8000-000000000001",
    solved_at: "2026-09-16T15:04:00.000Z",
    solver_version: "nova-fixture-v1",
    wcs_source_sha256: "a".repeat(64),
  },
  rating: null,
  schema_version: 1,
  tags: [],
  title: "Orion test",
  updated_at: "2026-09-16T16:00:00.000Z",
};

beforeEach(() => {
  journalMocks.deleteEntry.mockReset();
  journalMocks.listEntries.mockReset();
  journalMocks.listEntries.mockResolvedValue([entry]);
  journalMocks.deleteEntry.mockResolvedValue(true);
});

describe("JournalView", () => {
  it("renders validated local observation data accessibly without implying server storage", async () => {
    const { container } = render(<JournalView />);

    expect(await screen.findByRole("heading", { name: "Orion test" })).toBeVisible();
    expect(screen.getByText(/only in this browser's local IndexedDB/i)).toBeVisible();
    expect(screen.getByText(/Back garden/i)).toBeVisible();
    expect(screen.getByText(/82\.500000° RA, -6\.200000° Dec/i)).toBeVisible();
    expect(screen.getByText("Orion Nebula")).toBeVisible();
    expect(screen.getByText("Retained in this browser")).toBeVisible();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("deletes the local entry only after explicit confirmation", async () => {
    const user = userEvent.setup();
    render(<JournalView />);
    await screen.findByRole("heading", { name: "Orion test" });

    await user.click(screen.getByRole("button", { name: "Delete local journal entry" }));
    expect(screen.getByRole("button", { name: "Confirm local delete" })).toBeVisible();
    journalMocks.listEntries.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Confirm local delete" }));

    await waitFor(() => expect(journalMocks.deleteEntry).toHaveBeenCalledWith(entry.id));
    expect(await screen.findByRole("heading", { name: "No journal entries yet" })).toBeVisible();
  });

  it("shows an honest unavailable state instead of silently discarding local data", async () => {
    journalMocks.listEntries.mockRejectedValue({ reason: "storage-corrupted" });
    render(<JournalView />);

    expect(await screen.findByRole("heading", { name: "Local journal unavailable" })).toBeVisible();
    expect(screen.getByText(/left the local bytes untouched/i)).toBeVisible();
  });
});
