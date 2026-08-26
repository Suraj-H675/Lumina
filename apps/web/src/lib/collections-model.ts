import type { EntityType } from "@lumina/api-client";

/**
 * Pure domain model for browser-local object collections (Phase 1B6).
 *
 * Persisted localStorage content is UNTRUSTED input: everything read back from
 * storage flows through {@link validateCollectionsData} before it can become
 * application state, and every mutation constructs the intended next state
 * immutably so persistence happens through one bounded write. This module is
 * side-effect free on purpose — storage access lives in collections-store.ts.
 */

/** Canonical localStorage key; the version suffix is part of the contract. */
export const COLLECTIONS_STORAGE_KEY = "lumina.collections.v1";

/** Safety guards against runaway corrupted state — not scientific constraints. */
export const MAX_COLLECTIONS = 50;
export const MAX_ITEMS_PER_COLLECTION = 100;

/** Human-readable collection-name bounds (Unicode code points). */
export const COLLECTION_NAME_MAX_CODE_POINTS = 60;

/** Display snapshots stay small; canonical names in the slice are far shorter. */
const MAX_IDENTITY_NAME_LENGTH = 200;
const MAX_SLUG_LENGTH = 100;
const MAX_ID_LENGTH = 100;

/** Mirrors the accepted public slug vocabulary so junk never becomes identity. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** Locally generated ids are UUIDs; the pattern keeps junk out of route hrefs. */
const COLLECTION_ID_PATTERN = /^[0-9a-z-]+$/iu;

/**
 * Closed persisted entity-type vocabulary, mirrored from the generated public
 * contract. Compile-time exhaustiveness is checked against EntityType so a
 * contract change breaks this file loudly instead of corrupting snapshots.
 */
const ENTITY_TYPES = [
  "star",
  "planet",
  "dwarf_planet",
  "moon",
  "asteroid",
  "comet",
  "exoplanet",
  "galaxy",
  "nebula",
  "cluster",
  "black_hole",
  "compact_object",
  "system",
  "constellation",
  "mission",
  "spacecraft",
  "launch_vehicle",
  "observatory",
  "person",
  "concept",
  "event",
] as const satisfies ReadonlyArray<EntityType>;

export type CollectionItemSnapshot = Readonly<{
  /** Durable catalogue identity; the only membership key. */
  slug: string;
  /** Local display snapshot only — never a second scientific database. */
  canonical_name: string;
  entity_type: EntityType;
  saved_at: string;
}>;

export type LocalCollection = Readonly<{
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  items: Array<CollectionItemSnapshot>;
}>;

export type CollectionsData = Readonly<{
  version: 1;
  collections: Array<LocalCollection>;
}>;

/** Stable server/hydration fallback: no storage access during render. */
export const EMPTY_COLLECTIONS_DATA: CollectionsData = { collections: [], version: 1 };

export type ObjectIdentityInput = Readonly<{
  slug: string;
  canonical_name: string;
  entity_type: EntityType;
}>;

export type MutationFailureReason =
  "invalid-name" | "duplicate-name" | "collection-limit" | "item-limit" | "collection-not-found";

export type MutationSuccess<R = Record<string, never>> = Readonly<
  { data: CollectionsData; ok: true } & R
>;

export type MutationFailure = Readonly<{
  message: string;
  ok: false;
  reason: MutationFailureReason;
}>;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isString(value) || value.length === 0 || value.length > 40) return false;
  return !Number.isNaN(Date.parse(value));
}

function isEntityType(value: unknown): value is EntityType {
  return isString(value) && (ENTITY_TYPES as ReadonlyArray<string>).includes(value);
}

/** Slugs follow the accepted public vocabulary (lowercase hyphen-separated). */
export function isValidCollectionSlug(value: unknown): value is string {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

/** Trim surrounding whitespace and collapse accidental whitespace runs. */
export function normalizeCollectionName(raw: string): string {
  return raw.trim().replaceAll(/\s+/gu, " ");
}

function isValidCollectionName(value: unknown): value is string {
  if (!isString(value)) return false;
  const normalized = normalizeCollectionName(value);
  if (normalized.length === 0) return false;
  return [...normalized].length <= COLLECTION_NAME_MAX_CODE_POINTS;
}

/**
 * Human-readable problem with a proposed name, or null when acceptable.
 * Case-insensitive duplicate detection needs surrounding data, so callers
 * combine this with {@link findDuplicateCollectionName}.
 */
export function collectionNameProblem(raw: string): string | null {
  const normalized = normalizeCollectionName(raw);
  if (normalized.length === 0) return "Give the collection a name.";
  if ([...normalized].length > COLLECTION_NAME_MAX_CODE_POINTS) {
    return `Keep the name within ${COLLECTION_NAME_MAX_CODE_POINTS} characters.`;
  }
  return null;
}

/** Case-insensitive duplicate-name lookup over normalized names. */
export function findDuplicateCollectionName(
  data: CollectionsData,
  rawName: string,
  excludeId?: string,
): LocalCollection | undefined {
  const candidate = normalizeCollectionName(rawName).toLowerCase();
  return data.collections.find(
    (collection) =>
      collection.id !== excludeId && collection.name.trim().toLowerCase() === candidate,
  );
}

function isCollectionItem(value: unknown): value is CollectionItemSnapshot {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isValidCollectionSlug(record.slug) &&
    isString(record.canonical_name) &&
    record.canonical_name.trim().length > 0 &&
    record.canonical_name.length <= MAX_IDENTITY_NAME_LENGTH &&
    isEntityType(record.entity_type) &&
    isIsoTimestamp(record.saved_at)
  );
}

