"use client";

import { useSyncExternalStore } from "react";

import { loadLearningContent } from "./content";
import { evaluateQuiz, type QuizEvaluation } from "./quiz";
import {
  EMPTY_LEARNING_PROGRESS,
  LEARNING_PROGRESS_STORAGE_KEY,
  mergeLearningProgress,
  recordQuizAttemptMutation,
  startLessonMutation,
  validateLearningProgress,
  type LearningProgressData,
  type LearningPathProgress,
} from "./progress-model";
import {
  createLearningProgressExport,
  parseLearningProgressExport,
  type LearningProgressExport,
} from "./progress-export";

export type LearningProgressStatus = "loading" | "ready" | "unavailable" | "corrupted";

export type LearningProgressStoreFailureReason =
  "storage-unavailable" | "storage-corrupted" | "storage-write-failed" | "invalid-content";

export type LearningProgressStoreResult =
  | Readonly<{
      ok: true;
      added_attempts?: number;
      added_paths?: number;
      updated_lessons?: number;
    }>
  | Readonly<{
      ok: false;
      message: string;
      reason: LearningProgressStoreFailureReason;
    }>;

export type LearningProgressImportPreview = Readonly<{
  added_attempts: number;
  added_paths: number;
  imported: LearningProgressData;
  updated_lessons: number;
}>;

type Listener = () => void;

let hydrated = false;
let status: LearningProgressStatus = "loading";
let state: LearningProgressData = EMPTY_LEARNING_PROGRESS;
const listeners = new Set<Listener>();
let storageListenerAttached = false;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  ensureLearningProgressHydrated();
  return () => listeners.delete(listener);
}

function getSnapshot(): LearningProgressData {
  return state;
}

function getServerSnapshot(): LearningProgressData {
  return EMPTY_LEARNING_PROGRESS;
}

function storageAvailable(): boolean {
  try {
    const probe = "__lumina_learning_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readStorage():
  | Readonly<{ kind: "ok"; data: LearningProgressData }>
  | Readonly<{ kind: "corrupted" }>
  | Readonly<{ kind: "unavailable" }> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LEARNING_PROGRESS_STORAGE_KEY);
  } catch {
    return { kind: "unavailable" };
  }
  if (raw === null) return { data: EMPTY_LEARNING_PROGRESS, kind: "ok" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: "corrupted" };
  }
  const validated = validateLearningProgress(parsed);
  return validated === null ? { kind: "corrupted" } : { data: validated, kind: "ok" };
}

function setStatus(next: LearningProgressStatus): void {
  status = next;
}

function applyStorageRead(read: ReturnType<typeof readStorage>): void {
  switch (read.kind) {
    case "ok":
      state = read.data;
      setStatus(storageAvailable() ? "ready" : "unavailable");
      break;
    case "corrupted":
      setStatus("corrupted");
      break;
    case "unavailable":
      setStatus("unavailable");
      break;
  }
  emit();
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== null && event.key !== LEARNING_PROGRESS_STORAGE_KEY) return;
  applyStorageRead(readStorage());
}

function attachStorageListener(): void {
  if (storageListenerAttached) return;
  storageListenerAttached = true;
  window.addEventListener("storage", handleStorageEvent);
}

export function ensureLearningProgressHydrated(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  applyStorageRead(readStorage());
  attachStorageListener();
}

function guardReady(): LearningProgressStoreResult | null {
  if (status === "corrupted") {
    return {
      message:
        "Saved learning progress could not be read. Reset it from the Learn page to continue.",
      ok: false,
      reason: "storage-corrupted",
    };
  }
  if (status !== "ready") {
    return {
      message: "Local storage is not available, so learning progress cannot be changed right now.",
      ok: false,
      reason: "storage-unavailable",
    };
  }
  return null;
}

function persist(next: LearningProgressData): LearningProgressStoreResult {
  try {
    window.localStorage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    if (!storageAvailable()) {
      setStatus("unavailable");
      emit();
      return {
        message:
          "This browser is blocking local storage, so Lumina cannot save learning progress right now.",
        ok: false,
        reason: "storage-unavailable",
      };
    }
    return {
      message: isQuotaError(error)
        ? "This browser's storage is full, so the learning-progress save was refused."
        : "The browser refused the learning-progress save. Nothing was changed.",
      ok: false,
      reason: "storage-write-failed",
    };
  }
  state = next;
  setStatus("ready");
  emit();
  return { ok: true };
}

function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const code = (error as { code?: unknown }).code;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

function getPathDefinition(pathSlug: string): Readonly<{ lesson_slugs: string[] }> | null {
  const content = loadLearningContent();
  return content.path.slug === pathSlug ? content.path : null;
}

function isKnownLesson(pathSlug: string, lessonSlug: string): boolean {
  const path = getPathDefinition(pathSlug);
  return path !== null && path.lesson_slugs.includes(lessonSlug);
}

function invalidContentResult(): LearningProgressStoreResult {
  return {
    message: "That learning step is not part of a published Lumina path.",
    ok: false,
    reason: "invalid-content",
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

let attemptSequence = 0;

function generateAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `attempt-${crypto.randomUUID()}`;
  }
  attemptSequence += 1;
  return `attempt-${Date.now().toString(36)}-${attemptSequence.toString(36)}`;
}

