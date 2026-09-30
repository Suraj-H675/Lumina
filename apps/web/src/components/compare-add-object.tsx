"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useRef, useState } from "react";

import type { EntitySummaryResponse } from "@nova-lumina/api-client";

import { COMPARE_MAX_OBJECTS } from "../lib/compare-url";
import { formatCountMessage } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { CompareMessages } from "../lib/i18n/messages/types";
import styles from "./compare-view.module.css";
import { useSuggestCatalogue } from "./use-suggest-catalogue";

type CompareAddObjectProps = Readonly<{
  /** Slugs already in the comparison; they are never offered twice. */
  selectedSlugs: ReadonlyArray<string>;
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
  locale: PublishedLocale;
  messages: CompareMessages["add"];
}>;

/**
 * Add an object to the comparison through the accepted public suggest
 * catalogue suggestion endpoint, consumed unchanged; ranking stays
 * server-side). Selecting a suggestion appends its slug to the committed
 * repeated `object` query parameters — the URL remains the only state store.
 */
export function CompareAddObject({
  apiOrigin,
  locale,
  messages,
  selectedSlugs,
}: CompareAddObjectProps) {
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
    <div className={styles.searchShell} onBlur={dismissOnBlur} ref={containerRef}>
      <label className="sr-only" htmlFor={inputId}>
        {messages.inputLabel}
      </label>
      <div className={styles.searchField}>
        <span aria-hidden="true" className={styles.searchPlus}>
          +
        </span>
        <input
          aria-activedescendant={atMaximum ? undefined : activeOptionId}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={!atMaximum && open && suggestions.length > 0}
          autoComplete="off"
          className={styles.searchInput}
          disabled={atMaximum}
          id={inputId}
          onChange={(event) => handleInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={atMaximum ? messages.fullPlaceholder : messages.placeholder}
          role="combobox"
          type="search"
          value={query}
        />
      </div>
      <p aria-live="polite" className="sr-only" role="status">
        {atMaximum
          ? messages.maximumStatus
          : open && suggestions.length > 0
            ? formatCountMessage(messages.suggestionsAvailable, suggestions.length, locale)
            : ""}
      </p>
      {!atMaximum && open && suggestions.length > 0 ? (
        <ul className={styles.suggestions} id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              aria-selected={index === activeIndex}
              className={styles.suggestion}
              id={`${baseId}-option-${suggestion.slug}`}
              key={suggestion.slug}
              onClick={() => addToCompare(suggestion.slug)}
              onMouseDown={(event) => {
                // Keep keyboard focus on the input so arrow keys continue to work.
                event.preventDefault();
              }}
              role="option"
            >
              <span className={styles.suggestionName}>{suggestion.canonical_name}</span>
              <span className={styles.suggestionType}>{suggestion.entity_type}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
