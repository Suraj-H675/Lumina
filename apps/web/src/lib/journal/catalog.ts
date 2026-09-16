"use client";

import { createJournalEntryInDatabase } from "./database";
import {
  type ConfirmedJournalLocation,
  type ConfirmedObservationTime,
  type JournalEntry,
  type JournalEntryInput,
} from "./model";

export type CatalogJournalInput = Readonly<{
  entityId: string;
  objectName: string;
  title: string;
  notes: string;
  observationTimeUtc: string | null;
  location: ConfirmedJournalLocation | null;
}>;

/**
 * Maps an accepted catalogue identity plus only user-confirmed observation
 * metadata into the shared local journal contract. Catalogue pages never
 * invent time, place, or observing conditions.
 */
export function catalogJournalEntryInput(input: CatalogJournalInput): JournalEntryInput {
  const observedTime: ConfirmedObservationTime | null =
    input.observationTimeUtc === null
      ? null
      : { confirmed_by_user: true, utc: input.observationTimeUtc };
  return {
    location: input.location,
    notes: input.notes,
    objects: [{ entity_id: input.entityId, name: input.objectName, source: "catalog" }],
    observed_time: observedTime,
    title: input.title,
  };
}

export async function saveCatalogObservationToJournal(
  input: CatalogJournalInput,
): Promise<JournalEntry> {
  return createJournalEntryInDatabase(catalogJournalEntryInput(input));
}