export function startLearningLesson(
  pathSlug: string,
  lessonSlug: string,
): LearningProgressStoreResult {
  ensureLearningProgressHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  const path = getPathDefinition(pathSlug);
  if (path === null || !isKnownLesson(pathSlug, lessonSlug)) return invalidContentResult();
  return persist(startLessonMutation(state, pathSlug, lessonSlug, nowIso()));
}

export function recordLearningQuizAttempt(
  pathSlug: string,
  lessonSlug: string,
  evaluation: Pick<QuizEvaluation, "correct_count" | "passed" | "score" | "total_questions">,
): LearningProgressStoreResult {
  ensureLearningProgressHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  const path = getPathDefinition(pathSlug);
  if (path === null || !isKnownLesson(pathSlug, lessonSlug)) return invalidContentResult();
  try {
    const next = recordQuizAttemptMutation(
      state,
      pathSlug,
      lessonSlug,
      evaluation,
      path.lesson_slugs,
      generateAttemptId(),
      nowIso(),
    );
    return persist(next);
  } catch {
    return {
      message: "That quiz result could not be saved. Nothing was changed.",
      ok: false,
      reason: "storage-write-failed",
    };
  }
}

export function recordLearningQuizAnswers(
  pathSlug: string,
  lessonSlug: string,
  answers: unknown,
): LearningProgressStoreResult {
  const content = loadLearningContent();
  const quiz = content.quizzes.find((entry) => entry.lesson_slug === lessonSlug);
  if (content.path.slug !== pathSlug || quiz === undefined) return invalidContentResult();
  return recordLearningQuizAttempt(pathSlug, lessonSlug, evaluateQuiz(quiz, answers));
}

export function getLearningProgressSnapshot(): LearningProgressData {
  return state;
}

export function getLearningProgressStatusSnapshot(): LearningProgressStatus {
  ensureLearningProgressHydrated();
  return status;
}

export function getLearningPathProgress(pathSlug: string): LearningPathProgress | null {
  return state.paths.find((path) => path.path_slug === pathSlug) ?? null;
}

export function useLearningProgressData(): LearningProgressData {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useLearningProgressStatus(): LearningProgressStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => "loading" as LearningProgressStatus,
  );
}

export function useLearningPathProgress(pathSlug: string): LearningPathProgress | null {
  const data = useLearningProgressData();
  return data.paths.find((path) => path.path_slug === pathSlug) ?? null;
}

export async function exportLearningProgress(
  exportedAt = nowIso(),
): Promise<LearningProgressExport> {
  ensureLearningProgressHydrated();
  const guard = guardReady();
  if (guard !== null) {
    throw new Error("message" in guard ? guard.message : "Local storage is unavailable.");
  }
  return createLearningProgressExport(state, exportedAt);
}

function importCounts(
  current: LearningProgressData,
  imported: LearningProgressData,
): Omit<LearningProgressImportPreview, "imported"> {
  const localPaths = new Map(current.paths.map((path) => [path.path_slug, path]));
  let addedAttempts = 0;
  let addedPaths = 0;
  let updatedLessons = 0;
  for (const importedPath of imported.paths) {
    const localPath = localPaths.get(importedPath.path_slug);
    if (localPath === undefined) {
      addedPaths += 1;
      addedAttempts += importedPath.attempts.length;
      updatedLessons += importedPath.lessons.length;
      continue;
    }
    const localAttemptIds = new Set(localPath.attempts.map((attempt) => attempt.id));
    addedAttempts += importedPath.attempts.filter(
      (attempt) => !localAttemptIds.has(attempt.id),
    ).length;
    for (const importedLesson of importedPath.lessons) {
      const localLesson = localPath.lessons.find(
        (lesson) => lesson.lesson_slug === importedLesson.lesson_slug,
      );
      if (localLesson === undefined || importedLesson.best_score > localLesson.best_score)
        updatedLessons += 1;
    }
  }
  return {
    added_attempts: addedAttempts,
    added_paths: addedPaths,
    updated_lessons: updatedLessons,
  };
}

export async function previewLearningProgressImport(
  raw: string,
): Promise<LearningProgressImportPreview> {
  ensureLearningProgressHydrated();
  const imported = await parseLearningProgressExport(raw);
  return { ...importCounts(state, imported), imported };
}

export async function applyLearningProgressImport(
  raw: string,
): Promise<LearningProgressStoreResult> {
  ensureLearningProgressHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  try {
    const imported = await parseLearningProgressExport(raw);
    const counts = importCounts(state, imported);
    const next = mergeLearningProgress(state, imported);
    const result = persist(next);
    return result.ok ? { ...result, ...counts } : result;
  } catch {
    return {
      message: "This learning-progress file could not be validated, so nothing was imported.",
      ok: false,
      reason: "storage-write-failed",
    };
  }
}

export function resetLearningProgress(): LearningProgressStoreResult {
  ensureLearningProgressHydrated();
  if (!storageAvailable()) {
    return {
      message: "Local storage is not available, so learning progress cannot be reset.",
      ok: false,
      reason: "storage-unavailable",
    };
  }
  return persist(EMPTY_LEARNING_PROGRESS);
}
