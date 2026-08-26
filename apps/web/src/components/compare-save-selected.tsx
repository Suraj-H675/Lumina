"use client";

import { useCallback, useState } from "react";

import type { EntityType } from "@lumina/api-client";

import { collectionNameProblem } from "../lib/collections-model";
import {
  addObjectsToCollection,
  createCollection,
  useCollectionsData,
  useCollectionsStatus,
} from "../lib/collections-store";
import { ModalDialog } from "./modal-dialog";

type CompareSaveSelectedProps = Readonly<{
  /** Loaded compare slots, in URL order: slug + display identity snapshot. */
  identities: ReadonlyArray<{ canonical_name: string; entity_type: EntityType; slug: string }>;
}>;

const inputClassName =
  "min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--muted)]";

const buttonClassName =
  "inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]";

/**
 * Save the currently compared OBJECTS into a local collection (never a
 * "comparison session"): pick an existing collection or create one, then one
 * atomic, deduplicating write. Collections contain catalogue objects only.
 */
export function CompareSaveSelected({ identities }: CompareSaveSelectedProps) {
  const status = useCollectionsStatus();
  const data = useCollectionsData();
  const [open, setOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");

  const problem = collectionNameProblem(newName);

  const handleSave = useCallback((): void => {
    let targetId = chosenId;
    // Creating inline without abandoning the comparison.
    if (targetId === "__create__") {
      const created = createCollection(newName);
      if (!created.ok) {
        setMessage(created.message);
        return;
      }
      const createdCollection = created.collection;
      if (createdCollection === undefined) return;
      targetId = createdCollection.id;
    }
    if (targetId === "") return;
    const result = addObjectsToCollection(targetId, identities);
    // Honest idempotence messaging: "already saved" is success, never an
    // error. The dialog stays open with the outcome so it is actually
    // perceivable (and announced via the polite live region below).
    setMessage(
      result.ok
        ? result.addedCount === 0
          ? "Already saved — every object was in the collection."
          : `Saved ${result.addedCount} object${result.addedCount === 1 ? "" : "s"} to the collection.`
        : result.message,
    );
    if (result.ok) {
      setNewName("");
      setChosenId("");
    }
  }, [chosenId, identities, newName]);

  // Render nothing when there is nothing loaded to save.
  if (identities.length === 0) return null;

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={buttonClassName}
        onClick={() => setOpen(true)}
        type="button"
      >
        <span aria-hidden="true">☆</span> Save compared objects
      </button>
      {open ? (
        <ModalDialog
          description="Objects are saved into one of your collections — stored only in this browser."
          onClose={() => setOpen(false)}
          open
          title={`Save ${identities.length} object${identities.length === 1 ? "" : "s"} to a collection`}
        >
          {status !== "ready" ? (
            <p className="text-sm leading-6 text-[var(--muted)]" role="status">
              {status === "loading"
                ? "Checking your saved collections…"
                : status === "corrupted"
                  ? "Your saved collections could not be read. Open Collections to reset them; nothing has been changed meanwhile."
                  : "This browser is blocking local storage, so saving is unavailable right now."}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="compare-save-target">
                  Collection
                </label>
                <select
                  className={inputClassName}
                  id="compare-save-target"
                  onChange={(event) => setChosenId(event.target.value)}
                  value={chosenId}
                >
                  <option value="">Choose a collection…</option>
                  {data.collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                  <option value="__create__">+ New collection…</option>
                </select>
              </div>
              {chosenId === "__create__" ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="compare-save-new-name">
                    New collection name
                  </label>
                  <input
                    className={inputClassName}
                    id="compare-save-new-name"
                    maxLength={80}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="e.g. Interesting Worlds"
                    type="text"
                    value={newName}
                  />
                  <p className="text-sm text-[var(--muted)]">{problem ?? "Up to 60 characters."}</p>
                </div>
              ) : null}
              <p aria-live="polite" className="min-h-6 text-sm text-[var(--muted)]" role="status">
                {message ||
                  `Will save: ${identities.map((identity) => identity.canonical_name).join(", ")}`}
              </p>
              <div className="flex justify-end border-t border-[var(--border)] pt-4">
                <button
                  className={buttonClassName}
                  disabled={chosenId === "" || (chosenId === "__create__" && problem !== null)}
                  onClick={handleSave}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </ModalDialog>
      ) : null}
    </>
  );
}
