// @vitest-environment node

import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  attachJournalImage,
  clearJournalDatabase,
  closeJournalDatabase,
  createJournalEntryInDatabase,
  getJournalAttachment,
  getJournalEntry,
  putValidatedJournalEntry,
} from "../src/lib/journal/database";
import {
  JournalExportError,
  applyJournalImportPreview,
  createJournalExport,
  parseJournalExport,
  previewJournalImport,
} from "../src/lib/journal/export";

const EXPORTED_AT = "2026-09-16T16:00:00.000Z";
const IMPORTED_AT = "2026-09-16T17:00:00.000Z";

beforeEach(async () => {
  await clearJournalDatabase();
});

afterEach(async () => {
  await clearJournalDatabase();
  await closeJournalDatabase();
});

describe("journal export/import", () => {
  it("round-trips validated entries and filename-free local image attachments", async () => {
    const entry = await createJournalEntryInDatabase({
      notes: "Local observation",
      title: "Export round trip",
    });
    const attachment = await attachJournalImage(
      entry.id,
      new File([new Uint8Array([1, 2, 3, 4])], "private-field-name.png", {
        type: "image/png",
      }),
    );

    const raw = await createJournalExport(EXPORTED_AT);
    expect(raw).not.toContain("private-field-name.png");
    const bundle = await parseJournalExport(raw);
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.attachments).toHaveLength(1);
    expect(bundle.attachments[0]?.sha256).toBe(attachment.sha256);

    await clearJournalDatabase();
    const preview = await previewJournalImport(bundle);
    expect(preview.added_ids).toEqual([entry.id]);
    expect(preview.conflicts).toEqual([]);

    await expect(
      applyJournalImportPreview(bundle, preview, new Map(), IMPORTED_AT),
    ).resolves.toEqual({ added: 1, kept_local: 0, replaced: 0 });

    const restored = await getJournalEntry(entry.id);
    expect(restored?.title).toBe("Export round trip");
    expect(restored?.import_provenance).toEqual({
      exported_at: EXPORTED_AT,
      imported_at: IMPORTED_AT,
    });
    const restoredAttachment = await getJournalAttachment(attachment.id);
    expect(restoredAttachment?.blob.type).toBe("image/png");
    expect([...new Uint8Array(await restoredAttachment!.blob.arrayBuffer())]).toEqual([1, 2, 3, 4]);
    expect("name" in restoredAttachment!.blob).toBe(false);
  });

  it("rejects tampered journal bytes before any import planning", async () => {
    await createJournalEntryInDatabase({ title: "Checksum source" });
    const raw = await createJournalExport(EXPORTED_AT);
    const parsed = JSON.parse(raw) as {
      sections: { journal: { entries: Array<{ title: string }> } };
    };
    parsed.sections.journal.entries[0]!.title = "Tampered";

    await expect(parseJournalExport(JSON.stringify(parsed))).rejects.toBeInstanceOf(
      JournalExportError,
    );
  });

  it("requires an explicit decision for every conflicting local entry", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Conflict source" });
    const bundle = await parseJournalExport(await createJournalExport(EXPORTED_AT));
    const preview = await previewJournalImport(bundle);

    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0]?.id).toBe(entry.id);
    await expect(
      applyJournalImportPreview(bundle, preview, new Map(), IMPORTED_AT),
    ).rejects.toMatchObject({ code: "JOURNAL_IMPORT_CONFLICT_UNRESOLVED" });
  });

  it("keeps the local entry when the user resolves a conflict that way", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Keep local" });
    const bundle = await parseJournalExport(await createJournalExport(EXPORTED_AT));
    const preview = await previewJournalImport(bundle);
    const decisions = new Map([[entry.id, "keep_local" as const]]);

    await expect(
      applyJournalImportPreview(bundle, preview, decisions, IMPORTED_AT),
    ).resolves.toEqual({ added: 0, kept_local: 1, replaced: 0 });
    expect((await getJournalEntry(entry.id))?.import_provenance).toBeNull();
  });

  it("rejects a stale import preview if local data changed after review", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Stale preview" });
    const bundle = await parseJournalExport(await createJournalExport(EXPORTED_AT));
    const preview = await previewJournalImport(bundle);
    const changed = {
      ...entry,
      notes: "Changed after preview",
      updated_at: new Date(new Date(entry.updated_at).getTime() + 1_000).toISOString(),
    };
    await putValidatedJournalEntry(changed);

    const decisions = new Map([[entry.id, "use_imported" as const]]);
    await expect(
      applyJournalImportPreview(bundle, preview, decisions, IMPORTED_AT),
    ).rejects.toMatchObject({ code: "JOURNAL_IMPORT_PREVIEW_STALE" });
  });

  it("refuses an export when an entry references a missing local attachment", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Missing attachment" });
    await putValidatedJournalEntry({
      ...entry,
      attachment_ids: ["12000000-0000-4000-8000-000000000099"],
      updated_at: new Date(new Date(entry.updated_at).getTime() + 1_000).toISOString(),
    });

    await expect(createJournalExport(EXPORTED_AT)).rejects.toMatchObject({
      code: "JOURNAL_EXPORT_INVALID",
    });
  });

  it("refuses an export when a local attachment is orphaned from its entry", async () => {
    const entry = await createJournalEntryInDatabase({ title: "Orphan attachment" });
    await attachJournalImage(
      entry.id,
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    );
    const linked = await getJournalEntry(entry.id);
    expect(linked).not.toBeNull();
    await putValidatedJournalEntry({
      ...linked!,
      attachment_ids: [],
      updated_at: new Date(new Date(linked!.updated_at).getTime() + 1_000).toISOString(),
    });

    await expect(createJournalExport(EXPORTED_AT)).rejects.toMatchObject({
      code: "JOURNAL_EXPORT_INVALID",
    });
  });
});
