import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { observationPlanFixture, savedPlanTargetFixture } from "./saved-observation-plan-fixture";

const { putSavedObservationPlanMock } = vi.hoisted(() => ({
  putSavedObservationPlanMock: vi.fn(),
}));

vi.mock("../src/lib/journal/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/journal/database")>();
  return { ...actual, putSavedObservationPlan: putSavedObservationPlanMock };
});

import { SaveObservationPlanButton } from "../src/components/save-observation-plan-button";
import { SavedPlanStorageError } from "../src/lib/journal/database";

beforeEach(() => {
  putSavedObservationPlanMock.mockReset();
});

function renderButton() {
  return render(
    <SaveObservationPlanButton
      nightDate="2026-09-19"
      plan={observationPlanFixture}
      target={savedPlanTargetFixture}
      timeZone="Asia/Kolkata"
    />,
  );
}

describe("saved-plan storage failures", () => {
  it("reports quota exhaustion without claiming the plan was saved", async () => {
    putSavedObservationPlanMock.mockRejectedValue(new SavedPlanStorageError("quota-exceeded"));
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "Save plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not have enough local storage space/i,
    );
    expect(screen.queryByRole("link", { name: "Open saved plan" })).not.toBeInTheDocument();
  });

  it("reports blocked local storage without sending or substituting the plan", async () => {
    putSavedObservationPlanMock.mockRejectedValue(new SavedPlanStorageError("storage-unavailable"));
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "Save plan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not allowing Lumina to store saved plans/i,
    );
    expect(screen.queryByText(/saved locally/i)).not.toBeInTheDocument();
  });
});
