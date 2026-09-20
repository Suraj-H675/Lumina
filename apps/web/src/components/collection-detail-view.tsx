"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { COMPARE_MAX_OBJECTS, buildCompareHref } from "../lib/compare-url";
import { entityTypeLabel } from "../lib/catalog-display";
import {
  collectionNameProblemMessage,
  collectionRenameNameHint,
  collectionStoreFailureMessage,
} from "../lib/collections-messages";
import { normalizeCollectionName, type CollectionItemSnapshot } from "../lib/collections-model";
import {
  deleteCollection,
  removeObjectFromCollection,
  renameCollection,
  useCollectionsData,
  useCollectionsStatus,
} from "../lib/collections-store";
import { formatCountMessage, formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { CollectionsMessages } from "../lib/i18n/messages/types";
import {
  CollectionLoadingNote,
  CorruptedStoragePanel,
  StorageUnavailableNote,
} from "./collection-state-blocks";
import { ModalDialog } from "./modal-dialog";
import { AddObjectToCollectionControl } from "./collection-add-object";

/**
 * /collections/[collectionId]: one local collection — browse saved objects
 * (from identity snapshots only), rename, delete with confirmation, remove
 * objects, add objects through the accepted public suggest endpoint, and
 * launch 2–3 saved objects into the existing Phase 1B5 Compare experience.
 */

const primaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]";

const dangerButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[#fda4af] transition-colors hover:border-[#fda4af]";

const secondaryLinkClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]";

type CollectionDetailViewProps = Readonly<{
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
  collectionId: string;
  locale: PublishedLocale;
  messages: CollectionsMessages;
}>;

