import "fake-indexeddb/auto";

import Dexie from "dexie";
import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OfflineStorageManager } from "../src/components/offline-storage-manager";
import {
  LUMINA_PERSONAL_DB_NAME,
  closeJournalDatabase,
  createJournalEntryInDatabase,
  listJournalEntries,
  listSavedObservationPlans,
  putSavedObservationPlan,
} from "../src/lib/journal/database";
import { savedObservationPlanFixture } from "./saved-observation-plan-fixture";

const deleteCache = vi.fn();
const cacheKeys = vi.fn();

async function resetPersonalDatabase(): Promise<void> {
  await closeJournalDatabase();
  await Dexie.delete(LUMINA_PERSONAL_DB_NAME);
}

beforeEach(async () => {
  await resetPersonalDatabase();
  deleteCache.mockReset().mockResolvedValue(true);
  cacheKeys
    .mockReset()
    .mockResolvedValue(["lumina-pwa-documents-v1", "lumina-pwa-static-v1", "foreign-cache"]);
  Object.defineProperty(window, "caches", {
    configurable: true,
    value: { delete: deleteCache, keys: cacheKeys },
  });
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: {
      estimate: vi.fn().mockResolvedValue({
        quota: 100 * 1024 * 1024,
        usage: 12 * 1024 * 1024,
      }),
      persist: vi.fn(),
    },
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetPersonalDatabase();
});

describe("offline storage manager", () => {
  it("separates offline copies from personal data and labels the storage estimate as approximate", async () => {
    await putSavedObservationPlan(savedObservationPlanFixture());
    await createJournalEntryInDatabase({ title: "Keep this journal" });

    const { container } = render(<OfflineStorageManager />);

    expect(
      await screen.findByText(/approximately 12 MiB used of a 100 MiB origin quota/i),
    ).toBeVisible();
    expect(screen.getByText(/origin-wide estimate/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Offline copies" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Personal browser data" })).toBeVisible();
    expect(screen.getByText(/1 saved observation plan/i)).toBeVisible();
    expect(screen.getByText(/1 journal entry/i)).toBeVisible();
    expect(screen.getByText(/cache storage is not a backup/i)).toBeVisible();
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("clears Lumina offline copies without deleting saved plans or journal entries", async () => {
    const user = userEvent.setup();
    await putSavedObservationPlan(savedObservationPlanFixture());
    await createJournalEntryInDatabase({ title: "Keep this journal" });
    render(<OfflineStorageManager />);
    await screen.findByText(/1 saved observation plan/i);

    await user.click(screen.getByRole("button", { name: "Clear offline copies" }));
    await user.click(screen.getByRole("button", { name: "Confirm clear offline copies" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/cleared 2 lumina cache stores/i);
    expect(deleteCache.mock.calls.map(([name]) => name)).toEqual([
      "lumina-pwa-documents-v1",
      "lumina-pwa-static-v1",
    ]);
    expect(await listSavedObservationPlans()).toHaveLength(1);
    expect(await listJournalEntries()).toHaveLength(1);
  });

  it("deletes saved plans only after confirmation and leaves cache/journal data alone", async () => {
    const user = userEvent.setup();
    await putSavedObservationPlan(savedObservationPlanFixture());
    await createJournalEntryInDatabase({ title: "Keep this journal" });
    render(<OfflineStorageManager />);
    await screen.findByText(/1 saved observation plan/i);

    await user.click(screen.getByRole("button", { name: "Delete all saved plans" }));
    expect(await listSavedObservationPlans()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Confirm delete saved plans" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /deleted 1 saved observation plan/i,
    );
    expect(await listSavedObservationPlans()).toEqual([]);
    expect(await listJournalEntries()).toHaveLength(1);
    expect(deleteCache).not.toHaveBeenCalled();
  });

  it("reports cache-clear failure without changing personal data", async () => {
    const user = userEvent.setup();
    await putSavedObservationPlan(savedObservationPlanFixture());
    await createJournalEntryInDatabase({ title: "Keep this journal" });
    deleteCache.mockRejectedValue(new DOMException("blocked", "SecurityError"));
    render(<OfflineStorageManager />);
    await screen.findByText(/1 saved observation plan/i);

    await user.click(screen.getByRole("button", { name: "Clear offline copies" }));
    await user.click(screen.getByRole("button", { name: "Confirm clear offline copies" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not clear its offline copies/i,
    );
    expect(await listSavedObservationPlans()).toHaveLength(1);
    expect(await listJournalEntries()).toHaveLength(1);
  });
});
