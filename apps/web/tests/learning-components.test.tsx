import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { loadLearningContent } from "../src/lib/learning/content";
import { LearningLessonView } from "../src/components/learning-lesson-view";
import { LearningPathView } from "../src/components/learning-path-view";
import {
  resetLearningProgress,
  getLearningProgressSnapshot,
} from "../src/lib/learning/progress-store";

const content = loadLearningContent();
const path = content.path;
const firstLesson = content.lessons[0];
const firstQuiz = content.quizzes[0];

if (firstLesson === undefined || firstQuiz === undefined) {
  throw new Error("published learning fixture is unexpectedly incomplete");
}

beforeEach(() => {
  window.localStorage.clear();
  resetLearningProgress();
  window.dispatchEvent(new StorageEvent("storage", { key: "lumina.learning.v1" }));
});

describe("learning content views", () => {
  it("renders the path and lesson with source/review content accessibly", async () => {
    const pathRender = render(<LearningPathView content={content} path={path} />);
    expect((await axe(pathRender.container)).violations).toEqual([]);
    expect(screen.getByRole("heading", { level: 1, name: "Your First Night Sky" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sources and review" })).toBeVisible();
    pathRender.unmount();

    const lessonRender = render(
      <LearningLessonView content={content} lesson={firstLesson} path={path} quiz={firstQuiz} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: firstLesson.title })).toBeVisible(),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Knowledge check" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Sources and review" })).toBeVisible();
    expect((await axe(lessonRender.container)).violations).toEqual([]);
  });

  it("switches between authored mode variants and saves a mastered quiz locally", async () => {
    const user = userEvent.setup();
    render(
      <LearningLessonView content={content} lesson={firstLesson} path={path} quiz={firstQuiz} />,
    );

    await user.selectOptions(screen.getByLabelText("Presentation mode"), "student");
    expect(screen.getByText(/NASA notes that you need no special equipment/i)).toBeVisible();

    for (const question of firstQuiz.questions) {
      const correct = question.choices.find((choice) => choice.id === question.correct_choice_id);
      if (correct === undefined) throw new Error("quiz fixture answer is missing");
      await user.click(screen.getByRole("radio", { name: correct.label }));
    }
    await user.click(screen.getByRole("button", { name: "Check answers" }));

    expect(await screen.findByText(/3 of 3 correct/i)).toBeVisible();
    expect(await screen.findByText(/mastery saved locally/i)).toBeVisible();
    expect(getLearningProgressSnapshot().paths[0]?.lessons[0]?.mastered).toBe(true);
  });

  it("does not render a locked lesson's quiz before its prerequisite is mastered", async () => {
    const secondLesson = content.lessons[1];
    const secondQuiz = content.quizzes.find((quiz) => quiz.lesson_slug === secondLesson?.slug);
    if (secondLesson === undefined || secondQuiz === undefined)
      throw new Error("lesson fixture missing");
    render(
      <LearningLessonView content={content} lesson={secondLesson} path={path} quiz={secondQuiz} />,
    );

    expect(await screen.findByText(/complete the prerequisite lesson first/i)).toBeVisible();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Knowledge check" }),
    ).not.toBeInTheDocument();
  });
});
