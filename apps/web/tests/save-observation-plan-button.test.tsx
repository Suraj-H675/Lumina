import "fake-indexeddb/auto";

import Dexie from "dexie";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SaveObservationPlanButton } from "../src/components/save-observation-plan-button";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { SaveObservationPlanMessages } from "../src/lib/i18n/messages/types";
import {
  LUMINA_PERSONAL_DB_NAME,
  closeJournalDatabase,
  listSavedObservationPlans,
} from "../src/lib/journal/database";
import { observationPlanFixture, savedPlanTargetFixture } from "./saved-observation-plan-fixture";

async function resetPersonalDatabase(): Promise<void> {
  await closeJournalDatabase();
  await Dexie.delete(LUMINA_PERSONAL_DB_NAME);
}

beforeEach(resetPersonalDatabase);
afterEach(resetPersonalDatabase);

function renderButton(
  messages: SaveObservationPlanMessages = enMessages.observationPlanner.savePlan,
) {
  return render(
    <SaveObservationPlanButton
      locale={DEFAULT_LOCALE}
      messages={messages}
      nightDate="2026-09-19"
      plan={observationPlanFixture}
      target={savedPlanTargetFixture}
      timeZone="Asia/Kolkata"
    />,
  );
}

describe("Save observation plan", () => {
  it("requires an explicit click before exact coordinates are persisted locally", async () => {
    const user = userEvent.setup();
    renderButton();

    expect(
      screen.getByText(/saving this plan stores the exact observer coordinates/i),
    ).toBeVisible();
    expect(screen.getByText(/only in this browser/i)).toBeVisible();
    expect(await listSavedObservationPlans()).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Save plan" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/saved locally/i);
    const openSaved = screen.getByRole("link", { name: "Open saved plan" });
    expect(openSaved.getAttribute("href")).toMatch(
      /^\/observe\?saved=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    const saved = await listSavedObservationPlans();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.observer).toEqual({ latitude_deg: 12.9716, longitude_deg: 77.5946 });
    expect(saved[0]?.target.slug).toBe("k2-18");
  });

  it("does not place exact coordinates in the saved-plan URL", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Save plan" }));

    const href = (await screen.findByRole("link", { name: "Open saved plan" })).getAttribute(
      "href",
    );
    expect(href).not.toContain("12.9716");
    expect(href).not.toContain("77.5946");
    expect(href).not.toContain("object=");
  });

  it("renders the save surface from the injected planner message slice", async () => {
    const user = userEvent.setup();
    const messages: SaveObservationPlanMessages = {
      ...enMessages.observationPlanner.savePlan,
      openSavedPlan: "Open fixture snapshot",
      saveAction: "Save fixture plan",
      savedStatus: "Fixture plan stored locally.",
      title: "Fixture save surface",
    };

    renderButton(messages);

    expect(screen.getByRole("heading", { name: "Fixture save surface" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save fixture plan" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Fixture plan stored locally.");
    expect(screen.getByRole("link", { name: "Open fixture snapshot" })).toBeVisible();
  });
});
