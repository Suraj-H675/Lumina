"use client";

import { useSyncExternalStore } from "react";

import {
  COLLECTIONS_STORAGE_KEY,
  EMPTY_COLLECTIONS_DATA,
  addObjectsMutation,
  collectionsContainingSlug,
  collectionContainsSlug,
  createCollectionMutation,
  deleteCollectionMutation,
  removeObjectMutation,
  renameCollectionMutation,
  validateCollectionsData,
  type CollectionsData,
  type LocalCollection,
  type MutationFailureReason,
  type ObjectIdentityInput,
} from "./collections-model";

/**
 * The one canonical client-side store for browser-local collections.
 *
 * - Reads flow through versioned validation; malformed data never becomes
 *   state and is never silently destroyed (a bounded recovery state instead).
 * - Every mutation constructs its next state purely (collections-model.ts),
 *   persists exactly once through {@link persist}, and only then publishes.
 * - Cross-tab updates arrive through the standard `storage` event.
 * - Server rendering uses stable fallbacks; localStorage is touched only in
 *   browser effects, so hydration stays mismatch-free.
 */

export type CollectionsStatus =
  /** Pre-hydration / post-SSR: nothing is known about persisted data yet. */
  | "loading"
  /** Persisted data validated (or absent) and writable. */
  | "ready"
  /** localStorage itself is unusable (blocked, quota-dead, privacy mode). */
  | "unavailable"
  /** Persisted bytes exist but failed schema validation — recovery required. */
  | "corrupted";

/** Every way a semantic mutation can fail, including honest storage failures. */
export type StoreFailureReason =
  MutationFailureReason | "storage-unavailable" | "storage-corrupted" | "storage-write-failed";

export type StoreResult =
  | Readonly<{
      addedCount?: number;
      collection?: LocalCollection;
      existingCount?: number;
      ok: true;
      removed?: boolean;
    }>
  | Readonly<{ message: string; ok: false; reason: StoreFailureReason }>;

type Listener = () => void;

let hydrated = false;
let status: CollectionsStatus = "loading";
let state: CollectionsData = EMPTY_COLLECTIONS_DATA;
const listeners = new Set<Listener>();
let storageListenerAttached = false;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  ensureHydrated();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CollectionsData {
  return state;
}

function getServerSnapshot(): CollectionsData {
  return EMPTY_COLLECTIONS_DATA;
}

// ---------------------------------------------------------------------------
// Raw storage access — the ONLY place localStorage is touched.
// ---------------------------------------------------------------------------

function storageAvailable(): boolean {
  try {
    const probe = "__lumina_collections_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

type StorageRead =
  | Readonly<{ kind: "corrupted" }>
  | Readonly<{ data: CollectionsData; kind: "ok" }>
  | Readonly<{ kind: "unavailable" }>;

function readStorage(): StorageRead {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(COLLECTIONS_STORAGE_KEY);
  } catch {
    return { kind: "unavailable" };
  }
  if (raw === null) return { data: EMPTY_COLLECTIONS_DATA, kind: "ok" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { kind: "corrupted" };
  }
  const validated = validateCollectionsData(parsed);
  return validated === null ? { kind: "corrupted" } : { data: validated, kind: "ok" };
}

/**
 * Persist exactly once. The intended next state was already constructed
 * immutably; a rejected write leaves application state untouched so the UI
 * never claims an object was saved when persistence actually failed.
 */
function persist(next: CollectionsData): StoreResult {
  try {
    window.localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // Classify by error identity first (quota errors carry stable names/codes
    // across browsers), then fall back to probing whether storage works at
    // all — the probe itself may fail when storage is blocked entirely.
    if (isQuotaError(error)) {
      return {
        message:
          "This browser's storage is full, so the save was refused. Remove or reset collections to make room.",
        ok: false,
        reason: "storage-write-failed",
      };
    }
    if (!storageAvailable()) {
      // Storage died mid-session: move every surface to the honest
      // unavailable state instead of pretending reads still work.
      setStatus("unavailable");
      emit();
      return {
        message: "This browser is blocking local storage, so Lumina cannot save right now.",
        ok: false,
        reason: "storage-unavailable",
      };
    }
    return {
      message:
        "The browser refused the save (storage may be full or restricted). Nothing was changed.",
      ok: false,
      reason: "storage-write-failed",
    };
  }
  state = next;
  setStatus("ready");
  emit();
  return { ok: true };
}

/** Quota failures across browser engines (standard name, Gecko name, legacy code). */
function isQuotaError(error: unknown): boolean {
  // Duck-typed on purpose: DOMException does not reliably extend Error in
  // every engine/runtime, but its name/code surface is stable.
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  const code = (error as { code?: unknown }).code;
  return code === 22 || code === 1014;
}

function setStatus(next: CollectionsStatus): void {
  status = next;
}

/**
 * Load persisted state once per page. Safe to call repeatedly (idempotent).
 * Runs in an effect, never during render, so SSR/hydration stay stable.
 */
export function ensureHydrated(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  applyStorageRead(readStorage());
  attachStorageListener();
}

function applyStorageRead(read: StorageRead): void {
  switch (read.kind) {
    case "ok": {
      state = read.data;
      setStatus(storageAvailable() ? "ready" : "unavailable");
      break;
    }
    case "corrupted":
      // Untrusted bytes stay on disk untouched until the user explicitly
      // resets; Lumina keeps working around the broken feature.
      setStatus("corrupted");
      break;
    case "unavailable":
      setStatus("unavailable");
      break;
  }
  emit();
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== null && event.key !== COLLECTIONS_STORAGE_KEY) return;
  // Another tab rewrote (or removed) the collections key: re-read honestly.
  // A tab that corrupted the data moves THIS tab into the recovery state too.
  applyStorageRead(readStorage());
}