export function CollectionDetailView({
  apiOrigin,
  collectionId,
  locale,
  messages,
}: CollectionDetailViewProps) {
  const status = useCollectionsStatus();
  const data = useCollectionsData();

  // The id comes from a local-only route; an unknown id is simply not a
  // collection this browser has ever seen.
  const collection = useMemo(
    () => data.collections.find((entry) => entry.id === collectionId),
    [collectionId, data.collections],
  );

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <BackToCollectionsLink messages={messages} />
        <CollectionLoadingNote messages={messages.shared} />
      </div>
    );
  }

  if (status === "unavailable" || status === "corrupted") {
    return (
      <div className="space-y-6">
        <BackToCollectionsLink messages={messages} />
        <StorageUnavailableNote context="page" messages={messages.shared} />
        {status === "corrupted" ? <CorruptedStoragePanel compact messages={messages} /> : null}
      </div>
    );
  }

  if (collection === undefined) {
    return (
      <div className="max-w-xl space-y-6">
        <BackToCollectionsLink messages={messages} />
        <section aria-labelledby="missing-collection-heading">
          <h1 className="text-2xl font-semibold tracking-tight" id="missing-collection-heading">
            {messages.detail.missingTitle}
          </h1>
          <p className="mt-3 leading-7 text-[var(--muted)]">{messages.detail.missingDescription}</p>
          <p className="mt-6">
            <Link className={secondaryLinkClassName} href="/collections">
              {messages.detail.goToCollections}
            </Link>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <BackToCollectionsLink messages={messages} />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{collection.name}</h1>
        <p className="text-lg text-[var(--muted)]">
          {formatMessageTemplate(messages.detail.savedSummary, {
            countText: formatCountMessage(
              messages.detail.objectCount,
              collection.items.length,
              locale,
            ),
          })}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <RenameCollectionButton collection={collection} messages={messages} />
          <DeleteCollectionButton
            collection={{
              id: collection.id,
              itemCount: collection.items.length,
              name: collection.name,
            }}
            locale={locale}
            messages={messages}
          />
        </div>
      </header>

      <CompareSelectionPanel items={collection.items} locale={locale} messages={messages} />

      <section aria-labelledby="add-object-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 id="add-object-heading">{messages.detail.addHeading}</h2>
          <span className="text-sm text-[var(--muted)]">{messages.detail.addDescription}</span>
        </div>
        <AddObjectToCollectionControl
          {...(apiOrigin === undefined ? {} : { apiOrigin })}
          collectionId={collection.id}
          locale={locale}
          messages={messages}
        />
      </section>

      <section aria-labelledby="saved-items-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 id="saved-items-heading">{messages.detail.savedHeading}</h2>
          <span className="text-sm text-[var(--muted)]">{messages.detail.savedDescription}</span>
        </div>
        {collection.items.length === 0 ? (
          <div className="max-w-xl rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-8">
            <h3 className="text-lg font-semibold">{messages.detail.emptyTitle}</h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">{messages.detail.emptyDescription}</p>
            <p className="mt-4">
              <Link className={secondaryLinkClassName} href="/explore">
                {messages.detail.exploreCatalogue}
              </Link>
            </p>
          </div>
        ) : (
          <ul
            aria-label={formatMessageTemplate(messages.detail.objectsListLabel, {
              collectionName: collection.name,
            })}
            className="grid list-none gap-3 p-0 md:grid-cols-2"
          >
            {collection.items.map((item) => (
              <SavedObjectRow
                collectionId={collection.id}
                item={item}
                key={item.slug}
                messages={messages}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BackToCollectionsLink({ messages }: Readonly<{ messages: CollectionsMessages }>) {
  return (
    <Link
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-4 transition-colors hover:text-[var(--foreground)]"
      href="/collections"
    >
      {messages.detail.backToCollections}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Rename / delete — both flow through accessible dialogs, never window.confirm
// ---------------------------------------------------------------------------

function RenameCollectionButton({
  collection,
  messages,
}: Readonly<{ collection: { id: string; name: string }; messages: CollectionsMessages }>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(collection.name);
  const [storeProblem, setStoreProblem] = useState<string | null>(null);
  const allCollections = useCollectionsData().collections;

  const problem = collectionNameProblemMessage(name, messages.validation);
  const normalizedName = normalizeCollectionName(name).toLowerCase();
  const duplicate =
    problem === null &&
    allCollections.some(
      (entry) =>
        entry.id !== collection.id &&
        normalizeCollectionName(entry.name).toLowerCase() === normalizedName,
    );
  const invalid = problem !== null || duplicate;

  // Re-sync the draft whenever the dialog opens so a cancelled attempt never lingers.
  const startRename = useCallback(() => {
    setName(collection.name);
    setStoreProblem(null);
    setOpen(true);
  }, [collection.name]);

  const submit = useCallback(() => {
    if (invalid) return; // the control is disabled anyway
    const result = renameCollection(collection.id, name);
    if (!result.ok) {
      // Storage-level failure: keep the dialog open with the honest message.
      setStoreProblem(collectionStoreFailureMessage(result.reason, messages.failures));
      return;
    }
    setOpen(false);
  }, [collection.id, invalid, messages.failures, name]);

  // Always-present live hint: the requirement, the exact conflict, or the
  // storage failure — never an invisible disabled state.
  const hint =
    problem !== null
      ? problem
      : duplicate
        ? messages.validation.duplicateName
        : (storeProblem ?? collectionRenameNameHint(messages.validation));

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={primaryButtonClassName}
        onClick={startRename}
        type="button"
      >
        {messages.detail.renameAction}
      </button>
      {open ? (
        <ModalDialog
          description={messages.detail.renameDescription}
          onClose={() => setOpen(false)}
          open
          title={messages.detail.renameTitle}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="rename-collection-name">
                {messages.validation.nameLabel}
              </label>
              <input
                aria-describedby="rename-collection-name-hint"
                aria-invalid={invalid || storeProblem !== null ? true : undefined}
                autoComplete="off"
                className="min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--background-raised)] px-3 text-base text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                id="rename-collection-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                type="text"
                value={name}
              />
              <p
                aria-live="polite"
                className="text-sm text-[var(--muted)]"
                id="rename-collection-name-hint"
              >
                {hint}
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                className={primaryButtonClassName}
                onClick={() => setOpen(false)}
                type="button"
              >
                {messages.detail.cancelAction}
              </button>
              <button className={primaryButtonClassName} disabled={invalid} type="submit">
                {messages.detail.saveNameAction}
              </button>
            </div>
          </form>
        </ModalDialog>
      ) : null}
    </>
  );
}

function DeleteCollectionButton({
  collection,
  locale,
  messages,
}: Readonly<{
  collection: { id: string; itemCount: number; name: string };
  locale: PublishedLocale;
  messages: CollectionsMessages;
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const confirmDelete = useCallback(() => {
    const result = deleteCollection(collection.id);
    if (!result.ok) {
      // Keep the dialog open and say exactly why the deletion did not happen.
      setFailure(collectionStoreFailureMessage(result.reason, messages.failures));
      return;
    }
    setOpen(false);
    router.push("/collections");
  }, [collection.id, messages.failures, router]);

  const startDelete = useCallback(() => {
    setFailure(null);
    setOpen(true);
  }, []);

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={dangerButtonClassName}
        onClick={startDelete}
        type="button"
      >
        {messages.detail.deleteAction}
      </button>
      {open ? (
        <ModalDialog
          description={formatMessageTemplate(messages.detail.deleteDescription, {
            collectionName: collection.name,
          })}
          onClose={() => setOpen(false)}
          open
          title={formatMessageTemplate(messages.detail.deleteTitle, {
            collectionName: collection.name,
          })}
        >
          <div className="space-y-4">
            <p className="leading-7 text-[var(--muted)]">
              {formatCountMessage(messages.detail.deleteItemCount, collection.itemCount, locale)}
            </p>
            {failure !== null ? (
              <p className="text-sm text-[#fda4af]" role="alert">
                {failure}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button
                className={primaryButtonClassName}
                onClick={() => setOpen(false)}
                type="button"
              >
                {messages.detail.keepCollectionAction}
              </button>
              <button className={dangerButtonClassName} onClick={confirmDelete} type="button">
                {messages.detail.deleteCollectionAction}
              </button>
            </div>
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Collection → Compare selection (temporary UI state, max 3, reuses 1B5)
// ---------------------------------------------------------------------------

function CompareSelectionPanel({
  items,
  locale,
  messages,
}: Readonly<{
  items: ReadonlyArray<CollectionItemSnapshot>;
  locale: PublishedLocale;
  messages: CollectionsMessages;
}>) {
  const router = useRouter();
  const [selectedSlugs, setSelectedSlugs] = useState<Array<string>>([]);

  const toggle = useCallback((slug: string, checked: boolean) => {
    setSelectedSlugs((current) => {
      if (!checked) return current.filter((entry) => entry !== slug);
      if (current.includes(slug)) return current;
      if (current.length >= COMPARE_MAX_OBJECTS) return current; // never a fourth
      return [...current, slug];
    });
  }, []);

  const atMaximum = selectedSlugs.length >= COMPARE_MAX_OBJECTS;

  const launchCompare = useCallback(() => {
    if (selectedSlugs.length < 2) return;
    // Frozen Phase 1B5 contract: repeated singular object params in selection
    // order; buildCompareHref dedupes and caps by itself.
    router.push(buildCompareHref(selectedSlugs));
  }, [router, selectedSlugs]);

  return (
    <section aria-labelledby="compare-selection-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 id="compare-selection-heading">{messages.detail.compareHeading}</h2>
        <span className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.detail.compareDescription, {
            max: formatLocaleNumber(COMPARE_MAX_OBJECTS, locale),
          })}
        </span>
      </div>

      {items.length < 2 ? (
        <p className="text-sm leading-6 text-[var(--muted)]">{messages.detail.compareEmpty}</p>
      ) : (
        <>
          <ul
            aria-label={messages.detail.selectObjectsLabel}
            className="grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3"
          >
            {items.map((item) => {
              const checked = selectedSlugs.includes(item.slug);
              const blocked = !checked && atMaximum;
              return (
                <li className="min-w-0" key={item.slug}>
                  <label
                    className={`flex min-h-11 items-center gap-2 rounded-sm border px-3 py-2 ${
                      blocked
                        ? "cursor-not-allowed border-[var(--border)] opacity-60"
                        : "cursor-pointer border-[var(--border)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <input
                      checked={checked}
                      className="h-4 w-4 accent-[var(--accent)]"
                      disabled={blocked}
                      onChange={(event) => toggle(item.slug, event.target.checked)}
                      type="checkbox"
                    />
                    <span className="truncate text-sm font-medium">{item.canonical_name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={primaryButtonClassName}
              disabled={selectedSlugs.length < 2}
              onClick={launchCompare}
              type="button"
            >
              {selectedSlugs.length > 0
                ? formatMessageTemplate(messages.detail.compareSelectedWithCount, {
                    count: formatLocaleNumber(selectedSlugs.length, locale),
                  })
                : messages.detail.compareSelected}
            </button>
            {atMaximum ? (
              <span className="text-sm text-[var(--muted)]" role="status">
                {formatMessageTemplate(messages.detail.compareMaximumReached, {
                  max: formatLocaleNumber(COMPARE_MAX_OBJECTS, locale),
                })}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Saved rows — identity snapshots only; scientific data stays behind /objects
// ---------------------------------------------------------------------------

function SavedObjectRow({
  collectionId,
  item,
  messages,
}: Readonly<{
  collectionId: string;
  item: CollectionItemSnapshot;
  messages: CollectionsMessages;
}>) {
  const [failure, setFailure] = useState<string | null>(null);

  const handleRemove = useCallback(() => {
    const result = removeObjectFromCollection(collectionId, item.slug);
    // Storage failure keeps the row in place; say why instead of staying mute.
    setFailure(result.ok ? null : collectionStoreFailureMessage(result.reason, messages.failures));
  }, [collectionId, item.slug, messages]);

  return (
    <li className="list-none">
      <div className="flex h-full flex-col justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4 sm:flex-row sm:items-center">
        <Link className="min-w-0 flex-1 no-underline" href={`/objects/${item.slug}`}>
          <span className="block truncate text-lg font-semibold tracking-tight text-[var(--foreground)] underline-offset-4 hover:underline">
            {item.canonical_name}
          </span>
          <span className="block text-sm text-[var(--muted)]">
            {entityTypeLabel(item.entity_type)}
          </span>
          {failure !== null ? (
            <span className="mt-1 block text-xs text-[#fda4af]" role="alert">
              {failure}
            </span>
          ) : null}
        </Link>
        <button
          aria-label={formatMessageTemplate(messages.detail.removeObjectLabel, {
            objectName: item.canonical_name,
          })}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          onClick={handleRemove}
          type="button"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </li>
  );
}
