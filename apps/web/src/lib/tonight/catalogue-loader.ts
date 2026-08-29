import {
  catalogEntityBySlugEndpoint,
  catalogEntityDetailEndpoint,
  requestEndpoint,
  type EntityDetailResponse,
  type EntitySummaryResponse,
  type TransportOptions,
} from "@lumina/api-client";

import {
  TONIGHT_MAX_TARGETS,
  type TonightDetailCandidate,
  type TonightTargetIdentity,
} from "./domain";

export const TONIGHT_DETAIL_CONCURRENCY = 6;

const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_SLUG_LENGTH = 100;

type Progress = Readonly<{
  completed: number;
  total: number;
}>;

export type TonightCatalogueLoaderOptions = Readonly<{
  fetchImplementation?: typeof fetch;
  onProgress?: (progress: Progress) => void;
  origin?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

export class TonightCatalogueLoadAborted extends Error {
  constructor() {
    super("Tonight catalogue loading was cancelled.");
    this.name = "TonightCatalogueLoadAborted";
  }
}

const detailCache = new Map<string, EntityDetailResponse>();

/** Clears only the successful in-memory detail cache for the current session. */
export function clearTonightCatalogueDetailCache(): void {
  detailCache.clear();
}

function isPublicSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && PUBLIC_SLUG_PATTERN.test(slug);
}

function requestOptions(options: TonightCatalogueLoaderOptions): TransportOptions {
  return {
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
}

function cancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (cancelled(signal)) throw new TonightCatalogueLoadAborted();
}

function unavailable(item: TonightTargetIdentity): TonightDetailCandidate {
  return { item, kind: "catalogue-unavailable" };
}

async function loadOne(
  item: TonightTargetIdentity,
  options: TonightCatalogueLoaderOptions,
): Promise<TonightDetailCandidate> {
  throwIfCancelled(options.signal);
  const cached = detailCache.get(item.slug);
  if (cached !== undefined) return { detail: cached, item, kind: "ok" };
  if (options.origin === undefined || !isPublicSlug(item.slug)) return unavailable(item);

  const transport = requestOptions(options);
  const summary = await requestEndpoint<EntitySummaryResponse>(
    options.origin,
    { ...catalogEntityBySlugEndpoint, path: `/api/v1/catalog/entities/by-slug/${item.slug}` },
    transport,
  );
  throwIfCancelled(options.signal);
  if (summary.kind === "http-error" && summary.status === 404) {
    return { item, kind: "catalogue-not-found" };
  }
  if (summary.kind !== "ok") return unavailable(item);

  const detail = await requestEndpoint<EntityDetailResponse>(
    options.origin,
    {
      ...catalogEntityDetailEndpoint,
      path: `/api/v1/catalog/entities/${encodeURIComponent(summary.data.id)}`,
    },
    transport,
  );
  throwIfCancelled(options.signal);
  if (detail.kind === "http-error" && detail.status === 404) {
    return { item, kind: "catalogue-not-found" };
  }
  if (detail.kind !== "ok") return unavailable(item);

  detailCache.set(item.slug, detail.data);
  return { detail: detail.data, item, kind: "ok" };
}

/**
 * Loads at most six target details at once. Results retain collection order;
 * callers decide how loaded details are scientifically ordered later.
 */
export async function loadTonightCatalogueDetails(
  items: ReadonlyArray<TonightTargetIdentity>,
  options: TonightCatalogueLoaderOptions = {},
): Promise<Array<TonightDetailCandidate>> {
  if (items.length > TONIGHT_MAX_TARGETS) {
    throw new Error("Tonight can analyze at most 100 saved targets.");
  }
  throwIfCancelled(options.signal);
  if (items.length === 0) return [];

  const results: Array<TonightDetailCandidate | undefined> = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;
  const workerCount = Math.min(TONIGHT_DETAIL_CONCURRENCY, items.length);

  const worker = async (): Promise<void> => {
    while (true) {
      throwIfCancelled(options.signal);
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) return;

      let result: TonightDetailCandidate;
      try {
        result = await loadOne(item, options);
      } catch (error) {
        if (error instanceof TonightCatalogueLoadAborted || cancelled(options.signal)) throw error;
        result = unavailable(item);
      }
      throwIfCancelled(options.signal);
      results[index] = result;
      completed += 1;
      options.onProgress?.({ completed, total: items.length });
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.map((result, index) => result ?? unavailable(items[index]!));
}
