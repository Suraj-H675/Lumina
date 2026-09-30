import "fake-indexeddb/auto";

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ObserveExperience } from "../src/components/observe-experience";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { putSavedObservationPlan } from "../src/lib/journal/database";
import { savedObservationPlanFixture } from "./saved-observation-plan-fixture";
import { resetPersonalDatabase } from "./support/personal-database";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));

beforeEach(async () => {
  await resetPersonalDatabase();
  window.history.replaceState({}, "", "/observe");
});

afterEach(async () => {
  await resetPersonalDatabase();
});

describe("observe route client mode", () => {
  it("switches a cached canonical observe shell into saved mode from the address bar", async () => {
    const saved = savedObservationPlanFixture();
    await putSavedObservationPlan(saved);
    window.history.replaceState({}, "", `/observe?saved=${saved.id}`);

    render(
      <ObserveExperience
        catalogueSearchMessages={enMessages.catalogueSearch}
        coordinateDisclosureMessages={enMessages.coordinateDisclosure}
        detail={null}
        entityTypeMessages={enMessages.entityTypes}
        journalEntryMessages={enMessages.journal.entry}
        locale={DEFAULT_LOCALE}
        messages={enMessages.observationPlanner}
        savedPlanLocale={DEFAULT_LOCALE}
        savedPlanMessages={enMessages.savedObservationPlan}
        slug={null}
        targetUnavailable={false}
      />,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "K2-18 1" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { level: 1, name: "Choose an object" }),
    ).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("uses the server-provided saved id before browser snapshot reconciliation", async () => {
    const saved = savedObservationPlanFixture();
    await putSavedObservationPlan(saved);

    render(
      <ObserveExperience
        catalogueSearchMessages={enMessages.catalogueSearch}
        coordinateDisclosureMessages={enMessages.coordinateDisclosure}
        detail={null}
        entityTypeMessages={enMessages.entityTypes}
        initialSavedId={saved.id}
        journalEntryMessages={enMessages.journal.entry}
        locale={DEFAULT_LOCALE}
        messages={enMessages.observationPlanner}
        savedPlanLocale={DEFAULT_LOCALE}
        savedPlanMessages={enMessages.savedObservationPlan}
        slug={null}
        targetUnavailable={false}
      />,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "K2-18 1" })).toBeVisible();
  });
});
