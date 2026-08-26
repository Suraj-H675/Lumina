"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useRef, useState } from "react";

import type { EntitySummaryResponse } from "@lumina/api-client";

import { COMPARE_MAX_OBJECTS } from "../lib/compare-url";
import { useSuggestCatalogue } from "./use-suggest-catalogue";

type CompareAddObjectProps = Readonly<{
  /** Slugs already in the comparison; they are never offered twice. */
  selectedSlugs: ReadonlyArray<string>;
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
}>;

/**
 * Add an object to the comparison through the accepted public suggest
 * endpoint (the Phase 1B3 contract, consumed unchanged; ranking stays
 * server-side). Selecting a suggestion appends its slug to the committed
 * repeated `object` query parameters — the URL remains the only state store.
 */
export function CompareAddObject({ apiOrigin, selectedSlugs }: CompareAddObjectProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { load, reset, state } = useSuggestCatalogue(
    apiOrigin === undefined ? {} : { origin: apiOrigin },
  );
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const atMaximum = selectedSlugs.length >= COMPARE_MAX_OBJECTS;

  // Server-ranked suggestions only; already-selected objects are filtered so a
  // suggestion can never duplicate a column, and no client-side reranking occurs.
  const suggestions = useMemo<Array<EntitySummaryResponse>>(
    () =>
      state?.kind === "ok" && open
        ? state.items.filter((item) => !selectedSlugs.includes(item.slug))
        : [],
    [open, selectedSlugs, state],
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
      if (value.trim().length === 0) {
        reset();
        setOpen(false);
        return;
      }
      load(value);
      setOpen(true);
    },
    [load, reset],
  );

  const addToCompare = useCallback(
    (slug: string) => {
      setOpen(false);
      setActiveIndex(null);
      setQuery("");
      reset();
      const params = new URLSearchParams();
      for (const existing of selectedSlugs) params.append("object", existing);
      params.append("object", slug);
      router.push(`/compare?${params.toString()}`);
    },
    [reset, router, selectedSlugs],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (atMaximum) return;
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        event.preventDefault();
        setActiveIndex((current) =>
          current === null ? 0 : Math.min(current + 1, suggestions.length - 1),
        );
        return;
      }
      if (event.key === "ArrowUp" && suggestions.length > 0) {
        event.preventDefault();
        setActiveIndex((current) => (current === null ? 0 : Math.max(current - 1, 0)));
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        setActiveIndex(null);
        return;
      }
      if (
        event.key === "Enter" &&
        open &&
        activeIndex !== null &&
        suggestions[activeIndex] !== undefined
      ) {
        event.preventDefault();
        const slug = suggestions[activeIndex]?.slug;
        if (slug !== undefined) addToCompare(slug);
      }
    },
    [activeIndex, addToCompare, atMaximum, open, suggestions],
  );

  const dismissOnBlur = useCallback((event: { relatedTarget: EventTarget | null }) => {
    if (containerRef.current?.contains(event.relatedTarget as Node | null) === false) {
      setOpen(false);
      setActiveIndex(null);
    }
  }, []);

  return (
    <div onBlur={dismissOnBlur} ref={containerRef}>
      <label className="sr-only" htmlFor={inputId}>
        Add an object to compare
      </label>
      <div className="flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 focus-within:border-[var(--border-strong)]">
        <span aria-hidden="true" className="text-[var(--muted)]">
          +
        </span>
        <input
          aria-activedescendant={atMaximum ? undefined : activeOptionId}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={!atMaximum && open && suggestions.length > 0}
          autoComplete="off"
          className="min-h-11 w-full bg-transparent py-2 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed"
          disabled={atMaximum}
          id={inputId}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            atMaximum ? "Comparison is full — remove an object to add another" : "e.g. K2-18"
          }
          role="combobox"
          type="search"
          value={query}
        />
      </div>
      <p aria-live="polite" className="sr-only" role="status">
        {atMaximum
          ? "The comparison is at the maximum of three objects."
          : open && suggestions.length > 0
            ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} available`
            : ""}
      </p>
      {!atMaximum && open && suggestions.length > 0 ? (
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
              onClick={() => addToCompare(suggestion.slug)}
              onMouseDown={(event) => {
                // Keep keyboard focus on the input so arrow keys continue to work.
                event.preventDefault();
              }}
              role="option"
            >
              <span className="block font-medium text-[var(--foreground)]">
                {suggestion.canonical_name}
              </span>
              <span className="block text-xs text-[var(--muted)]">{suggestion.entity_type}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
