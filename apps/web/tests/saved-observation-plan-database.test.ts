// @vitest-environment node

import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LUMINA_PERSONAL_DATABASE_VERSION,
  LUMINA_PERSONAL_DB_NAME,
  clearSavedObservationPlans,
  closeJournalDatabase,
  createJournalEntryInDatabase,
  deleteSavedObservationPlan,
  getSavedObservationPlan,
  listJournalAttachments,
  listJournalEntries,
  listSavedObservationPlans,
  putSavedObservationPlan,
} from "../src/lib/journal/database";
import { createJournalEntry, validateJournalEntry } from "../src/lib/journal/model";
import { MAX_SAVED_OBSERVATION_PLANS } from "../src/lib/observation/saved-plan";
import { savedObservationPlanFixture } from "./saved-observation-plan-fixture";

const V1_SCHEMA = {
  journalAttachments: "&id, journal_entry_id, created_at",
  journalEntries: "&id, updated_at, created_at",
} as const;

const V2_SCHEMA = {
  ...V1_SCHEMA,
  savedPlans: "&id, updated_at, created_at",
} as const;

async function deletePersonalDatabase(): Promise<void> {
  await closeJournalDatabase();
  await Dexie.delete(LUMINA_PERSONAL_DB_NAME);
}

beforeEach(deletePersonalDatabase);
afterEach(deletePersonalDatabase);

describe("saved observation plans in lumina-personal IndexedDB", () => {
  it("upgrades a populated v1 database to v2 without changing journal rows or attachments", async () => {
    const entryId = "11000000-0000-4000-8000-000000000001";
    const attachmentId = "12000000-0000-4000-8000-000000000001";
    const timestamp = "2026-09-18T15:00:00.000Z";
    const baseEntry = createJournalEntry({ title: "Legacy journal" }, entryId, timestamp);
    const entry = validateJournalEntry({ ...baseEntry, attachment_ids: [attachmentId] });
    if (entry === null) throw new Error("legacy fixture is invalid");
    const attachment = {
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      byte_size: 3,
      created_at: timestamp,
      id: attachmentId,
      journal_entry_id: entryId,
      mime_type: "image/png",
      schema_version: 1,
      sha256: "a".repeat(64),
      updated_at: timestamp,
    };

    const legacy = new Dexie(LUMINA_PERSONAL_DB_NAME);
    legacy.version(1).stores(V1_SCHEMA);
    await legacy.open();
    await legacy.table("journalEntries").add(entry);
    await legacy.table("journalAttachments").add(attachment);
    legacy.close();

    expect(LUMINA_PERSONAL_DATABASE_VERSION).toBe(2);
    expect(await listJournalEntries()).toEqual([entry]);
    const migratedAttachments = await listJournalAttachments();
    expect(migratedAttachments).toHaveLength(1);
    expect(migratedAttachments[0]).toMatchObject({
      byte_size: 3,
      id: attachmentId,
      journal_entry_id: entryId,
      sha256: "a".repeat(64),
    });
    expect(await migratedAttachments[0]!.blob.arrayBuffer()).toEqual(
      new Uint8Array([1, 2, 3]).buffer,
    );
    expect(await listSavedObservationPlans()).toEqual([]);
  });

  it("creates, orders, reads, deletes, and clears validated saved snapshots", async () => {
    const first = savedObservationPlanFixture(1, "2026-09-19T14:00:00.000Z");
    const second = savedObservationPlanFixture(2, "2026-09-19T15:00:00.000Z");
    await putSavedObservationPlan(first);
    await putSavedObservationPlan(second);

    expect((await listSavedObservationPlans()).map((plan) => plan.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(await getSavedObservationPlan(first.id)).toEqual(first);
    expect(await deleteSavedObservationPlan(first.id)).toBe(true);
    expect(await deleteSavedObservationPlan(first.id)).toBe(false);
    expect(await getSavedObservationPlan(first.id)).toBeNull();

    await clearSavedObservationPlans();
    expect(await listSavedObservationPlans()).toEqual([]);
  });

  it("keeps journal data separate when saved plans are cleared", async () => {
    const journal = await createJournalEntryInDatabase({ title: "Keep journal" });
    await putSavedObservationPlan(savedObservationPlanFixture());

    await clearSavedObservationPlans();

    expect(await listSavedObservationPlans()).toEqual([]);
    expect((await listJournalEntries()).map((entry) => entry.id)).toEqual([journal.id]);
  });

  it("rejects malformed identifiers and corrupted saved rows without silently deleting them", async () => {
    const saved = savedObservationPlanFixture();
    await putSavedObservationPlan(saved);
    await closeJournalDatabase();

    const raw = new Dexie(LUMINA_PERSONAL_DB_NAME);
    raw.version(2).stores(V2_SCHEMA);
    await raw.open();
    await raw.table("savedPlans").put({ ...saved, hidden_field: "corrupt" });
    raw.close();

    await expect(getSavedObservationPlan("not-a-uuid")).rejects.toMatchObject({
      reason: "invalid-plan",
    });
    await expect(listSavedObservationPlans()).rejects.toMatchObject({
      reason: "storage-corrupted",
    });

    await closeJournalDatabase();
    const verify = new Dexie(LUMINA_PERSONAL_DB_NAME);
    verify.version(2).stores(V2_SCHEMA);
    await verify.open();
    expect(await verify.table("savedPlans").count()).toBe(1);
    verify.close();
  });

  it("enforces the fifty-plan cap while allowing an existing plan to be replaced", async () => {
    for (let index = 1; index <= MAX_SAVED_OBSERVATION_PLANS; index += 1) {
      await putSavedObservationPlan(savedObservationPlanFixture(index));
    }
    expect(await listSavedObservationPlans()).toHaveLength(MAX_SAVED_OBSERVATION_PLANS);

    const first = savedObservationPlanFixture(1, "2026-09-19T16:00:00.000Z");
    await expect(putSavedObservationPlan(first)).resolves.toBeUndefined();
    await expect(
      putSavedObservationPlan(savedObservationPlanFixture(MAX_SAVED_OBSERVATION_PLANS + 1)),
    ).rejects.toMatchObject({ reason: "plan-limit" });
  });
});
