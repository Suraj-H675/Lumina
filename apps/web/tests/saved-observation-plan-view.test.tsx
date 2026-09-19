import "fake-indexeddb/auto";

import Dexie from "dexie";
import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SavedObservationPlanView } from "../src/components/saved-observation-plan-view";
import {
  LUMINA_PERSONAL_DB_NAME,
  closeJournalDatabase,
  getSavedObservationPlan,
  putSavedObservationPlan,
} from "../src/lib/journal/database";
import { savedObservationPlanFixture } from "./saved-observation-plan-fixture";

async function resetPersonalDatabase(): Promise<void> {
  await closeJournalDatabase();
  await Dexie.delete(LUMINA_PERSONAL_DB_NAME);
}

beforeEach(resetPersonalDatabase);
afterEach(resetPersonalDatabase);

describe("saved observation plan view", () => {
  it("renders the local snapshot without recomputing or claiming current data", async () => {
    const saved = savedObservationPlanFixture();
    await putSavedObservationPlan(saved);

    render(<SavedObservationPlanView savedId={saved.id} />);

    expect(await screen.findByRole("heading", { level: 1, name: "K2-18 1" })).toBeVisible();
    expect(screen.getByText(/saved observation plan/i)).toBeVisible();
    expect(screen.getByText(/saved snapshot, not a current recomputation/i)).toBeVisible();
    expect(screen.getByText(/12\.971600°/i)).toBeVisible();
    expect(screen.getByText(/77\.594600°/i)).toBeVisible();
    expect(screen.getByText(/Gaia Data Release 3 main source catalogue/i)).toBeVisible();
    expect(screen.getByText(/astronomy-engine 2\.1\.19/i)).toBeVisible();
    expect(screen.getByRole("table", { name: "Saved altitude samples" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Plan this target again" })).toHaveAttribute(
      "href",
      "/observe?object=k2-18&date=2026-09-19",
    );
  });

  it("shows an explicit missing state and never invents a replacement plan", async () => {
    render(<SavedObservationPlanView savedId="13000000-0000-4000-8000-000000000099" />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Saved plan not found" }),
    ).toBeVisible();
    expect(screen.getByText(/Lumina did not substitute another plan/i)).toBeVisible();
  });

  it("deletes only this local plan after explicit confirmation", async () => {
    const user = userEvent.setup();
    const saved = savedObservationPlanFixture();
    await putSavedObservationPlan(saved);
    render(<SavedObservationPlanView savedId={saved.id} />);

    await screen.findByRole("heading", { level: 1, name: "K2-18 1" });
    await user.click(screen.getByRole("button", { name: "Delete saved plan" }));
    expect(screen.getByText(/this removes only this saved plan from this browser/i)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Saved plan deleted" }),
    ).toBeVisible();
    await expect(getSavedObservationPlan(saved.id)).resolves.toBeNull();
  });

  it("passes an axe smoke check for a loaded local snapshot", async () => {
    const saved = savedObservationPlanFixture();
    await putSavedObservationPlan(saved);
    const { container } = render(<SavedObservationPlanView savedId={saved.id} />);
    await screen.findByRole("heading", { level: 1, name: "K2-18 1" });
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
