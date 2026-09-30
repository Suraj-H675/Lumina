"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { COMPARE_MAX_OBJECTS, buildCompareHref } from "../lib/compare-url";
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
import type { CollectionsMessages, EntityTypeMessages } from "../lib/i18n/messages/types";
import {
  CollectionLoadingNote,
  CorruptedStoragePanel,
  StorageUnavailableNote,
} from "./collection-state-blocks";
import styles from "./collections-experience.module.css";
import { ModalDialog } from "./modal-dialog";
import { AddObjectToCollectionControl } from "./collection-add-object";

/**
 * /collections/[collectionId]: one local collection — browse saved objects
 * (from identity snapshots only), rename, delete with confirmation, remove
 * objects, add objects through the accepted public suggest endpoint, and
 * launch 2–3 saved objects into the Compare experience.
 */

const primaryButtonClassName = styles.secondaryAction;
const dangerButtonClassName = styles.dangerAction;
const secondaryLinkClassName = styles.secondaryAction;

type CollectionDetailViewProps = Readonly<{
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
  collectionId: string;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: CollectionsMessages;
}>;

export function CollectionDetailView({
  apiOrigin,
  collectionId,
  entityTypeMessages,
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
      <div className={styles.detailPage}>
        <BackToCollectionsLink messages={messages} />
        <CollectionLoadingNote messages={messages.shared} />
      </div>
    );
  }

  if (status === "unavailable" || status === "corrupted") {
    return (
      <div className={styles.detailPage}>
        <BackToCollectionsLink messages={messages} />
        <StorageUnavailableNote context="page" messages={messages.shared} />
        {status === "corrupted" ? <CorruptedStoragePanel compact messages={messages} /> : null}
      </div>
    );
  }

  if (collection === undefined) {
    return (
      <div className={styles.detailPage}>
        <BackToCollectionsLink messages={messages} />
        <section aria-labelledby="missing-collection-heading" className={styles.statusPanel}>
          <h1 id="missing-collection-heading">{messages.detail.missingTitle}</h1>
          <p>{messages.detail.missingDescription}</p>
          <div className={styles.actionRow}>
            <Link className={secondaryLinkClassName} href="/collections">
              {messages.detail.goToCollections}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.detailPage}>
      <BackToCollectionsLink messages={messages} />
      <header className={styles.detailHero}>
        <div>
          <p className={styles.eyebrow}>{messages.overview.eyebrow}</p>
          <h1 className={styles.detailTitle}>{collection.name}</h1>
        </div>
        <div className={styles.detailAside}>
          <p className={styles.detailSummary}>
            {formatMessageTemplate(messages.detail.savedSummary, {
              countText: formatCountMessage(
                messages.detail.objectCount,
                collection.items.length,
                locale,
              ),
            })}
          </p>
          <div className={styles.actionRow}>
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
        </div>
      </header>

      <CompareSelectionPanel items={collection.items} locale={locale} messages={messages} />

      <section aria-labelledby="add-object-heading" className={styles.collectionsSection}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.detail.addHeading}</p>
          <h2 className={styles.sectionTitle} id="add-object-heading">
            {messages.detail.addHeading}
          </h2>
          <p className={styles.sectionDescription}>{messages.detail.addDescription}</p>
        </div>
        <div className={styles.sectionBody}>
          <AddObjectToCollectionControl
            {...(apiOrigin === undefined ? {} : { apiOrigin })}
            collectionId={collection.id}
            entityTypeMessages={entityTypeMessages}
            locale={locale}
            messages={messages}
          />
        </div>
      </section>

      <section aria-labelledby="saved-items-heading" className={styles.collectionsSection}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.detail.savedHeading}</p>
          <h2 className={styles.sectionTitle} id="saved-items-heading">
            {messages.detail.savedHeading}
          </h2>
          <p className={styles.sectionDescription}>{messages.detail.savedDescription}</p>
        </div>
        <div className={styles.sectionBody}>
          {collection.items.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>{messages.detail.emptyTitle}</h3>
              <p>{messages.detail.emptyDescription}</p>
              <div className={styles.actionRow}>
                <Link className={secondaryLinkClassName} href="/explore">
                  {messages.detail.exploreCatalogue}
                </Link>
              </div>
            </div>
          ) : (
            <ul
              aria-label={formatMessageTemplate(messages.detail.objectsListLabel, {
                collectionName: collection.name,
              })}
              className={styles.savedList}
            >
              {collection.items.map((item) => (
                <SavedObjectRow
                  collectionId={collection.id}
                  entityTypeMessages={entityTypeMessages}
                  item={item}
                  key={item.slug}
                  messages={messages}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function BackToCollectionsLink({ messages }: Readonly<{ messages: CollectionsMessages }>) {
  return (
    <Link className={styles.backLink} href="/collections">
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
            <div className={styles.dialogField}>
              <label className={styles.dialogLabel} htmlFor="rename-collection-name">
                {messages.validation.nameLabel}
              </label>
              <input
                aria-describedby="rename-collection-name-hint"
                aria-invalid={invalid || storeProblem !== null ? true : undefined}
                autoComplete="off"
                className={styles.dialogInput}
                id="rename-collection-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                type="text"
                value={name}
              />
              <p aria-live="polite" className={styles.dialogHint} id="rename-collection-name-hint">
                {hint}
              </p>
            </div>
            <div className={styles.dialogActions}>
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
            <div className={styles.dialogActions}>
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
// Collection → Compare selection (temporary UI state, max 3)
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
    // Compare URL contract: repeated singular object params preserve selection
    // order; buildCompareHref dedupes and caps by itself.
    router.push(buildCompareHref(selectedSlugs));
  }, [router, selectedSlugs]);

  return (
    <section aria-labelledby="compare-selection-heading" className={styles.collectionsSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.detail.compareHeading}</p>
        <h2 className={styles.sectionTitle} id="compare-selection-heading">
          {messages.detail.compareHeading}
        </h2>
        <p className={styles.sectionDescription}>
          {formatMessageTemplate(messages.detail.compareDescription, {
            max: formatLocaleNumber(COMPARE_MAX_OBJECTS, locale),
          })}
        </p>
      </div>

      <div className={styles.sectionBody}>
        {items.length < 2 ? (
          <p className={styles.sectionDescription}>{messages.detail.compareEmpty}</p>
        ) : (
          <>
            <ul aria-label={messages.detail.selectObjectsLabel} className={styles.compareOptions}>
              {items.map((item) => {
                const checked = selectedSlugs.includes(item.slug);
                const blocked = !checked && atMaximum;
                return (
                  <li className={styles.compareOptionItem} key={item.slug}>
                    <label
                      className={styles.compareOption}
                      data-blocked={blocked ? "true" : "false"}
                    >
                      <input
                        checked={checked}
                        disabled={blocked}
                        onChange={(event) => toggle(item.slug, event.target.checked)}
                        type="checkbox"
                      />
                      <span className={styles.compareOptionName}>{item.canonical_name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className={styles.actionRow}>
              <button
                className={styles.primaryAction}
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
            </div>
            {atMaximum ? (
              <p className={styles.compareStatus} role="status">
                {formatMessageTemplate(messages.detail.compareMaximumReached, {
                  max: formatLocaleNumber(COMPARE_MAX_OBJECTS, locale),
                })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Saved rows — identity snapshots only; scientific data stays behind /objects
// ---------------------------------------------------------------------------

function SavedObjectRow({
  collectionId,
  entityTypeMessages,
  item,
  messages,
}: Readonly<{
  collectionId: string;
  entityTypeMessages: EntityTypeMessages;
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
    <li className={styles.savedItem}>
      <div className={styles.savedRow}>
        <Link className={styles.savedLink} href={`/objects/${item.slug}`}>
          <span className={styles.savedName}>{item.canonical_name}</span>
          <span className={styles.savedType}>{entityTypeMessages[item.entity_type]}</span>
          {failure !== null ? (
            <span className={styles.failure} role="alert">
              {failure}
            </span>
          ) : null}
        </Link>
        <button
          aria-label={formatMessageTemplate(messages.detail.removeObjectLabel, {
            objectName: item.canonical_name,
          })}
          className={styles.removeButton}
          onClick={handleRemove}
          type="button"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </li>
  );
}