function isLocalCollection(value: unknown): value is LocalCollection {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    !isString(record.id) ||
    record.id.length === 0 ||
    record.id.length > MAX_ID_LENGTH ||
    !COLLECTION_ID_PATTERN.test(record.id) ||
    !isValidCollectionName(record.name) ||
    !isIsoTimestamp(record.created_at) ||
    !isIsoTimestamp(record.updated_at) ||
    !Array.isArray(record.items) ||
    // Read-side enforcement of the safety guards so a hand-tampered payload
    // cannot hydrate an unbounded list into the UI.
    record.items.length > MAX_ITEMS_PER_COLLECTION
  ) {
    return false;
  }
  const seenSlugs = new Set<string>();
  for (const item of record.items) {
    if (!isCollectionItem(item)) return false;
    if (seenSlugs.has(item.slug)) return false;
    seenSlugs.add(item.slug);
  }
  return true;
}

/**
 * Validate untrusted persisted data against schema version 1.
 *
 * Returns null for ANY structural violation — wrong envelope, unknown schema
 * version, malformed fields, or duplicate slugs inside one collection.
 * Callers must enter a bounded recovery state instead of guessing or
 * silently destroying data. Duplicate collection NAMES are tolerated on read
 * (concurrent renames across tabs may legitimately produce them); writers
 * still enforce uniqueness.
 */
export function validateCollectionsData(value: unknown): CollectionsData | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  if (!Array.isArray(record.collections)) return null;
  if (record.collections.length > MAX_COLLECTIONS) return null;
  const seenIds = new Set<string>();
  for (const entry of record.collections) {
    if (!isLocalCollection(entry)) return null;
    if (seenIds.has(entry.id)) return null;
    seenIds.add(entry.id);
  }
  return { collections: record.collections, version: 1 };
}

// ---------------------------------------------------------------------------
// Pure mutations — construct the next state; callers persist it exactly once.
// ---------------------------------------------------------------------------

function withUpdatedItems(
  collection: LocalCollection,
  items: Array<CollectionItemSnapshot>,
  updatedAt: string,
): LocalCollection {
  return { ...collection, items, updated_at: updatedAt };
}

export function createCollectionMutation(
  data: CollectionsData,
  rawName: string,
  id: string,
  now: string,
): MutationSuccess<{ collection: LocalCollection }> | MutationFailure {
  const name = normalizeCollectionName(rawName);
  const nameProblem = collectionNameProblem(name);
  if (nameProblem !== null) return { message: nameProblem, ok: false, reason: "invalid-name" };
  if (findDuplicateCollectionName(data, name) !== undefined) {
    return {
      message: "You already have a collection with this name.",
      ok: false,
      reason: "duplicate-name",
    };
  }
  if (data.collections.length >= MAX_COLLECTIONS) {
    return {
      message: `You have reached the maximum of ${MAX_COLLECTIONS} collections.`,
      ok: false,
      reason: "collection-limit",
    };
  }
  const collection: LocalCollection = {
    created_at: now,
    id,
    items: [],
    name,
    updated_at: now,
  };
  return {
    collection,
    data: { collections: [...data.collections, collection], version: 1 },
    ok: true,
  };
}

export function renameCollectionMutation(
  data: CollectionsData,
  collectionId: string,
  rawName: string,
  now: string,
): MutationSuccess<{ collection: LocalCollection }> | MutationFailure {
  const existing = data.collections.find((collection) => collection.id === collectionId);
  if (existing === undefined) {
    return {
      message: "That collection no longer exists on this device.",
      ok: false,
      reason: "collection-not-found",
    };
  }
  const name = normalizeCollectionName(rawName);
  const nameProblem = collectionNameProblem(name);
  if (nameProblem !== null) return { message: nameProblem, ok: false, reason: "invalid-name" };
  if (findDuplicateCollectionName(data, name, collectionId) !== undefined) {
    return {
      message: "You already have a collection with this name.",
      ok: false,
      reason: "duplicate-name",
    };
  }
  const collection: LocalCollection = { ...existing, name, updated_at: now };
  return {
    collection,
    data: {
      collections: data.collections.map((entry) =>
        entry.id === collectionId ? collection : entry,
      ),
      version: 1,
    },
    ok: true,
  };
}

