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
import styles from "./collections-experience.module.css";
import { ModalDialog } from "./modal-dialog";

/**
 * /collections overview: create, browse, and open local collections. The
 * server renders the static shell; everything collection-shaped hydrates
 * locally through the one canonical store.
 */

const inputClassName = styles.dialogInput;
const primaryButtonClassName = styles.primaryAction;
const secondaryButtonClassName = styles.secondaryAction;

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
    <div className={styles.overviewPage}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.overview.eyebrow}</p>
          <h1 className={styles.title}>{messages.overview.title}</h1>
        </div>
        <div className={styles.heroAside}>
          <p className={styles.intro}>{messages.overview.intro}</p>
          <div className={styles.actionRow}>
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
        </div>
      </header>

      <section aria-labelledby="your-collections-heading" className={styles.collectionsSection}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.overview.eyebrow}</p>
          <h2 className={styles.sectionTitle} id="your-collections-heading">
            {messages.overview.sectionLabel}
          </h2>
        </div>
        <div className={styles.sectionBody}>
          {status === "loading" ? (
            <CollectionLoadingNote messages={messages.shared} />
          ) : status === "unavailable" ? (
            <StorageUnavailableNote context="page" messages={messages.shared} />
          ) : status === "corrupted" ? (
            <CorruptedStoragePanel messages={messages} />
          ) : data.collections.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>{messages.overview.emptyTitle}</h3>
              <p>{messages.overview.emptyDescription}</p>
              <div className={styles.actionRow}>
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
              </div>
            </div>
          ) : (
            <ul aria-label={messages.overview.sectionLabel} className={styles.collectionList}>
              {data.collections.map((collection) => (
                <li className={styles.collectionItem} key={collection.id}>
                  <Link className={styles.collectionLink} href={`/collections/${collection.id}`}>
                    <span className={styles.collectionName}>{collection.name}</span>
                    <span className={styles.collectionCount}>
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
        </div>
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
        <div className={styles.dialogField}>
          <label className={styles.dialogLabel} htmlFor="create-collection-name">
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
          <p aria-live="polite" className={styles.dialogHint} id="create-collection-name-hint">
            {hint}
          </p>
        </div>
        <div className={styles.dialogActions}>
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
