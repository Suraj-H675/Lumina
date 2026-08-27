"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  catalogSuggestEndpoint,
  validateExactGenerated,
  type EntitySummaryResponse,
} from "@lumina/api-client";

import { buildSuggestQuery } from "../lib/suggest-shared";

/** Debounce window for suggestion requests; bounded per the discovery contract. */
const SUGGEST_DEBOUNCE_MS = 180;
const SUGGEST_REQUEST_TIMEOUT_MS = 5_000;

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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const origin = options.origin;

  const cancelPendingTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const cancelPendingRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  const load = useCallback(
    (rawQuery: string) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      cancelPendingTimer();
      cancelPendingRequest();

      const search = buildSuggestQuery(rawQuery);
      if (search === "" || origin === undefined) {
        // Below the public minimum query length, or no API origin configured:
        // clear quietly instead of requesting.
        setState(null);
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const controller = new AbortController();
        requestRef.current = controller;
        const timeout = setTimeout(() => controller.abort(), SUGGEST_REQUEST_TIMEOUT_MS);
        void (async () => {
          try {
            const response = await fetch(`${origin}/api/v1/search/suggest?${search}`, {
              headers: { Accept: "application/json" },
              signal: controller.signal,
            });
            if (!response.ok) {
              if (generation === generationRef.current) setState({ kind: "unavailable" });
              return;
            }
            const body: unknown = await response.json();
            if (generation !== generationRef.current) return;
            const parsed = validateExactGenerated(catalogSuggestEndpoint.validator, body);
            if (!parsed.valid) {
              setState({ kind: "unavailable" });
              return;
            }
            setState({ items: parsed.data.items, kind: "ok" });
          } catch {
            if (generation === generationRef.current) setState({ kind: "unavailable" });
          } finally {
            clearTimeout(timeout);
            if (requestRef.current === controller) requestRef.current = null;
          }
        })();
      }, SUGGEST_DEBOUNCE_MS);
    },
    [cancelPendingRequest, cancelPendingTimer, origin],
  );

  const reset = useCallback(() => {
    generationRef.current += 1;
    cancelPendingTimer();
    cancelPendingRequest();
    setState(null);
  }, [cancelPendingRequest, cancelPendingTimer]);

  useEffect(
    () => () => {
      cancelPendingTimer();
      cancelPendingRequest();
    },
    [cancelPendingRequest, cancelPendingTimer],
  );

  return { load, reset, state };
}
