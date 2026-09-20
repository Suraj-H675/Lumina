import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { JournalMessages } from "../src/lib/i18n/messages/types";

const transferMocks = vi.hoisted(() => ({
  apply: vi.fn(),
  createExport: vi.fn(),
  parse: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("../src/lib/journal/export", () => ({
  JournalExportError: class JournalExportError extends Error {
    code = "JOURNAL_IMPORT_INVALID";
  },
  MAX_JOURNAL_IMPORT_BYTES: 64 * 1024 * 1024,
  applyJournalImportPreview: transferMocks.apply,
  createJournalExport: transferMocks.createExport,
  parseJournalExport: transferMocks.parse,
  previewJournalImport: transferMocks.preview,
}));

import { JournalTransferControls } from "../src/app/journal/journal-transfer-controls";

function renderTransfer(
  onImported = vi.fn(),
  messages: JournalMessages["transfer"] = enMessages.journal.transfer,
) {
  return render(
    <JournalTransferControls locale={DEFAULT_LOCALE} messages={messages} onImported={onImported} />,
  );
}

const bundle = { attachments: [], entries: [], exported_at: "2026-09-16T16:00:00.000Z" };
const conflict = {
  id: "11000000-0000-4000-8000-000000000001",
  incoming_updated_at: "2026-09-16T16:00:00.000Z",
  local_updated_at: "2026-09-16T15:00:00.000Z",
  recommendation: "use_imported" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  transferMocks.createExport.mockResolvedValue('{"format":"lumina-personal-data"}');
  transferMocks.parse.mockResolvedValue(bundle);
  transferMocks.preview.mockResolvedValue({
    added_ids: [],
    conflicts: [],
    exported_at: bundle.exported_at,
  });
  transferMocks.apply.mockResolvedValue({ added: 0, kept_local: 0, replaced: 0 });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:journal-export"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("JournalTransferControls", () => {
  it("warns that portable exports may contain sensitive local data and passes axe", async () => {
    const { container } = renderTransfer();
    expect(
      screen.getByText(/can contain your notes, explicitly confirmed location\/time/i),
    ).toBeVisible();
    expect(screen.getByText(/Existing entries are never silently overwritten/i)).toBeVisible();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("downloads a validated local export and revokes its temporary object URL", async () => {
    const user = userEvent.setup();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderTransfer();

    await user.click(screen.getByRole("button", { name: "Export local journal" }));

    expect(transferMocks.createExport).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:journal-export");
    click.mockRestore();
  });

  it("rejects an oversized import before parsing untrusted bytes", async () => {
    const user = userEvent.setup();
    renderTransfer();
    const file = new File(["{}"], "journal.json", { type: "application/json" });
    Object.defineProperty(file, "size", { configurable: true, value: 64 * 1024 * 1024 + 1 });

    await user.upload(screen.getByLabelText("Import a Lumina journal file"), file);

    expect(screen.getByRole("status")).toHaveTextContent(/empty or exceeds/i);
    expect(transferMocks.parse).not.toHaveBeenCalled();
  });

  it("requires an explicit decision for every conflict before applying", async () => {
    const user = userEvent.setup();
    transferMocks.preview.mockResolvedValue({
      added_ids: ["11000000-0000-4000-8000-000000000002"],
      conflicts: [conflict],
      exported_at: bundle.exported_at,
    });
    const onImported = vi.fn();
    renderTransfer(onImported);

    await user.upload(
      screen.getByLabelText("Import a Lumina journal file"),
      new File(["{}"], "journal.json", { type: "application/json" }),
    );
    expect(await screen.findByRole("heading", { name: "Import preview" })).toBeVisible();
    expect(screen.getByText("1 new entry")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Apply reviewed import" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      /Resolve every journal conflict before importing/i,
    );
    expect(transferMocks.apply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Keep local" }));
    transferMocks.apply.mockResolvedValue({ added: 1, kept_local: 1, replaced: 0 });
    await user.click(screen.getByRole("button", { name: "Apply reviewed import" }));

    await waitFor(() => expect(transferMocks.apply).toHaveBeenCalledOnce());
    const decisions = transferMocks.apply.mock.calls[0]?.[2] as Map<string, string>;
    expect(decisions.get(conflict.id)).toBe("keep_local");
    expect(onImported).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(/1 added, 0 replaced, 1 kept local/i);
  });

  it("reports a validation failure without applying anything", async () => {
    transferMocks.parse.mockRejectedValue(new Error("bad"));
    renderTransfer();
    const input = screen.getByLabelText("Import a Lumina journal file");

    fireEvent.change(input, {
      target: { files: [new File(["bad"], "bad.json", { type: "application/json" })] },
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/could not be validated/i);
    expect(transferMocks.apply).not.toHaveBeenCalled();
  });

  it("localizes transfer controls without rewriting conflict identifiers or timestamps", async () => {
    const user = userEvent.setup();
    transferMocks.preview.mockResolvedValue({
      added_ids: [],
      conflicts: [conflict],
      exported_at: bundle.exported_at,
    });
    const messages = {
      ...enMessages.journal.transfer,
      importPreviewTitle: "Localized import preview",
      keepLocal: "Localized keep local",
      title: "Localized journal transfer",
    } satisfies JournalMessages["transfer"];

    renderTransfer(vi.fn(), messages);
    expect(screen.getByRole("heading", { name: "Localized journal transfer" })).toBeVisible();

    await user.upload(
      screen.getByLabelText(messages.importFileLabel),
      new File(["{}"], "journal.json", { type: "application/json" }),
    );

    expect(await screen.findByRole("heading", { name: "Localized import preview" })).toBeVisible();
    expect(screen.getByText(new RegExp(conflict.id, "u"))).toBeVisible();
    expect(screen.getByRole("radio", { name: "Localized keep local" })).toBeVisible();
    expect(screen.getByText(/Sep 16, 2026/)).toBeVisible();
  });
});
