"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";

import type { EntitySummaryResponse } from "@nova-lumina/api-client";

import { collectionStoreFailureMessage } from "../lib/collections-messages";
import { addObjectsToCollection, useCollectionsData } from "../lib/collections-store";
import { formatCountMessage, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { CollectionsMessages, EntityTypeMessages } from "../lib/i18n/messages/types";
import styles from "./collections-experience.module.css";
import { useSuggestCatalogue } from "./use-suggest-catalogue";

type AddObjectToCollectionControlProps = Readonly<{
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
  collectionId: string;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: CollectionsMessages;
}>;

/**
 * Add an object to this collection through the accepted public suggest
 * catalogue suggestion endpoint; ranking stays server-side.
 *
 * The combobox follows the established accessible pattern: role="combobox"
 * with listbox options, arrow-key activation, Escape to dismiss, and a polite
 * live region. Selecting a suggestion saves its identity snapshot atomically;
 * removal lives on the saved row itself.
 */
export function AddObjectToCollectionControl({
  apiOrigin,
  collectionId,
  entityTypeMessages,
  locale,
  messages,
}: AddObjectToCollectionControlProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const { load, reset, state } = useSuggestCatalogue(
    apiOrigin === undefined ? {} : { origin: apiOrigin },
  );
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const data = useCollectionsData();

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
      if (value.trim().length === 0) {
        reset();
        return;
      }
      load(value);
    },
    [load, reset],
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
        result.ok
          ? formatMessageTemplate(messages.addObject.savedAnnouncement, {
              objectName: suggestion.canonical_name,
            })
          : collectionStoreFailureMessage(result.reason, messages.failures),
      );
    },
    [collectionId, messages, reset],
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
    <div className={styles.searchShell} onBlur={dismissOnBlur} ref={containerRef}>
      <label className="sr-only" htmlFor={inputId}>
        {messages.addObject.inputLabel}
      </label>
      <div className={styles.searchField}>
        <span aria-hidden="true" className={styles.searchPlus}>
          +
        </span>
        <input
          aria-activedescendant={open && suggestions.length > 0 ? activeOptionId : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open && suggestions.length > 0}
          autoComplete="off"
          className={styles.searchInput}
          id={inputId}
          onBlur={() => setInputFocused(false)}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setInputFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={messages.addObject.placeholder}
          role="combobox"
          type="search"
          value={query}
        />
      </div>
      <p aria-live="polite" className="sr-only" role="status">
        {open && suggestions.length > 0
          ? formatCountMessage(messages.addObject.suggestionsAvailable, suggestions.length, locale)
          : announcement}
      </p>
      {open && suggestions.length > 0 ? (
        <ul className={styles.suggestions} id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              aria-selected={index === activeIndex}
              className={styles.suggestion}
              id={`${baseId}-option-${suggestion.slug}`}
              key={suggestion.slug}
              onClick={() => addToCollection(suggestion)}
              onMouseDown={(event) => {
                // Keep keyboard focus on the input so arrow keys keep working.
                event.preventDefault();
              }}
              role="option"
            >
              <span className={styles.suggestionName}>{suggestion.canonical_name}</span>
              <span className={styles.suggestionType}>
                {entityTypeMessages[suggestion.entity_type]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
