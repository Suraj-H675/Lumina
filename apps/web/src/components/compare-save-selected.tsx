"use client";

import { useCallback, useState } from "react";

import type { EntityType } from "@lumina/api-client";

import {
  collectionNameProblemMessage,
  collectionRenameNameHint,
  collectionStoreFailureMessage,
} from "../lib/collections-messages";
import {
  addObjectsToCollection,
  createCollectionWithObjects,
  useCollectionsData,
  useCollectionsStatus,
} from "../lib/collections-store";
import { formatCountMessage, formatLocaleList, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { CollectionSaveMessages } from "../lib/i18n/messages/types";
import { ModalDialog } from "./modal-dialog";

type CompareSaveSelectedProps = Readonly<{
  /** Loaded compare slots, in URL order: slug + display identity snapshot. */
  identities: ReadonlyArray<{ canonical_name: string; entity_type: EntityType; slug: string }>;
  locale: PublishedLocale;
  messages: CollectionSaveMessages;
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
export function CompareSaveSelected({ identities, locale, messages }: CompareSaveSelectedProps) {
  const status = useCollectionsStatus();
  const data = useCollectionsData();
  const [open, setOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");

  const problem = collectionNameProblemMessage(newName, messages.validation);

  const handleSave = useCallback((): void => {
    const targetId = chosenId;
    // Creating inline without abandoning the comparison.
    if (targetId === "__create__") {
      const created = createCollectionWithObjects(newName, identities);
      if (!created.ok) {
        setMessage(collectionStoreFailureMessage(created.reason, messages.failures));
        return;
      }
      const createdCollection = created.collection;
      if (createdCollection === undefined) return;
      const addedCount = created.addedCount ?? identities.length;
      setMessage(
        formatMessageTemplate(messages.save.compare.savedToNamedCollection, {
          collectionName: createdCollection.name,
          countText: formatCountMessage(messages.save.compare.objectCount, addedCount, locale),
        }),
      );
      setNewName("");
      setChosenId("");
      return;
    }
    if (targetId === "") return;
    const result = addObjectsToCollection(targetId, identities);
    // Honest idempotence messaging: "already saved" is success, never an
    // error. The dialog stays open with the outcome so it is actually
    // perceivable (and announced via the polite live region below).
    setMessage(
      result.ok
        ? result.addedCount === 0
          ? messages.save.compare.alreadySaved
          : formatMessageTemplate(messages.save.compare.savedToCollection, {
              countText: formatCountMessage(
                messages.save.compare.objectCount,
                result.addedCount ?? 0,
                locale,
              ),
            })
        : collectionStoreFailureMessage(result.reason, messages.failures),
    );
    if (result.ok) {
      setNewName("");
      setChosenId("");
    }
  }, [chosenId, identities, locale, messages, newName]);

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
        <span aria-hidden="true">☆</span> {messages.save.compare.triggerAction}
      </button>
      {open ? (
        <ModalDialog
          description={messages.save.compare.description}
          onClose={() => setOpen(false)}
          open
          title={formatMessageTemplate(messages.save.compare.title, {
            countText: formatCountMessage(
              messages.save.compare.objectCount,
              identities.length,
              locale,
            ),
          })}
        >
          {status !== "ready" ? (
            <p className="text-sm leading-6 text-[var(--muted)]" role="status">
              {status === "loading"
                ? messages.save.loading
                : status === "corrupted"
                  ? messages.save.compare.corrupted
                  : messages.save.compare.unavailable}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="compare-save-target">
                  {messages.save.compare.collectionLabel}
                </label>
                <select
                  className={inputClassName}
                  id="compare-save-target"
                  onChange={(event) => setChosenId(event.target.value)}
                  value={chosenId}
                >
                  <option value="">{messages.save.compare.chooseCollection}</option>
                  {data.collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                  <option value="__create__">{messages.save.compare.newCollectionOption}</option>
                </select>
              </div>
              {chosenId === "__create__" ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium" htmlFor="compare-save-new-name">
                    {messages.save.compare.newCollectionNameLabel}
                  </label>
                  <input
                    className={inputClassName}
                    id="compare-save-new-name"
                    maxLength={80}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder={messages.validation.placeholder}
                    type="text"
                    value={newName}
                  />
                  <p className="text-sm text-[var(--muted)]">
                    {problem ?? collectionRenameNameHint(messages.validation)}
                  </p>
                </div>
              ) : null}
              <p aria-live="polite" className="min-h-6 text-sm text-[var(--muted)]" role="status">
                {message ||
                  formatMessageTemplate(messages.save.compare.willSave, {
                    objects: formatLocaleList(
                      identities.map((identity) => identity.canonical_name),
                      locale,
                    ),
                  })}
              </p>
              <div className="flex justify-end border-t border-[var(--border)] pt-4">
                <button
                  className={buttonClassName}
                  disabled={chosenId === "" || (chosenId === "__create__" && problem !== null)}
                  onClick={handleSave}
                  type="button"
                >
                  {messages.save.compare.saveAction}
                </button>
              </div>
            </div>
          )}
        </ModalDialog>
      ) : null}
    </>
  );
}
