// @vitest-environment node

import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  attachJournalImage,
  clearJournalDatabase,
  closeJournalDatabase,
  createJournalEntryInDatabase,
  deleteJournalEntry,
  getJournalAttachment,
  getJournalEntry,
  listJournalEntries,
  validateJournalImageAttachment,
} from "../src/lib/journal/database";

beforeEach(async () => {
  await clearJournalDatabase();
});

afterEach(async () => {
  await clearJournalDatabase();
  await closeJournalDatabase();
});

describe("journal IndexedDB", () => {
  it("creates, reads, and orders validated local entries", async () => {
    const first = await createJournalEntryInDatabase({ title: "First night" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createJournalEntryInDatabase({ title: "Second night" });

    expect((await getJournalEntry(first.id))?.title).toBe("First night");
    expect((await listJournalEntries()).map((entry) => entry.id)).toEqual([second.id, first.id]);
  });

  it("stores a browser File as a filename-free Blob and links it atomically", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Local image" });
    const file = new File([new Uint8Array([1, 2, 3, 4])], "secret-night-field.png", {
      type: "image/png",
    });

    const attachment = await attachJournalImage(entry.id, file);
    const persisted = await getJournalAttachment(attachment.id);
    const updated = await getJournalEntry(entry.id);

    expect(persisted).not.toBeNull();
    expect(persisted?.blob).toBeInstanceOf(Blob);
    expect(persisted?.blob).not.toBeInstanceOf(File);
    expect(persisted?.blob.type).toBe("image/png");
    expect(persisted?.byte_size).toBe(4);
    expect("name" in (persisted?.blob ?? {})).toBe(false);
    expect(updated?.attachment_ids).toEqual([attachment.id]);
  });

  it("deletes an entry and its local image attachments in one operation", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Delete me" });
    const attachment = await attachJournalImage(
      entry.id,
      new Blob([new Uint8Array([9])], { type: "image/jpeg" }),
    );

    await expect(deleteJournalEntry(entry.id)).resolves.toBe(true);
    await expect(deleteJournalEntry(entry.id)).resolves.toBe(false);
    await expect(getJournalEntry(entry.id)).resolves.toBeNull();
    await expect(getJournalAttachment(attachment.id)).resolves.toBeNull();
  });

  it("rejects unsupported or empty attachments before writing", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Attachment checks" });

    await expect(
      attachJournalImage(entry.id, new Blob(["hello"], { type: "text/plain" })),
    ).rejects.toMatchObject({ reason: "invalid-attachment" });
    await expect(
      attachJournalImage(entry.id, new Blob([], { type: "image/png" })),
    ).rejects.toMatchObject({ reason: "invalid-attachment" });
    expect((await getJournalEntry(entry.id))?.attachment_ids).toEqual([]);
  });

  it("rejects an attachment when the parent journal entry does not exist", async () => {
    await expect(
      attachJournalImage(
        "11000000-0000-4000-8000-000000000009",
        new Blob([new Uint8Array([1])], { type: "image/png" }),
      ),
    ).rejects.toMatchObject({ reason: "entry-not-found" });
  });

  it("rejects malformed identifiers before querying IndexedDB", async () => {
    await expect(getJournalEntry("not-a-uuid")).rejects.toMatchObject({
      reason: "invalid-entry",
    });
    await expect(getJournalAttachment("not-a-uuid")).rejects.toMatchObject({
      reason: "invalid-attachment",
    });
  });

  it("rejects unknown attachment fields and noncanonical timestamp metadata", () => {
    const base = {
      blob: new Blob([new Uint8Array([1])], { type: "image/png" }),
      byte_size: 1,
      created_at: "2026-09-16T16:00:00.000Z",
      id: "12000000-0000-4000-8000-000000000001",
      journal_entry_id: "11000000-0000-4000-8000-000000000001",
      mime_type: "image/png" as const,
      schema_version: 1 as const,
      sha256: "a".repeat(64),
      updated_at: "2026-09-16T16:00:00.000Z",
    };

    expect(validateJournalImageAttachment(base)).not.toBeNull();
    expect(validateJournalImageAttachment({ ...base, filename: "private.png" })).toBeNull();
    expect(
      validateJournalImageAttachment({ ...base, created_at: "2026-09-16T16:00:00Z" }),
    ).toBeNull();
    expect(
      validateJournalImageAttachment({
        ...base,
        created_at: "2026-09-16T16:00:01.000Z",
        updated_at: "2026-09-16T16:00:00.000Z",
      }),
    ).toBeNull();
  });
});
