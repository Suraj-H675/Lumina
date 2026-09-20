"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { useRouter } from "next/navigation";

import {
  collectionDefaultNameHint,
  collectionNameProblemMessage,
  collectionStoreFailureMessage,
} from "../lib/collections-messages";
import { normalizeCollectionName } from "../lib/collections-model";
import {
  createCollection,
  useCollectionsData,
  useCollectionsStatus,
} from "../lib/collections-store";
import { formatCountMessage } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { CollectionsMessages } from "../lib/i18n/messages/types";
import {
  CollectionLoadingNote,
  CorruptedStoragePanel,
  StorageUnavailableNote,
} from "./collection-state-blocks";
import { ModalDialog } from "./modal-dialog";

/**
 * /collections overview: create, browse, and open local collections. The
 * server renders the static shell; everything collection-shaped hydrates
 * locally through the one canonical store.
 */

const inputClassName =
  "min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)] outline-none focus:border-[var(--border-strong)] placeholder:text-[var(--muted)]";

const primaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-hover)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--accent)]";

const secondaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]";

export function CollectionsOverview({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: CollectionsMessages }>) {
  const status = useCollectionsStatus();
  const data = useCollectionsData();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  const handleCreated = useCallback(
    (collectionId: string) => {
      setCreateOpen(false);
      // Land inside the new collection so the next step (saving objects) is
      // one obvious click away.
      router.push(`/collections/${collectionId}`);
    },
    [router],
  );

  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.overview.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.overview.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.overview.intro}</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          aria-haspopup="dialog"
          className={primaryButtonClassName}
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          {messages.overview.createAction}
        </button>
        <Link className={secondaryButtonClassName} href="/explore">
          {messages.overview.exploreObjects}
        </Link>
      </div>

      <section aria-labelledby="your-collections-heading" className="space-y-4">
        <h2 id="your-collections-heading" className="sr-only">
          {messages.overview.sectionLabel}
        </h2>
        {status === "loading" ? (
          <CollectionLoadingNote messages={messages.shared} />
        ) : status === "unavailable" ? (
          <StorageUnavailableNote context="page" messages={messages.shared} />
        ) : status === "corrupted" ? (
          <CorruptedStoragePanel messages={messages} />
        ) : data.collections.length === 0 ? (
          <div className="max-w-xl rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-8">
            <h3 className="text-lg font-semibold">{messages.overview.emptyTitle}</h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">
              {messages.overview.emptyDescription}
            </p>
            <p className="mt-4 flex flex-wrap gap-3">
              <button
                aria-haspopup="dialog"
                className={primaryButtonClassName}
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                {messages.overview.createFirstAction}
              </button>
              <Link className={secondaryButtonClassName} href="/explore">
                {messages.overview.browseObjects}
              </Link>
            </p>
          </div>
        ) : (
          <ul
            aria-label={messages.overview.sectionLabel}
            className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
          >
            {data.collections.map((collection) => (
              <li className="list-none min-w-0" key={collection.id}>
                <Link
                  className="flex h-full min-h-11 min-w-0 flex-col justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  href={`/collections/${collection.id}`}
                >
                  <span className="block truncate text-lg font-semibold tracking-tight text-[var(--foreground)]">
                    {collection.name}
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {formatCountMessage(
                      messages.overview.objectCount,
                      collection.items.length,
                      locale,
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {createOpen ? (
        <CreateCollectionDialog
          messages={messages}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}

type CreateCollectionDialogProps = Readonly<{
  messages: CollectionsMessages;
  onClose: () => void;
  onCreated: (collectionId: string) => void;
}>;

/** Accessible create flow: live validation hints, Enter submits, Escape cancels. */
function CreateCollectionDialog({ messages, onClose, onCreated }: CreateCollectionDialogProps) {
  const [name, setName] = useState("");
  const [storeProblem, setStoreProblem] = useState<string | null>(null);
  const existingCollections = useCollectionsData().collections;

  const problem = collectionNameProblemMessage(name, messages.validation);
  const normalizedName = normalizeCollectionName(name).toLowerCase();
  const duplicate =
    problem === null &&
    existingCollections.some(
      (collection) => normalizeCollectionName(collection.name).toLowerCase() === normalizedName,
    );
  const invalid = problem !== null || duplicate;

  const handleSubmit = useCallback(() => {
    if (problem !== null || duplicate) return; // control is disabled anyway
    const result = createCollection(name);
    if (!result.ok) {
      // Storage-level failure: say exactly what happened instead of doing
      // nothing, and never pretend the collection exists.
      setStoreProblem(collectionStoreFailureMessage(result.reason, messages.failures));
      return;
    }
    const createdId = result.collection?.id;
    if (createdId !== undefined) onCreated(createdId);
  }, [duplicate, messages.failures, name, onCreated, problem]);

  // One always-present polite hint doubles as the accessible description, so
  // screen readers hear the requirement (or the exact problem) immediately —
  // including when the submit control is disabled for an invisible reason.
  const hint =
    problem !== null
      ? problem
      : duplicate
        ? messages.validation.duplicateName
        : (storeProblem ?? collectionDefaultNameHint(messages.validation));

  return (
    <ModalDialog
      description={messages.overview.createDialogDescription}
      onClose={onClose}
      open
      title={messages.overview.createDialogTitle}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="create-collection-name">
            {messages.validation.nameLabel}
          </label>
          <input
            aria-describedby="create-collection-name-hint"
            aria-invalid={invalid || storeProblem !== null ? true : undefined}
            autoComplete="off"
            className={inputClassName}
            id="create-collection-name"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder={messages.validation.placeholder}
            type="text"
            value={name}
          />
          <p
            aria-live="polite"
            className="text-sm text-[var(--muted)]"
            id="create-collection-name-hint"
          >
            {hint}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button className={secondaryButtonClassName} onClick={onClose} type="button">
            {messages.detail.cancelAction}
          </button>
          <button className={primaryButtonClassName} disabled={invalid} type="submit">
            {messages.overview.createSubmitAction}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
