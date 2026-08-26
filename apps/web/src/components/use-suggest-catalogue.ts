"use client";

import { useCallback, useRef, useState } from "react";

import type { EntitySummaryResponse } from "@lumina/api-client";

import { buildSuggestQuery } from "../lib/suggest-shared";

/** Debounce window for suggestion requests; bounded per the discovery contract. */
const SUGGEST_DEBOUNCE_MS = 180;

export type SuggestState =
  Readonly<{ items: Array<EntitySummaryResponse>; kind: "ok" }> | Readonly<{ kind: "unavailable" }>;

type UseSuggestCatalogueOptions = Readonly<{
  /** Public API origin, resolved server-side. Suggestions stay off when absent. */
  origin?: string;
}>;

/**
 * Client-side typeahead state machine. It performs the bounded GET to the
 * public suggest endpoint (no credentials involved) and enforces response
 * freshness by generation counter; only the newest request may paint.
 */
export function useSuggestCatalogue(options: UseSuggestCatalogueOptions = {}): {
  load: (query: string) => void;
  reset: () => void;
  state: SuggestState | null;
} {
  const [state, setState] = useState<SuggestState | null>(null);
  const generationRef = useRef(0);
  const origin = options.origin;

  const load = useCallback(
    (rawQuery: string) => {
      generationRef.current += 1;
      const generation = generationRef.current;

      const search = buildSuggestQuery(rawQuery);
      if (search === "" || origin === undefined) {
        // Below the public minimum query length, or no API origin configured:
        // clear quietly instead of requesting.
        setState(null);
        return;
      }

      const timeout = setTimeout(() => {
        void (async () => {
          try {
            const response = await fetch(`${origin}/api/v1/search/suggest?${search}`, {
              headers: { Accept: "application/json" },
            });
            if (!response.ok) {
              if (generation === generationRef.current) setState({ kind: "unavailable" });
              return;
            }
            const body: unknown = await response.json();
            if (generation !== generationRef.current) return;
            setState(parseSuggestResponse(body));
          } catch {
            if (generation === generationRef.current) setState({ kind: "unavailable" });
          }
        })();
      }, SUGGEST_DEBOUNCE_MS);
      timers.add(timeout);
    },
    [origin],
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    setState(null);
  }, []);

  return { load, reset, state };
}

function parseSuggestResponse(body: unknown): SuggestState {
  if (
    body !== null &&
    typeof body === "object" &&
    "items" in body &&
    Array.isArray((body as { items: unknown }).items)
  ) {
    const items: Array<unknown> = (body as { items: Array<unknown> }).items;
    const parsed: Array<EntitySummaryResponse> = [];
    for (const item of items) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof (item as { canonical_name?: unknown }).canonical_name === "string" &&
        typeof (item as { entity_type?: unknown }).entity_type === "string" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { slug?: unknown }).slug === "string"
      ) {
        parsed.push({
          canonical_name: (item as { canonical_name: string }).canonical_name,
          entity_type: (item as { entity_type: EntitySummaryResponse["entity_type"] }).entity_type,
          id: (item as { id: string }).id,
          slug: (item as { slug: string }).slug,
        });
      } else {
        return { kind: "unavailable" };
      }
    }
    return { items: parsed, kind: "ok" };
  }
  return { kind: "unavailable" };
}

const timers = new Set<ReturnType<typeof setTimeout>>();
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  });
}
