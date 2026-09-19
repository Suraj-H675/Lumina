import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LearningModeSelector } from "../src/components/learning-mode-selector";
import { PresentationModeMessagesProvider } from "../src/lib/i18n/presentation-mode-context";
import type { PresentationModeMessages } from "../src/lib/i18n/messages/types";

const messages = {
  description: "Mode help",
  label: "Mode label",
  options: {
    deepDive: "Deep-dive label",
    explorer: "Explorer label",
    student: "Student label",
  },
} as const satisfies PresentationModeMessages;

describe("LearningModeSelector localization", () => {
  it("renders locale-owned copy while preserving stable presentation-mode identifiers", () => {
    render(
      <PresentationModeMessagesProvider messages={messages}>
        <LearningModeSelector onChange={vi.fn()} />
      </PresentationModeMessagesProvider>,
    );

    expect(screen.getByLabelText("Mode label")).toHaveValue("explorer");
    expect(screen.getByRole("option", { name: "Explorer label" })).toHaveValue("explorer");
    expect(screen.getByRole("option", { name: "Student label" })).toHaveValue("student");
    expect(screen.getByRole("option", { name: "Deep-dive label" })).toHaveValue("deep-dive");
    expect(screen.getByText("Mode help")).toBeVisible();
  });
});