/** Deleting a missing collection is a harmless no-op (idempotent). */
export function deleteCollectionMutation(
  data: CollectionsData,
  collectionId: string,
): Readonly<{ data: CollectionsData; ok: true }> | MutationFailure {
  return {
    data: {
      collections: data.collections.filter((entry) => entry.id !== collectionId),
      version: 1,
    },
    ok: true,
  };
}

/**
 * Add object identity snapshots to one collection in one atomic step.
 *
 * Incoming slugs deduplicate against each other AND against existing items;
 * existing item order is untouched and new unique items append in request
 * order. Saving an already-present slug is idempotent, never an error, and
 * never reorders.
 */
export function addObjectsMutation(
  data: CollectionsData,
  collectionId: string,
  identities: ReadonlyArray<ObjectIdentityInput>,
  now: string,
): MutationSuccess<{ addedCount: number; existingCount: number }> | MutationFailure {
  const existing = data.collections.find((collection) => collection.id === collectionId);
  if (existing === undefined) {
    return {
      message: "That collection no longer exists on this device.",
      ok: false,
      reason: "collection-not-found",
    };
  }

  const presentSlugs = new Set(existing.items.map((item) => item.slug));
  const requestedSlugs = new Set<string>();
  const additions: Array<CollectionItemSnapshot> = [];
  let existingCount = 0;
  for (const identity of identities) {
    if (requestedSlugs.has(identity.slug)) continue; // deduplicate the request itself
    requestedSlugs.add(identity.slug);
    if (presentSlugs.has(identity.slug)) {
      // Already a member: idempotent no-op for this slug, never an error.
      existingCount += 1;
      continue;
    }
    presentSlugs.add(identity.slug);
    additions.push({
      canonical_name: identity.canonical_name,
      entity_type: identity.entity_type,
      saved_at: now,
      slug: identity.slug,
    });
  }

  const freeSlots = MAX_ITEMS_PER_COLLECTION - existing.items.length;
  if (additions.length > freeSlots) {
    return {
      message:
        freeSlots === 0
          ? `This collection is full (${MAX_ITEMS_PER_COLLECTION} objects maximum).`
          : `Not enough room — only ${freeSlots} more object${freeSlots === 1 ? "" : "s"} fit${freeSlots === 1 ? "s" : ""} in this collection.`,
      ok: false,
      reason: "item-limit",
    };
  }

  const addedCount = additions.length;
  const nextItems = additions.length === 0 ? existing.items : [...existing.items, ...additions];
  const nextCollection = addedCount === 0 ? existing : withUpdatedItems(existing, nextItems, now);
  return {
    addedCount,
    // Objects requested that were already members (deduplicated, not re-added).
    existingCount,
    data: {
      collections: data.collections.map((entry) =>
        entry.id === collectionId ? nextCollection : entry,
      ),
      version: 1,
    },
    ok: true,
  };
}

/** Removing a slug that is not present is a harmless no-op (idempotent). */
export function removeObjectMutation(
  data: CollectionsData,
  collectionId: string,
  slug: string,
  now: string,
): MutationSuccess<{ removed: boolean }> | MutationFailure {
  const existing = data.collections.find((collection) => collection.id === collectionId);
  if (existing === undefined) {
    return {
      message: "That collection no longer exists on this device.",
      ok: false,
      reason: "collection-not-found",
    };
  }
  const removed = existing.items.some((item) => item.slug === slug);
  if (!removed) {
    return { data, ok: true, removed: false };
  }
  const nextItems = existing.items.filter((item) => item.slug !== slug);
  return {
    data: {
      collections: data.collections.map((entry) =>
        entry.id === collectionId ? withUpdatedItems(existing, nextItems, now) : entry,
      ),
      version: 1,
    },
    ok: true,
    removed: true,
  };
}

/** Collections (plural) currently containing the given slug — for star glyphs. */
export function collectionsContainingSlug(
  data: CollectionsData,
  slug: string,
): Array<LocalCollection> {
  return data.collections.filter((collection) =>
    collection.items.some((item) => item.slug === slug),
  );
}

export function collectionContainsSlug(collection: LocalCollection, slug: string): boolean {
  return collection.items.some((item) => item.slug === slug);
}
