import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ModalDialog } from "../src/components/modal-dialog";

function DialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open dialog
      </button>
      <ModalDialog
        description="A bounded focus-contract fixture."
        onClose={() => setOpen(false)}
        open={open}
        title="Focus fixture"
      >
        <fieldset disabled>
          <input aria-label="Fieldset-disabled input" tabIndex={0} />
        </fieldset>
        <select aria-label="Disabled choice" disabled>
          <option>Unavailable</option>
        </select>
        <input aria-label="Hidden input" tabIndex={0} type="hidden" />
        <button disabled tabIndex={0} type="button">
          Disabled tab indexed
        </button>
        <button tabIndex={-1} type="button">
          Programmatic only
        </button>
        <textarea aria-label="Notes" />
        <a href="#help">Help</a>
        <button type="button">Last action</button>
      </ModalDialog>
    </>
  );
}

function EmptyDialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open empty dialog
      </button>
      <ModalDialog onClose={() => setOpen(false)} open={open} title="Empty focus fixture">
        <p>Informational content only.</p>
        <button disabled type="button">
          Unavailable action
        </button>
      </ModalDialog>
    </>
  );
}

describe("ModalDialog", () => {
  it("exposes modal semantics and initially focuses the first enabled control", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog", { name: "Focus fixture" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("A bounded focus-contract fixture.");
    expect(screen.getByLabelText("Fieldset-disabled input")).toBeDisabled();
    expect(screen.getByLabelText("Disabled choice")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disabled tab indexed" })).toBeDisabled();
    expect(screen.getByLabelText("Notes")).toHaveFocus();
  });

  it("recaptures focus if another script moves it outside the open modal", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await user.click(trigger);
    const notes = screen.getByLabelText("Notes");
    expect(notes).toHaveFocus();

    trigger.focus();
    expect(notes).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open dialog" }));
    const notes = screen.getByLabelText("Notes");
    const lastAction = screen.getByRole("button", { name: "Last action" });
    expect(notes).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastAction).toHaveFocus();

    await user.tab();
    expect(notes).toHaveFocus();
  });

  it("keeps focus on the dialog panel when there are no tabbable children", async () => {
    const user = userEvent.setup();
    render(<EmptyDialogHarness />);

    await user.click(screen.getByRole("button", { name: "Open empty dialog" }));
    const dialog = screen.getByRole("dialog", { name: "Empty focus fixture" });
    expect(dialog).toHaveFocus();

    await user.tab();
    expect(dialog).toHaveFocus();
    await user.tab({ shift: true });
    expect(dialog).toHaveFocus();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await user.click(trigger);
    expect(screen.getByLabelText("Notes")).toHaveFocus();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("closes only when a pointer press starts on the backdrop", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Focus fixture" });
    fireEvent.mouseDown(dialog);
    expect(dialog).toBeVisible();

    const backdrop = dialog.parentElement;
    if (backdrop === null) throw new Error("dialog backdrop missing");
    fireEvent.mouseDown(backdrop);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
