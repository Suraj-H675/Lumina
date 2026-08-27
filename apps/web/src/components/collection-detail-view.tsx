"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { COMPARE_MAX_OBJECTS, buildCompareHref } from "../lib/compare-url";
import { entityTypeLabel } from "../lib/catalog-display";
import {
  collectionNameProblem,
  normalizeCollectionName,
  type CollectionItemSnapshot,
} from "../lib/collections-model";
import {
  deleteCollection,
  removeObjectFromCollection,
  renameCollection,
  useCollectionsData,
  useCollectionsStatus,
} from "../lib/collections-store";
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
}>;

export function CollectionDetailView({ apiOrigin, collectionId }: CollectionDetailViewProps) {
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
        <BackToCollectionsLink />
        <CollectionLoadingNote />
      </div>
    );
  }

  if (status === "unavailable" || status === "corrupted") {
    return (
      <div className="space-y-6">
        <BackToCollectionsLink />
        <StorageUnavailableNote context="page" />
        {status === "corrupted" ? <CorruptedStoragePanel compact /> : null}
      </div>
    );
  }

  if (collection === undefined) {
    return (
      <div className="max-w-xl space-y-6">
        <BackToCollectionsLink />
        <section aria-labelledby="missing-collection-heading">
          <h1 className="text-2xl font-semibold tracking-tight" id="missing-collection-heading">
            This collection is not on this device
          </h1>
          <p className="mt-3 leading-7 text-[var(--muted)]">
            Collections are stored per browser. There is nothing saved under this address here.
          </p>
          <p className="mt-6">
            <Link className={secondaryLinkClassName} href="/collections">
              Go to your collections
            </Link>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <BackToCollectionsLink />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{collection.name}</h1>
        <p className="text-lg text-[var(--muted)]">
          {collection.items.length === 1 ? "1 object" : `${collection.items.length} objects`} ·
          Saved in this browser on this device
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <RenameCollectionButton collection={collection} />
          <DeleteCollectionButton
            collection={{
              id: collection.id,
              itemCount: collection.items.length,
              name: collection.name,
            }}
          />
        </div>
      </header>

      <CompareSelectionPanel items={collection.items} />

      <section aria-labelledby="add-object-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 id="add-object-heading">Add object</h2>
          <span className="text-sm text-[var(--muted)]">
            Search the reviewed catalogue for something to save here.
          </span>
        </div>
        <AddObjectToCollectionControl
          {...(apiOrigin === undefined ? {} : { apiOrigin })}
          collectionId={collection.id}
        />
      </section>

      <section aria-labelledby="saved-items-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 id="saved-items-heading">Saved objects</h2>
          <span className="text-sm text-[var(--muted)]">
            Identities are snapshots; open any object for its current reviewed data.
          </span>
        </div>
        {collection.items.length === 0 ? (
          <div className="max-w-xl rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-8">
            <h3 className="text-lg font-semibold">No objects saved here yet</h3>
            <p className="mt-2 leading-7 text-[var(--muted)]">
              Add objects above, or save them while exploring the catalogue.
            </p>
            <p className="mt-4">
              <Link className={secondaryLinkClassName} href="/explore">
                Explore catalogue
              </Link>
            </p>
          </div>
        ) : (
          <ul
            aria-label={`Objects in ${collection.name}`}
            className="grid list-none gap-3 p-0 md:grid-cols-2"
          >
            {collection.items.map((item) => (
              <SavedObjectRow collectionId={collection.id} item={item} key={item.slug} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BackToCollectionsLink() {
  return (
    <Link
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-4 transition-colors hover:text-[var(--foreground)]"
      href="/collections"
    >
      ← Collections
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Rename / delete — both flow through accessible dialogs, never window.confirm
// ---------------------------------------------------------------------------

function RenameCollectionButton({
  collection,
}: Readonly<{ collection: { id: string; name: string } }>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(collection.name);
  const [storeProblem, setStoreProblem] = useState<string | null>(null);
  const allCollections = useCollectionsData().collections;

  const problem = collectionNameProblem(name);
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
      setStoreProblem(result.message);
      return;
    }
    setOpen(false);
  }, [collection.id, invalid, name]);

  // Always-present live hint: the requirement, the exact conflict, or the
  // storage failure — never an invisible disabled state.
  const hint =
    problem !== null
      ? problem
      : duplicate
        ? "You already have a collection with this name."
        : (storeProblem ?? "Up to 60 characters.");

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={primaryButtonClassName}
        onClick={startRename}
        type="button"
      >
        Rename
      </button>
      {open ? (
        <ModalDialog
          description="The collection keeps its saved objects."
          onClose={() => setOpen(false)}
          open
          title="Rename collection"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="rename-collection-name">
                Name
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
                Cancel
              </button>
              <button className={primaryButtonClassName} disabled={invalid} type="submit">
                Save name
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
}: Readonly<{ collection: { id: string; itemCount: number; name: string } }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const confirmDelete = useCallback(() => {
    const result = deleteCollection(collection.id);
    if (!result.ok) {
      // Keep the dialog open and say exactly why the deletion did not happen.
      setFailure(result.message);
      return;
    }
    setOpen(false);
    router.push("/collections");
  }, [collection.id, router]);

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
        Delete
      </button>
      {open ? (
        <ModalDialog
          description={`This removes “${collection.name}” from this browser only. The Lumina catalogue itself is not affected.`}
          onClose={() => setOpen(false)}
          open
          title={`Delete ${collection.name}?`}
        >
          <div className="space-y-4">
            <p className="leading-7 text-[var(--muted)]">
              {collection.itemCount === 1
                ? "Its 1 saved object will be removed with it."
                : `Its ${collection.itemCount} saved objects will be removed with it.`}
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
                Keep collection
              </button>
              <button className={dangerButtonClassName} onClick={confirmDelete} type="button">
                Delete collection
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
}: Readonly<{ items: ReadonlyArray<CollectionItemSnapshot> }>) {
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
        <h2 id="compare-selection-heading">Compare saved objects</h2>
        <span className="text-sm text-[var(--muted)]">
          Choose 2–3 to compare — maximum {COMPARE_MAX_OBJECTS}.
        </span>
      </div>

      {items.length < 2 ? (
        <p className="text-sm leading-6 text-[var(--muted)]">
          Save at least two objects to compare them side by side.
        </p>
      ) : (
        <>
          <ul
            aria-label="Select objects to compare"
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
              ⇄ Compare selected{selectedSlugs.length > 0 ? ` (${selectedSlugs.length})` : ""}
            </button>
            {atMaximum ? (
              <span className="text-sm text-[var(--muted)]" role="status">
                Maximum of {COMPARE_MAX_OBJECTS} reached — unselect one to choose another.
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
}: Readonly<{
  collectionId: string;
  item: CollectionItemSnapshot;
}>) {
  const [failure, setFailure] = useState<string | null>(null);

  const handleRemove = useCallback(() => {
    const result = removeObjectFromCollection(collectionId, item.slug);
    // Storage failure keeps the row in place; say why instead of staying mute.
    setFailure(result.ok ? null : result.message);
  }, [collectionId, item.slug]);

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
          aria-label={`Remove ${item.canonical_name} from the collection`}
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
