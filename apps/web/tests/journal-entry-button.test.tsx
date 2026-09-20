import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { enMessages } from "../src/lib/i18n/messages/en";
import type { JournalEntryMessages } from "../src/lib/i18n/messages/types";
import { JournalStorageError } from "../src/lib/journal/database";

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));

vi.mock("../src/lib/journal/catalog", () => ({
  saveCatalogObservationToJournal: saveMock,
}));

import { JournalEntryButton } from "../src/components/journal-entry-button";

const ENTITY_ID = "403d0e71-8d81-5c52-abad-c4666c1b5cd6";

beforeEach(() => {
  saveMock.mockReset();
  saveMock.mockResolvedValue({ id: "8b2f8133-c4fd-47ad-8618-602946cd4d48" });
});

function renderButton(
  props: Readonly<{
    messages?: JournalEntryMessages;
    plannerContext?: Readonly<{
      latitudeDeg: number;
      longitudeDeg: number;
      selectedTimeUtc: string;
    }>;
  }> = {},
) {
  return render(
    <JournalEntryButton
      entityId={ENTITY_ID}
      messages={props.messages ?? enMessages.journal.entry}
      objectName="K2-18"
      {...(props.plannerContext === undefined ? {} : { plannerContext: props.plannerContext })}
    />,
  );
}

describe("JournalEntryButton", () => {
  it("creates an object-derived journal entry without inventing time or location", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /add to journal/i }));
    expect(screen.getByLabelText(/observation date and time/i)).toHaveValue("");
    expect(screen.getByLabelText("Location label")).toHaveValue("");
    expect(screen.getByLabelText("Latitude")).toHaveValue(null);
    expect(screen.getByLabelText("Longitude")).toHaveValue(null);

    await user.type(screen.getByLabelText("Journal title"), "K2-18 visual check");
    await user.type(screen.getByLabelText("Notes (optional)"), "No observation metadata known.");
    await user.click(screen.getByRole("button", { name: "Save to local journal" }));

    expect(saveMock).toHaveBeenCalledWith({
      entityId: ENTITY_ID,
      location: null,
      notes: "No observation metadata known.",
      objectName: "K2-18",
      observationTimeUtc: null,
      title: "K2-18 visual check",
    });
    expect(await screen.findByText(/saved to this browser's local journal/i)).toBeVisible();
  });

  it("copies planner time and exact coordinates only after explicit user actions", async () => {
    const user = userEvent.setup();
    const selectedTimeUtc = "2026-09-16T16:30:00.000Z";
    renderButton({
      plannerContext: {
        latitudeDeg: 12.972,
        longitudeDeg: 77.594,
        selectedTimeUtc,
      },
    });

    await user.click(screen.getByRole("button", { name: /add to journal/i }));
    expect(screen.getByLabelText(/observation date and time/i)).toHaveValue("");
    expect(screen.getByLabelText("Latitude")).toHaveValue(null);
    expect(screen.getByLabelText("Longitude")).toHaveValue(null);

    await user.click(screen.getByRole("button", { name: "Use selected planner time" }));
    await user.click(screen.getByRole("button", { name: "Use planner coordinates" }));
    expect(screen.getByLabelText("Location label")).toHaveValue("Planner coordinates");
    expect(screen.getByLabelText("Latitude")).toHaveValue(12.972);
    expect(screen.getByLabelText("Longitude")).toHaveValue(77.594);

    await user.type(screen.getByLabelText("Journal title"), "Planned K2-18 observation");
    await user.click(screen.getByRole("button", { name: "Save to local journal" }));

    expect(saveMock).toHaveBeenCalledWith({
      entityId: ENTITY_ID,
      location: {
        confirmed_by_user: true,
        label: "Planner coordinates",
        latitude_deg: 12.972,
        longitude_deg: 77.594,
      },
      notes: "",
      objectName: "K2-18",
      observationTimeUtc: selectedTimeUtc,
      title: "Planned K2-18 observation",
    });
  });

  it("requires a location label and a complete coordinate pair", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /add to journal/i }));
    await user.type(screen.getByLabelText("Journal title"), "K2-18");
    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.click(screen.getByRole("button", { name: "Save to local journal" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/location label/i);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("renders validation and success states from the injected message slice", async () => {
    const user = userEvent.setup();
    const messages: JournalEntryMessages = {
      ...enMessages.journal.entry,
      addAction: "Add fixture note",
      savedStatus: "Fixture journal entry saved.",
      validation: {
        ...enMessages.journal.entry.validation,
        locationLabelRequired: "Fixture location label required.",
      },
    };
    renderButton({ messages });

    await user.click(screen.getByRole("button", { name: "Add fixture note" }));
    await user.type(screen.getByLabelText(messages.form.titleLabel), "Fixture observation");
    await user.type(screen.getByLabelText(messages.form.latitudeLabel), "12.972");
    await user.click(screen.getByRole("button", { name: messages.form.saveAction }));
    expect(screen.getByRole("alert")).toHaveTextContent("Fixture location label required.");

    await user.type(screen.getByLabelText(messages.form.locationLabel), "Fixture location");
    await user.type(screen.getByLabelText(messages.form.longitudeLabel), "77.594");
    await user.click(screen.getByRole("button", { name: messages.form.saveAction }));
    expect(await screen.findByRole("status")).toHaveTextContent("Fixture journal entry saved.");
  });

  it("maps stable journal storage failures through the injected message slice", async () => {
    const user = userEvent.setup();
    const messages: JournalEntryMessages = {
      ...enMessages.journal.entry,
      failures: {
        ...enMessages.journal.entry.failures,
        storageUnavailable: "Fixture journal storage unavailable.",
      },
    };
    saveMock.mockRejectedValueOnce(new JournalStorageError("storage-unavailable"));
    renderButton({ messages });

    await user.click(screen.getByRole("button", { name: messages.addAction }));
    await user.type(screen.getByLabelText(messages.form.titleLabel), "Fixture observation");
    await user.click(screen.getByRole("button", { name: messages.form.saveAction }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Fixture journal storage unavailable.",
    );
  });
});
