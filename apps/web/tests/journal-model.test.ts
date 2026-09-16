import { describe, expect, it } from "vitest";

import {
  JournalValidationError,
  canonicalUtcTimestamp,
  createJournalEntry,
  journalEntryWithImportProvenance,
  validateJournalEntry,
} from "../src/lib/journal/model";

const ENTRY_ID = "11000000-0000-4000-8000-000000000001";
const SNAPSHOT_ID = "12000000-0000-4000-8000-000000000001";
const ATTACHMENT_ID = "13000000-0000-4000-8000-000000000001";
const NOW = "2026-09-16T16:00:00.000Z";

function validEntry() {
  return createJournalEntry(
    {
      attachment_ids: [ATTACHMENT_ID],
      conditions: "Clear with mild haze",
      equipment: ["100 mm refractor", "APS-C camera"],
      follow_up: true,
      location: {
        confirmed_by_user: true,
        label: "Back garden",
        latitude_deg: 12.9716,
        longitude_deg: 77.5946,
      },
      notes: "M31 showed a broad core.",
      objects: [{ entity_id: null, name: "Messier 31", source: "plate_annotation" }],
      observed_time: { confirmed_by_user: true, utc: "2026-09-16T15:00:00Z" },
      plate_solve: {
        center_dec_deg: 41.269,
        center_ra_deg: 10.685,
        frame: "FK5 J2000",
        orientation_deg: 12.5,
        parity: "positive",
        pixel_scale_arcsec: 2.1,
        radius_deg: 1.4,
        snapshot_id: SNAPSHOT_ID,
        solved_at: "2026-09-16T15:04:00Z",
        solver_version: "nova-v1",
        wcs_source_sha256: "a".repeat(64),
      },
      rating: 4,
      tags: ["galaxy", "wide field"],
      title: "  Andromeda   test  ",
    },
    ENTRY_ID,
    NOW,
  );
}

describe("journal model", () => {
  it("normalizes a private local journal entry and canonicalizes confirmed timestamps", () => {
    const entry = validEntry();

    expect(entry.title).toBe("Andromeda test");
    expect(entry.observed_time?.utc).toBe("2026-09-16T15:00:00.000Z");
    expect(entry.plate_solve?.solved_at).toBe("2026-09-16T15:04:00.000Z");
    expect(entry.location?.confirmed_by_user).toBe(true);
    expect(entry.import_provenance).toBeNull();
    expect(validateJournalEntry(structuredClone(entry))).toEqual(entry);
  });

  it("requires explicit confirmation for persisted observation time and location", () => {
    const entry = validEntry();
    expect(
      validateJournalEntry({
        ...entry,
        observed_time: { confirmed_by_user: false, utc: NOW },
      }),
    ).toBeNull();
    expect(
      validateJournalEntry({
        ...entry,
        location: {
          confirmed_by_user: false,
          label: "EXIF location",
          latitude_deg: 1,
          longitude_deg: 2,
        },
      }),
    ).toBeNull();
  });

  it("rejects partial or out-of-range exact coordinates", () => {
    const entry = validEntry();
    expect(
      validateJournalEntry({
        ...entry,
        location: {
          confirmed_by_user: true,
          label: "Somewhere",
          latitude_deg: 12,
          longitude_deg: null,
        },
      }),
    ).toBeNull();
    expect(
      validateJournalEntry({
        ...entry,
        location: {
          confirmed_by_user: true,
          label: "Somewhere",
          latitude_deg: 95,
          longitude_deg: 20,
        },
      }),
    ).toBeNull();
  });

  it("rejects provider-shaped or unknown fields instead of silently retaining them", () => {
    const entry = validEntry();
    expect(validateJournalEntry({ ...entry, provider_job_id: 1234 })).toBeNull();
    expect(
      validateJournalEntry({
        ...entry,
        plate_solve: { ...entry.plate_solve, nova_submission_id: 999 },
      }),
    ).toBeNull();
  });

  it("rejects duplicate object and tag entries", () => {
    const entry = validEntry();
    expect(
      validateJournalEntry({ ...entry, objects: [...entry.objects, entry.objects[0]] }),
    ).toBeNull();
    expect(validateJournalEntry({ ...entry, tags: ["galaxy", "galaxy"] })).toBeNull();
  });

  it("rejects malformed local ids and impossible plate-solve values", () => {
    expect(() => createJournalEntry({ title: "Test" }, "not-a-uuid", NOW)).toThrow(
      JournalValidationError,
    );
    const entry = validEntry();
    expect(
      validateJournalEntry({
        ...entry,
        plate_solve: { ...entry.plate_solve, center_dec_deg: 91 },
      }),
    ).toBeNull();
  });

  it("records import provenance without changing the original scientific snapshot", () => {
    const entry = validEntry();
    const imported = journalEntryWithImportProvenance(
      entry,
      "2026-09-16T17:00:00Z",
      "2026-09-16T18:00:00Z",
    );

    expect(imported.import_provenance).toEqual({
      exported_at: "2026-09-16T17:00:00.000Z",
      imported_at: "2026-09-16T18:00:00.000Z",
    });
    expect(imported.plate_solve).toEqual(entry.plate_solve);
  });

  it("rejects invalid timestamp text instead of normalizing guesses", () => {
    expect(() => canonicalUtcTimestamp("not-a-date")).toThrow(JournalValidationError);
  });
});