function attachStorageListener(): void {
  if (storageListenerAttached) return;
  storageListenerAttached = true;
  window.addEventListener("storage", handleStorageEvent);
}

// ---------------------------------------------------------------------------
// Semantic API (handoff §32 naming, repository conventions applied)
// ---------------------------------------------------------------------------

function guardReady(): StoreResult | null {
  if (status === "corrupted") {
    return {
      message:
        "Saved collections could not be read from this browser. Reset them from the Collections page to continue.",
      ok: false,
      reason: "storage-corrupted",
    };
  }
  if (status !== "ready") {
    return {
      message: "Local storage is not available, so collections cannot be changed right now.",
      ok: false,
      reason: "storage-unavailable",
    };
  }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateCollectionId(): string {
  // crypto.randomUUID is the browser-native path; the fallback only covers
  // legacy/non-secure contexts and never touches scientific determinism.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createCollection(name: string): StoreResult {
  ensureHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  const outcome = createCollectionMutation(state, name, generateCollectionId(), nowIso());
  if (!outcome.ok) return outcome;
  const persisted = persist(outcome.data);
  if (!persisted.ok) return persisted;
  const collection = outcome.collection;
  return collection === undefined ? { ok: true } : { collection, ok: true };
}

export function renameCollection(collectionId: string, name: string): StoreResult {
  ensureHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  const outcome = renameCollectionMutation(state, collectionId, name, nowIso());
  if (!outcome.ok) return outcome;
  const persisted = persist(outcome.data);
  if (!persisted.ok) return persisted;
  const collection = outcome.collection;
  return collection === undefined ? { ok: true } : { collection, ok: true };
}

export function deleteCollection(collectionId: string): StoreResult {
  ensureHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  const outcome = deleteCollectionMutation(state, collectionId);
  if (!outcome.ok) return outcome;
  return persist(outcome.data);
}

/**
 * Atomic multi-object save: dedupe, construct the whole next collection,
 * then write once — never object-by-object in a loop.
 */
export function addObjectsToCollection(
  collectionId: string,
  identities: ReadonlyArray<ObjectIdentityInput>,
): StoreResult {
  ensureHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  const outcome = addObjectsMutation(state, collectionId, identities, nowIso());
  if (!outcome.ok) return outcome;
  const persisted = persist(outcome.data);
  if (!persisted.ok) return persisted;
  return {
    addedCount: outcome.addedCount,
    existingCount: outcome.existingCount,
    ok: true,
  };
}

export function addObjectToCollection(
  collectionId: string,
  identity: ObjectIdentityInput,
): StoreResult {
  return addObjectsToCollection(collectionId, [identity]);
}

export function removeObjectFromCollection(collectionId: string, slug: string): StoreResult {
  ensureHydrated();
  const guard = guardReady();
  if (guard !== null) return guard;
  const outcome = removeObjectMutation(state, collectionId, slug, nowIso());
  if (!outcome.ok) return outcome;
  const persisted = persist(outcome.data);
  if (!persisted.ok) return persisted;
  return { ok: true, removed: outcome.removed };
}

/**
 * Explicit user action only (recovery UI): replaces unreadable/unwanted local
 * data with an empty valid envelope. Never invoked automatically on parse
 * failure.
 */
export function resetCollections(): StoreResult {
  if (!storageAvailable()) {
    return {
      message: "Local storage is not available, so there is nothing to reset in this browser.",
      ok: false,
      reason: "storage-unavailable",
    };
  }
  return persist(EMPTY_COLLECTIONS_DATA);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useCollectionsData(): CollectionsData {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCollectionsStatus(): CollectionsStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => "loading" as CollectionsStatus,
  );
}

/**
 * Imperative reads for non-render contexts (tests today; any future
 * non-React caller). They never touch storage directly — only the hydrated
 * canonical state.
 */
export function getCollectionsSnapshot(): CollectionsData {
  return state;
}

export function getCollectionsStatusSnapshot(): CollectionsStatus {
  ensureHydrated();
  return status;
}

/** True when the slug is already saved in ANY local collection (star glyphs). */
export function useIsObjectSavedAnywhere(slug: string): boolean {
  const data = useCollectionsData();
  return collectionsContainingSlug(data, slug).length > 0;
}

export function useCollectionsContaining(slug: string): Array<LocalCollection> {
  const data = useCollectionsData();
  return collectionsContainingSlug(data, slug);
}

export function useCollectionContains(collectionId: string, slug: string): boolean {
  const data = useCollectionsData();
  const collection = data.collections.find((entry) => entry.id === collectionId);
  return collection !== undefined && collectionContainsSlug(collection, slug);
}
