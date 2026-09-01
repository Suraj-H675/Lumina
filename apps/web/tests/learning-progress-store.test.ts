import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEARNING_PROGRESS_STORAGE_KEY } from "../src/lib/learning/progress-model";
import type * as StoreModule from "../src/lib/learning/progress-store";

let store: typeof StoreModule;

const evaluation = { correct_count: 3, passed: true, score: 1, total_questions: 3 };

beforeEach(async () => {
  window.localStorage.clear();
  vi.resetModules();
  store = await import("../src/lib/learning/progress-store");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("learning progress store", () => {
  it("persists a started lesson and quiz mastery across a module reload", async () => {
    expect(store.startLearningLesson("your-first-night-sky", "start-with-the-sky").ok).toBe(true);
    expect(
      store.recordLearningQuizAttempt("your-first-night-sky", "start-with-the-sky", evaluation).ok,
    ).toBe(true);
    expect(store.getLearningProgressSnapshot().paths[0]?.lessons[0]).toMatchObject({
      mastered: true,
    });

    vi.resetModules();
    store = await import("../src/lib/learning/progress-store");
    expect(store.getLearningProgressStatusSnapshot()).toBe("ready");
    expect(store.getLearningProgressSnapshot().paths[0]?.lessons[0]?.mastered).toBe(true);
  });

  it("keeps malformed bytes untouched and refuses writes until explicit reset", () => {
    window.localStorage.setItem(LEARNING_PROGRESS_STORAGE_KEY, "{corrupt");

    expect(store.getLearningProgressStatusSnapshot()).toBe("corrupted");
    expect(window.localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEY)).toBe("{corrupt");
    expect(store.startLearningLesson("your-first-night-sky", "start-with-the-sky")).toMatchObject({
      ok: false,
      reason: "storage-corrupted",
    });
    expect(store.resetLearningProgress()).toMatchObject({ ok: true });
    expect(store.getLearningProgressStatusSnapshot()).toBe("ready");
  });

  it("previews an import before merging it and never sends progress to a server", async () => {
    const source = store.startLearningLesson("your-first-night-sky", "start-with-the-sky");
    expect(source.ok).toBe(true);
    const exported = await store.exportLearningProgress("2026-09-01T12:00:00.000Z");

    expect(store.resetLearningProgress()).toMatchObject({ ok: true });
    const preview = await store.previewLearningProgressImport(JSON.stringify(exported));
    expect(preview).toMatchObject({ added_paths: 1, added_attempts: 0 });
    expect(store.getLearningProgressSnapshot().paths).toHaveLength(0);

    const applied = await store.applyLearningProgressImport(JSON.stringify(exported));
    expect(applied).toMatchObject({ ok: true, added_paths: 1 });
    expect(store.getLearningProgressSnapshot().paths[0]?.path_slug).toBe("your-first-night-sky");
  });

  it("reports blocked local storage without pretending that progress was saved", async () => {
    const blocked = new DOMException("denied", "SecurityError");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw blocked;
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw blocked;
    });
    vi.resetModules();
    store = await import("../src/lib/learning/progress-store");

    expect(store.getLearningProgressStatusSnapshot()).toBe("unavailable");
    expect(store.startLearningLesson("your-first-night-sky", "start-with-the-sky")).toMatchObject({
      ok: false,
      reason: "storage-unavailable",
    });
  });
});
