import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentificationSolutionResponse } from "@lumina/api-client";

const databaseMocks = vi.hoisted(() => ({
  attachJournalImage: vi.fn(),
  createJournalEntryInDatabase: vi.fn(),
  deleteJournalEntry: vi.fn(),
}));

vi.mock("../src/lib/journal/database", () => databaseMocks);

import {
  IdentificationJournalSaveError,
  identificationJournalEntryInput,
  saveIdentificationSolutionToJournal,
} from "../src/lib/journal/identification";

const SUBMISSION_ID = "71000000-0000-4000-8000-000000000001";
const ENTRY_ID = "11000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "12000000-0000-4000-8000-000000000001";
const COMPLETED_AT = "2026-09-16T15:04:00.000Z";

function solution(annotationCount = 2): IdentificationSolutionResponse {
  return {
    annotations: Array.from({ length: annotationCount }, (_, index) => ({
      category: "object",
      dec_deg: 41 + index / 1000,
      names: [`Object ${index}`],
      pixel_x: 10 + index,
      pixel_y: 20 + index,
      ra_deg: 10 + index / 1000,
    })),
    calibration: {
      center_dec_deg: 41.269,
      center_ra_deg: 10.685,
      orientation_deg: 12.5,
      parity: 1,
      pixel_scale_arcsec_per_pixel: 2.1,
      radius_deg: 1.4,
    },
    has_more: annotationCount > 50,
    next_cursor: annotationCount > 50 ? "cursor" : null,
    remote_processing: true,
    solver_name: "astrometry.net-nova",
    solver_type: "nova",
    solver_version: "nova-v1",
    submission_id: SUBMISSION_ID,
    wcs: {
      coordinate_frame: "fk5_j2000",
      header: "CTYPE1  = 'RA---TAN'",
      image_height: 512,
      image_width: 640,
      source_sha256: "a".repeat(64),
    },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    attachImage: false,
    camera: "APS-C camera",
    completedAt: COMPLETED_AT,
    conditions: "Clear",
    latitudeDeg: 12.9716,
    locationLabel: "Back garden",
    longitudeDeg: 77.5946,
    notes: "Broad core visible.",
    observationTimeUtc: "2026-09-16T15:00:00.000Z",
    solution: solution(),
    sourceImage: null,
    telescope: "100 mm refractor",
    title: "Andromeda test",
    ...overrides,
  } as Parameters<typeof identificationJournalEntryInput>[0];
}

describe("identification journal adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.createJournalEntryInDatabase.mockResolvedValue({ id: ENTRY_ID });
    databaseMocks.attachJournalImage.mockResolvedValue({
      id: "13000000-0000-4000-8000-000000000001",
    });
    databaseMocks.deleteJournalEntry.mockResolvedValue(true);
  });

  it("maps only normalized Lumina science and explicit user-confirmed metadata", () => {
    const mapped = identificationJournalEntryInput(input(), SNAPSHOT_ID);

    expect(mapped.observed_time).toEqual({
      confirmed_by_user: true,
      utc: "2026-09-16T15:00:00.000Z",
    });
    expect(mapped.location).toEqual({
      confirmed_by_user: true,
      label: "Back garden",
      latitude_deg: 12.9716,
      longitude_deg: 77.5946,
    });
    expect(mapped.equipment).toEqual(["Telescope: 100 mm refractor", "Camera: APS-C camera"]);
    expect(mapped.plate_solve).toMatchObject({
      center_dec_deg: 41.269,
      center_ra_deg: 10.685,
      frame: "FK5 J2000",
      parity: "positive",
      snapshot_id: SNAPSHOT_ID,
      wcs_source_sha256: "a".repeat(64),
    });
    expect(JSON.stringify(mapped)).not.toContain(SUBMISSION_ID);
    expect(JSON.stringify(mapped)).not.toMatch(/nova_submission|provider_job|api_key/iu);
  });

  it("preserves unique loaded annotation labels, including aliases, within the local bound", () => {
    const aliased = solution(2);
    aliased.annotations[1]!.names = ["Orion Nebula", "M42", "orion nebula"];
    const mapped = identificationJournalEntryInput(input({ solution: aliased }), SNAPSHOT_ID);

    expect(mapped.objects).toEqual([
      { entity_id: null, name: "Object 0", source: "plate_annotation" },
      { entity_id: null, name: "Orion Nebula", source: "plate_annotation" },
      { entity_id: null, name: "M42", source: "plate_annotation" },
    ]);
  });

  it("caps provider annotation labels at the local journal object bound", () => {
    const mapped = identificationJournalEntryInput(input({ solution: solution(150) }), SNAPSHOT_ID);
    expect(mapped.objects).toHaveLength(100);
    expect(mapped.objects?.[0]).toEqual({
      entity_id: null,
      name: "Object 0",
      source: "plate_annotation",
    });
  });

  it("saves without persisting the source image unless the user explicitly opts in", async () => {
    await expect(saveIdentificationSolutionToJournal(input())).resolves.toEqual({ id: ENTRY_ID });
    expect(databaseMocks.createJournalEntryInDatabase).toHaveBeenCalledOnce();
    expect(databaseMocks.attachJournalImage).not.toHaveBeenCalled();
  });

  it("persists a filename-free local attachment only after explicit opt-in", async () => {
    const sourceImage = new File([new Uint8Array([1, 2, 3])], "private-name.png", {
      type: "image/png",
    });
    await saveIdentificationSolutionToJournal(input({ attachImage: true, sourceImage }));
    expect(databaseMocks.attachJournalImage).toHaveBeenCalledWith(ENTRY_ID, sourceImage);
    expect(databaseMocks.deleteJournalEntry).not.toHaveBeenCalled();
  });

  it("rolls back the entry when an opted-in attachment cannot be written", async () => {
    const sourceImage = new File([new Uint8Array([1])], "private-name.png", { type: "image/png" });
    databaseMocks.attachJournalImage.mockRejectedValue({ reason: "storage-write-failed" });

    await expect(
      saveIdentificationSolutionToJournal(input({ attachImage: true, sourceImage })),
    ).rejects.toMatchObject({
      reason: "storage-write-failed",
    });
    expect(databaseMocks.deleteJournalEntry).toHaveBeenCalledWith(ENTRY_ID);
  });

  it("rejects partial coordinates before touching storage", async () => {
    await expect(
      saveIdentificationSolutionToJournal(input({ latitudeDeg: 12, longitudeDeg: null })),
    ).rejects.toBeInstanceOf(IdentificationJournalSaveError);
    expect(databaseMocks.createJournalEntryInDatabase).not.toHaveBeenCalled();
  });
});
