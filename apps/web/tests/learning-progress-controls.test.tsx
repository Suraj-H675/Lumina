import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { loadLearningContent } from "../src/lib/learning/content";
import { ContinueLearningCard } from "../src/components/continue-learning-card";
import { LearningProgressControls } from "../src/components/learning-progress-controls";
import { createLearningProgressExport } from "../src/lib/learning/progress-export";
import {
  getLearningProgressSnapshot,
  recordLearningQuizAttempt,
  resetLearningProgress,
  startLearningLesson,
} from "../src/lib/learning/progress-store";

const content = loadLearningContent();
const evaluation = { correct_count: 3, passed: true, score: 1, total_questions: 3 };

beforeEach(() => {
  window.localStorage.clear();
  resetLearningProgress();
  window.dispatchEvent(new StorageEvent("storage", { key: "lumina.learning.v1" }));
});

describe("learning progress controls", () => {
  it("shows an honest Continue Learning action and advances after mastery", async () => {
    const { rerender } = render(<ContinueLearningCard content={content} path={content.path} />);
    expect(
      await screen.findByRole("link", { name: /start your first night sky/i }),
    ).toHaveAttribute("href", "/learn/your-first-night-sky/start-with-the-sky");

    startLearningLesson("your-first-night-sky", "start-with-the-sky");
    recordLearningQuizAttempt("your-first-night-sky", "start-with-the-sky", evaluation);
    rerender(<ContinueLearningCard content={content} path={content.path} />);

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /continue with find patterns and directions/i }),
      ).toHaveAttribute("href", "/learn/your-first-night-sky/find-patterns-and-directions"),
    );
  });

  it("previews a valid import and applies it only after confirmation", async () => {
    const user = userEvent.setup();
    const source = startLearningLesson("your-first-night-sky", "start-with-the-sky");
    if (!source.ok) throw new Error("could not seed progress");
    const envelope = await createLearningProgressExport(
      getLearningProgressSnapshot(),
      "2026-09-01T12:00:00.000Z",
    );
    resetLearningProgress();
    render(<LearningProgressControls />);

    const input = screen.getByLabelText("Import learning progress") as HTMLInputElement;
    await user.upload(
      input,
      new File([JSON.stringify(envelope)], "progress.json", { type: "application/json" }),
    );
    expect(await screen.findByRole("heading", { name: "Review this import" })).toBeVisible();
    expect(getLearningProgressSnapshot().paths).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Import progress" }));
    await waitFor(() => expect(getLearningProgressSnapshot().paths).toHaveLength(1));
    expect(screen.getByText(/imported 1 learning path/i)).toBeVisible();
  });
});
