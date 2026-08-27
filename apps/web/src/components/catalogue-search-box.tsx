"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import type { EntitySummaryResponse } from "@lumina/api-client";

import { useSuggestCatalogue } from "./use-suggest-catalogue";

type CatalogueSearchBoxProps = Readonly<{
  initialQuery: string;
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
  /** Where an activated suggestion should take the user. */
  suggestionDestination?: "object" | "observe";
}>;

/**
 * The primary discovery input. Suggestions come from the accepted public
 * suggest endpoint through the server bridge; committed searches are plain
 * navigations to /explore?q=… so the URL stays the source of truth. Without
 * JavaScript the form still submits natively to the same address.
 */
export function CatalogueSearchBox({
  apiOrigin,
  initialQuery,
  suggestionDestination = "object",
}: CatalogueSearchBoxProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const { load, reset, state } = useSuggestCatalogue(
    apiOrigin === undefined ? {} : { origin: apiOrigin },
  );
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo<Array<EntitySummaryResponse>>(
    () => (state?.kind === "ok" && open ? state.items : []),
    [open, state],
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

  const goToSuggestion = useCallback(
    (slug: string) => {
      setOpen(false);
      setActiveIndex(null);
      void router.push(
        suggestionDestination === "observe" ? `/observe?object=${slug}` : `/objects/${slug}`,
      );
    },
    [router, suggestionDestination],
  );

  const commitSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return;
    setOpen(false);
    setActiveIndex(null);
    void router.push(`/explore?q=${encodeURIComponent(trimmed)}`);
  }, [query, router]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
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
        reset();
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
        // Activate the highlighted suggestion instead of submitting the form.
        event.preventDefault();
        const slug = suggestions[activeIndex]?.slug;
        if (slug !== undefined) goToSuggestion(slug);
      }
    },
    [activeIndex, goToSuggestion, open, reset, suggestions],
  );

  const handleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      // Progressive enhancement: keep the same destination the native GET
      // form would produce, but navigate on the client when JS is available.
      event.preventDefault();
      commitSearch();
    },
    [commitSearch],
  );

  const dismissOnBlur = useCallback((event: { relatedTarget: EventTarget | null }) => {
    if (containerRef.current?.contains(event.relatedTarget as Node | null) === false) {
      setOpen(false);
      setActiveIndex(null);
    }
  }, []);

  const suppressOptionFocus = useCallback((event: MouseEvent) => {
    // Keep keyboard focus on the input so arrow keys continue to work.
    event.preventDefault();
  }, []);

  return (
    <div onBlur={dismissOnBlur} ref={containerRef}>
      <form action="/explore" method="get" onSubmit={handleFormSubmit} role="search">
        <label className="sr-only" htmlFor={inputId}>
          Search the catalogue
        </label>
        <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 focus-within:border-[var(--border-strong)]">
          <span aria-hidden="true" className="text-[var(--muted)]">
            ⌕
          </span>
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open && suggestions.length > 0}
            autoComplete="off"
            className="min-h-12 w-full bg-transparent py-3 font-mono text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] [&::-webkit-search-cancel-button]:hidden"
            id={inputId}
            name="q"
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Try "Kepler" or "HD 209458"'
            role="combobox"
            type="search"
            value={query}
          />
          {query.length > 0 ? (
            <button
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => handleInputChange("")}
              type="button"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">Clear search</span>
            </button>
          ) : null}
        </div>
        <p aria-live="polite" className="sr-only" role="status">
          {open && suggestions.length > 0
            ? `${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} available`
            : ""}
        </p>
        {open && suggestions.length > 0 ? (
          <ul
            className="absolute z-20 mt-1 w-[calc(100%-2rem)] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl sm:w-full"
            id={listboxId}
            role="listbox"
          >
            {suggestions.map((suggestion, index) => (
              <li
                aria-selected={index === activeIndex}
                className="cursor-pointer rounded-sm px-3 py-2.5 hover:bg-[var(--surface-hover)]"
                id={`${baseId}-option-${suggestion.slug}`}
                key={suggestion.slug}
                onClick={() => goToSuggestion(suggestion.slug)}
                onMouseDown={suppressOptionFocus}
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
      </form>
    </div>
  );
}
