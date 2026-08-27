"use client";

import { useCallback, useState } from "react";

import type { EntityType } from "@lumina/api-client";

import {
  MAX_ITEMS_PER_COLLECTION,
  collectionContainsSlug,
  collectionNameProblem,
} from "../lib/collections-model";
import {
  addObjectToCollection,
  createCollectionWithObjects,
  removeObjectFromCollection,
  resetCollections,
  useCollectionsContaining,
  useCollectionsData,
  useCollectionsStatus,
  type StoreResult,
} from "../lib/collections-store";
import { ModalDialog } from "./modal-dialog";

/**
 * Local-collection saving entry points: a trigger button (two visual weights)
 * plus the accessible picker dialog. All persistence flows through the one
 * canonical store; this component never touches localStorage itself.
 */

export type ObjectIdentity = Readonly<{
  slug: string;
  /** Local display snapshot only; scientific detail stays behind the API. */
  canonical_name: string;
  entity_type: EntityType;
}>;

const inputClassName =
  "min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--muted)]";

const primaryButtonClassName =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]";

const iconButtonClassName =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-[var(--border)] bg-[var(--surface)] text-base text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]";

/** The shared picker dialog: choose collections, create one, or recover. */
export function SaveToCollectionsDialog({
  identity,
  onClose,
}: Readonly<{ identity: ObjectIdentity; onClose: () => void }>) {
  const status = useCollectionsStatus();
  const data = useCollectionsData();
  const [newName, setNewName] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [resetArmed, setResetArmed] = useState(false);

  const announceResult = useCallback((result: StoreResult, successText: string): boolean => {
    setAnnouncement(result.ok ? successText : result.message);
    return result.ok;
  }, []);

  const toggleMembership = useCallback(
    (collectionId: string, collectionName: string, currentlySaved: boolean) => {
      const result = currentlySaved
        ? removeObjectFromCollection(collectionId, identity.slug)
        : addObjectToCollection(collectionId, identity);
      announceResult(
        result,
        currentlySaved
          ? `Removed ${identity.canonical_name} from ${collectionName}.`
          : `Saved ${identity.canonical_name} to ${collectionName}.`,
      );
    },
    [announceResult, identity],
  );

  const handleCreate = useCallback(() => {
    const created = createCollectionWithObjects(newName, [identity]);
    if (!created.ok) {
      setAnnouncement(created.message);
      return;
    }
    const createdCollection = created.collection;
    if (createdCollection === undefined) {
      setAnnouncement("The collection was created, but could not be opened for saving.");
      return;
    }
    setNewName("");
    announceResult(
      created,
      `Created ${createdCollection.name} and saved ${identity.canonical_name}.`,
    );
  }, [announceResult, identity, newName]);

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      setAnnouncement(
        "Resetting erases every local collection on this device. Confirm to continue.",
      );
      return;
    }
    const result = resetCollections();
    setResetArmed(false);
    announceResult(result, "Local collections were cleared.");
  }, [announceResult, resetArmed]);

  return (
    <ModalDialog
      description={`Collections are stored only in this browser on this device. Choose where to save ${identity.canonical_name}.`}
      onClose={onClose}
      open
      title="Save to a collection"
    >
      {status === "loading" ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          Checking your saved collections…
        </p>
      ) : null}

      {status === "unavailable" ? (
        <p className="text-sm leading-6 text-[var(--muted)]" role="status">
          This browser is blocking local storage, so Lumina cannot save collections here right now.
          Browsing and comparing still work normally.
        </p>
      ) : null}

      {status === "corrupted" ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-[var(--muted)]" role="status">
            Your saved collections could not be read from this browser&apos;s storage. Nothing has
            been changed or deleted — resetting replaces them with an empty slate. Browsing, search,
            and comparison remain available meanwhile.
          </p>
          <button
            aria-label={
              resetArmed
                ? "Confirm: reset all local collections"
                : "Reset all local collections on this device"
            }
            className={primaryButtonClassName}
            onClick={handleReset}
            type="button"
          >
            {resetArmed ? "Confirm reset — erase all local collections" : "Reset local collections"}
          </button>
        </div>
      ) : null}

      {status === "ready" ? (
        <div className="space-y-5">
          {data.collections.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No collections yet — name your first one below.
            </p>
          ) : (
            <ul aria-label="Your collections" className="space-y-2 p-0">
              {data.collections.map((collection) => {
                const savedHere = collectionContainsSlug(collection, identity.slug);
                const full = collection.items.length >= MAX_ITEMS_PER_COLLECTION && !savedHere;
                return (
                  <li
                    className={`flex min-h-11 items-center justify-between gap-3 rounded-sm border px-3 py-2 ${
                      full ? "border-[var(--border)] opacity-60" : "border-[var(--border)]"
                    }`}
                    key={collection.id}
                  >
                    {/* The label wraps only the checkbox and its name so the
                        control's accessible name stays exactly the collection. */}
                    <label
                      className={`flex min-w-0 flex-1 items-center gap-2 ${
                        full ? "cursor-not-allowed" : "cursor-pointer"
                      }`}
                    >
                      <input
                        checked={savedHere}
                        className="h-4 w-4 accent-[var(--accent)]"
                        disabled={full}
                        onChange={() => toggleMembership(collection.id, collection.name, savedHere)}
                        type="checkbox"
                      />
                      <span className="truncate font-medium text-[var(--foreground)]">
                        {collection.name}
                      </span>
                    </label>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {full ? "Full" : `${collection.items.length} saved`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="space-y-2 border-t border-[var(--border)] pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreate();
            }}
          >
            <label
              className="block text-sm font-medium text-[var(--foreground)]"
              htmlFor="save-picker-new-collection"
            >
              New collection
            </label>
            <div className="flex gap-2">
              <input
                autoComplete="off"
                className={inputClassName}
                id="save-picker-new-collection"
                maxLength={80}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Interesting Worlds"
                type="text"
                value={newName}
              />
              <button
                className={`${primaryButtonClassName} shrink-0`}
                disabled={collectionNameProblem(newName) !== null}
                type="submit"
              >
                Create
              </button>
            </div>
          </form>

          <p aria-live="polite" className="min-h-6 text-sm text-[var(--muted)]" role="status">
            {announcement}
          </p>

          <div className="flex justify-end border-t border-[var(--border)] pt-4">
            <button className={primaryButtonClassName} onClick={onClose} type="button">
              Done
            </button>
          </div>
        </div>
      ) : null}
    </ModalDialog>
  );
}

type SaveToCollectionsButtonProps = Readonly<{
  identity: ObjectIdentity;
  /** "primary" for object/compare pages; "icon" for compact catalogue cards. */
  variant?: "primary" | "icon";
}>;

/**
 * Trigger + dialog pair. The star reflects local membership honestly: hollow
 * before any save, filled once this object lives in any collection on this
 * browser. State comes from the store snapshot, so it updates across tabs too.
 */
export function SaveToCollectionsButton({
  identity,
  variant = "primary",
}: SaveToCollectionsButtonProps) {
  const [open, setOpen] = useState(false);
  const savedAnywhere = useCollectionsContaining(identity.slug).length > 0;

  const accessibleName = savedAnywhere
    ? `Saved. Manage where ${identity.canonical_name} is saved`
    : `Save ${identity.canonical_name} to a collection`;

  return (
    <>
      {variant === "icon" ? (
        <button
          aria-label={accessibleName}
          className={iconButtonClassName}
          onClick={(event) => {
            // Card-level stopPropagation is unnecessary (the card link is a
            // sibling, not an ancestor), but prevent default anyway in case a
            // future layout nests the button inside a link.
            event.preventDefault();
            setOpen(true);
          }}
          title={accessibleName}
          type="button"
        >
          <span aria-hidden="true">{savedAnywhere ? "★" : "☆"}</span>
        </button>
      ) : (
        <button
          aria-label={accessibleName}
          className={primaryButtonClassName}
          onClick={() => setOpen(true)}
          type="button"
        >
          <span aria-hidden="true">{savedAnywhere ? "★" : "☆"}</span>
          {savedAnywhere ? "Saved" : "Save"}
        </button>
      )}
      {open ? <SaveToCollectionsDialog identity={identity} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
