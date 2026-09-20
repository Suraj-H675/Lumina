import "fake-indexeddb/auto";

import Dexie from "dexie";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LUMINA_PERSONAL_DB_NAME,
  closeJournalDatabase,
  putSavedObservationPlan,
} from "../src/lib/journal/database";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { savedObservationPlanFixture } from "./saved-observation-plan-fixture";

const { loadObjectMock } = vi.hoisted(() => ({
  loadObjectMock: vi.fn(),
}));

vi.mock("../src/lib/server/catalog", () => ({
  loadObjectBySlugPerRequest: loadObjectMock,
}));

vi.mock("../src/lib/server/api-origin", () => ({
  resolveWebApiOrigin: () => ({ valid: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import ObservePage from "../src/app/observe/route-page";

async function resetPersonalDatabase(): Promise<void> {
  await closeJournalDatabase();
  await Dexie.delete(LUMINA_PERSONAL_DB_NAME);
}

beforeEach(async () => {
  loadObjectMock.mockReset();
  await resetPersonalDatabase();
});

afterEach(resetPersonalDatabase);

describe("observe server route saved mode", () => {
  it("does not load the catalogue when a saved-plan id is present", async () => {
    const saved = savedObservationPlanFixture();
    await putSavedObservationPlan(saved);
    window.history.replaceState({}, "", `/observe?saved=${saved.id}`);

    const page = await ObservePage({
      catalogueSearchMessages: enMessages.catalogueSearch,
      coordinateDisclosureMessages: enMessages.coordinateDisclosure,
      entityTypeMessages: enMessages.entityTypes,
      journalEntryMessages: enMessages.journal.entry,
      plannerLocale: DEFAULT_LOCALE,
      plannerMessages: enMessages.observationPlanner,
      savedPlanLocale: DEFAULT_LOCALE,
      savedPlanMessages: enMessages.savedObservationPlan,
      searchParams: Promise.resolve({
        date: "2026-09-19",
        object: "k2-18",
        saved: saved.id,
      }),
    });
    render(page);

    expect(loadObjectMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { level: 1, name: "K2-18 1" })).toBeVisible();
  });

  it("keeps a malformed saved address local instead of falling through to an object request", async () => {
    window.history.replaceState({}, "", "/observe?saved=not-a-uuid&object=k2-18");

    const page = await ObservePage({
      catalogueSearchMessages: enMessages.catalogueSearch,
      coordinateDisclosureMessages: enMessages.coordinateDisclosure,
      entityTypeMessages: enMessages.entityTypes,
      journalEntryMessages: enMessages.journal.entry,
      plannerLocale: DEFAULT_LOCALE,
      plannerMessages: enMessages.observationPlanner,
      savedPlanLocale: DEFAULT_LOCALE,
      savedPlanMessages: enMessages.savedObservationPlan,
      searchParams: Promise.resolve({ object: "k2-18", saved: "not-a-uuid" }),
    });
    render(page);

    expect(loadObjectMock).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Saved plan address is invalid" }),
    ).toBeVisible();
  });
});
