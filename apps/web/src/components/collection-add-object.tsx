"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { EntitySummaryResponse } from "@lumina/api-client";

import { entityTypeLabel } from "../lib/catalog-display";
import { addObjectsToCollection, useCollectionsData } from "../lib/collections-store";
import { useSuggestCatalogue } from "./use-suggest-catalogue";

type AddObjectToCollectionControlProps = Readonly<{
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
  collectionId: string;
}>;

/**
 * Add an object to this collection through the accepted public suggest
 * endpoint (the frozen Phase 1B3 contract; ranking stays server-side).
 *
 * The combobox follows the established accessible pattern: role="combobox"
 * with listbox options, arrow-key activation, Escape to dismiss, and a polite
 * live region. Selecting a suggestion saves its identity snapshot atomically;
 * removal lives on the saved row itself.
 */
export function AddObjectToCollectionControl({
  apiOrigin,
  collectionId,
}: AddObjectToCollectionControlProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const { load, reset, state } = useSuggestCatalogue(
    apiOrigin === undefined ? {} : { origin: apiOrigin },
  );
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const data = useCollectionsData();

  // Debounce the query before it drives requests, mirroring the shared hook's
  // bounded window with real timers.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length === 0) return;
    load(trimmed);
  }, [debouncedQuery, load]);

  // List visibility is DERIVED (query + focus + results), never set in an effect.
  const open = query.trim().length > 0 && inputFocused;

  const savedSlugs = useMemo<Array<string>>(() => {
    const collection = data.collections.find((entry) => entry.id === collectionId);
    return collection?.items.map((item) => item.slug) ?? [];
  }, [collectionId, data.collections]);

  // Server-ranked suggestions only; already-saved objects are filtered so a
  // suggestion can never duplicate a member, and no client reranking occurs.
  const suggestions = useMemo<Array<EntitySummaryResponse>>(
    () =>
      state?.kind === "ok" ? state.items.filter((item) => !savedSlugs.includes(item.slug)) : [],
    [savedSlugs, state],
  );

  const listboxId = `${baseId}-listbox`;
  const inputId = `${baseId}-input`;
  const activeOptionId =
    activeIndex === null || suggestions[activeIndex] === undefined
      ? undefined
      : `${baseId}-option-${suggestions[activeIndex]?.slug}`;

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setActiveIndex(null);
      if (value.trim().length === 0) reset();
    },
    [reset],
  );

  const addToCollection = useCallback(
    (suggestion: EntitySummaryResponse) => {
      setQuery("");
      setActiveIndex(null);
      reset();
      const result = addObjectsToCollection(collectionId, [
        {
          canonical_name: suggestion.canonical_name,
          entity_type: suggestion.entity_type,
          slug: suggestion.slug,
        },
      ]);
      setAnnouncement(
        result.ok ? `Saved ${suggestion.canonical_name} to the collection.` : result.message,
      );
    },
    [collectionId, reset],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown" && open && suggestions.length > 0) {
        event.preventDefault();
        setActiveIndex((current) =>
          current === null ? 0 : Math.min(current + 1, suggestions.length - 1),
        );
        return;
      }
      if (event.key === "ArrowUp" && open && suggestions.length > 0) {
        event.preventDefault();
        setActiveIndex((current) => (current === null ? 0 : Math.max(current - 1, 0)));
        return;
      }
      if (event.key === "Escape") {
        setActiveIndex(null);
        setQuery("");
        reset();
        return;
      }
      if (
        event.key === "Enter" &&
        open &&
        activeIndex !== null &&
        suggestions[activeIndex] !== undefined
      ) {
        event.preventDefault();
        const chosen = suggestions[activeIndex];
        if (chosen !== undefined) addToCollection(chosen);
      }
    },
    [activeIndex, addToCollection, open, reset, suggestions],
  );

  const dismissOnBlur = useCallback((event: { relatedTarget: EventTarget | null }) => {
    if (containerRef.current?.contains(event.relatedTarget as Node | null) === false) {
      setInputFocused(false);
      setActiveIndex(null);
    }
  }, []);

  return (
    <div onBlur={dismissOnBlur} ref={containerRef}>
      <label className="sr-only" htmlFor={inputId}>
        Find an object to save in this collection
      </label>
      <div className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:border-[var(--border-strong)]">
        <span aria-hidden="true" className="text-[var(--muted)]">
          +
        </span>
        <input
          aria-activedescendant={open && suggestions.length > 0 ? activeOptionId : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open && suggestions.length > 0}
          autoComplete="off"
          className="min-h-11 w-full bg-transparent py-2 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
          id={inputId}
          onBlur={() => setInputFocused(false)}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setInputFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. K2-18"
          role="combobox"
          type="search"
          value={query}
        />
      </div>
      <p aria-live="polite" className="sr-only" role="status">
        {open && suggestions.length > 0
          ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} available`
          : announcement}
      </p>
      {open && suggestions.length > 0 ? (
        <ul
          className="absolute z-20 mt-1 w-[calc(100%-3rem)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl sm:w-full"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((suggestion, index) => (
            <li
              aria-selected={index === activeIndex}
              className="cursor-pointer rounded-sm px-3 py-2.5 hover:bg-[var(--surface-hover)]"
              id={`${baseId}-option-${suggestion.slug}`}
              key={suggestion.slug}
              onClick={() => addToCollection(suggestion)}
              onMouseDown={(event) => {
                // Keep keyboard focus on the input so arrow keys keep working.
                event.preventDefault();
              }}
              role="option"
            >
              <span className="block font-medium text-[var(--foreground)]">
                {suggestion.canonical_name}
              </span>
              <span className="block text-xs text-[var(--muted)]">
                {entityTypeLabel(suggestion.entity_type)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
