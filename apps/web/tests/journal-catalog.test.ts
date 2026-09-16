import { describe, expect, it } from "vitest";

import { catalogJournalEntryInput } from "../src/lib/journal/catalog";
import { createJournalEntry, JournalValidationError } from "../src/lib/journal/model";

const CATALOG_ENTITY_ID = "403d0e71-8d81-5c52-abad-c4666c1b5cd6";
const JOURNAL_ENTRY_ID = "8b2f8133-c4fd-47ad-8618-602946cd4d48";
const NOW = "2026-09-16T16:30:00.000Z";

describe("catalog journal adapter", () => {
  it("accepts a catalogue UUIDv5 identity while keeping the local entry id UUIDv4", () => {
    const entry = createJournalEntry(
      catalogJournalEntryInput({
        entityId: CATALOG_ENTITY_ID,
        location: null,
        notes: "",
        objectName: "K2-18",
        observationTimeUtc: null,
        title: "K2-18 observation",
      }),
      JOURNAL_ENTRY_ID,
      NOW,
    );

    expect(entry.id).toBe(JOURNAL_ENTRY_ID);
    expect(entry.objects).toEqual([
      { entity_id: CATALOG_ENTITY_ID, name: "K2-18", source: "catalog" },
    ]);
    expect(entry.observed_time).toBeNull();
    expect(entry.location).toBeNull();
  });

  it("maps only explicitly supplied confirmed time and location", () => {
    const entry = createJournalEntry(
      catalogJournalEntryInput({
        entityId: CATALOG_ENTITY_ID,
        location: {
          confirmed_by_user: true,
          label: "Planner coordinates",
          latitude_deg: 12.972,
          longitude_deg: 77.594,
        },
        notes: "Clear sky",
        objectName: "K2-18",
        observationTimeUtc: "2026-09-16T16:30:00.000Z",
        title: "Observed K2-18",
      }),
      JOURNAL_ENTRY_ID,
      NOW,
    );

    expect(entry.observed_time).toEqual({
      confirmed_by_user: true,
      utc: "2026-09-16T16:30:00.000Z",
    });
    expect(entry.location).toEqual({
      confirmed_by_user: true,
      label: "Planner coordinates",
      latitude_deg: 12.972,
      longitude_deg: 77.594,
    });
  });

  it("rejects a malformed catalogue identity instead of silently dropping it", () => {
    expect(() =>
      createJournalEntry(
        catalogJournalEntryInput({
          entityId: "not-a-catalog-uuid",
          location: null,
          notes: "",
          objectName: "K2-18",
          observationTimeUtc: null,
          title: "K2-18 observation",
        }),
        JOURNAL_ENTRY_ID,
        NOW,
      ),
    ).toThrow(JournalValidationError);
  });
});
