import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    const { container } = render(<JournalTransferControls onImported={vi.fn()} />);
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
    render(<JournalTransferControls onImported={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Export local journal" }));

    expect(transferMocks.createExport).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:journal-export");
    click.mockRestore();
  });

  it("rejects an oversized import before parsing untrusted bytes", async () => {
    const user = userEvent.setup();
    render(<JournalTransferControls onImported={vi.fn()} />);
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
    render(<JournalTransferControls onImported={onImported} />);

    await user.upload(
      screen.getByLabelText("Import a Lumina journal file"),
      new File(["{}"], "journal.json", { type: "application/json" }),
    );
    expect(await screen.findByRole("heading", { name: "Import preview" })).toBeVisible();
    expect(screen.getByText(/New entries:/i)).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Apply reviewed import" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      /Choose how to resolve every conflicting entry/i,
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
    render(<JournalTransferControls onImported={vi.fn()} />);
    const input = screen.getByLabelText("Import a Lumina journal file");

    fireEvent.change(input, {
      target: { files: [new File(["bad"], "bad.json", { type: "application/json" })] },
    });

    expect(await screen.findByRole("status")).toHaveTextContent(/could not be validated/i);
    expect(transferMocks.apply).not.toHaveBeenCalled();
  });
});
