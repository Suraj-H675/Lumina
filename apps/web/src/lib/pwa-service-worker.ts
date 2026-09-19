import {
  LUMINA_PWA_CACHE_PREFIX,
  LUMINA_PWA_CACHEABLE_DOCUMENT_BASE_PATHS,
  LUMINA_PWA_CONNECTIVITY_PATH,
  LUMINA_PWA_DOCUMENT_CACHE,
  LUMINA_PWA_METADATA_CACHE,
  LUMINA_PWA_METADATA_PATH,
  LUMINA_PWA_NETWORK_ONLY_BASE_PATHS,
  LUMINA_PWA_STATIC_CACHE,
} from "./pwa-policy";
import type { OfflineMessages } from "./i18n/messages/types";

const OFFLINE_FALLBACK_PATH = "/offline";
const INSTALL_SHELL_PATHS = [OFFLINE_FALLBACK_PATH, "/observe"] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type ServiceWorkerOfflineMessages = Pick<
  OfflineMessages["landing"],
  "inlineDocumentTitle" | "inlineUnavailableDescription" | "title"
>;

export type LuminaServiceWorkerSourceOptions = Readonly<{
  languageTag: string;
  offlineMessages: ServiceWorkerOfflineMessages;
}>;

function buildInlineOfflineFallback({
  languageTag,
  offlineMessages,
}: LuminaServiceWorkerSourceOptions): string {
  return `<!doctype html><html lang="${escapeHtml(languageTag)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(offlineMessages.inlineDocumentTitle)}</title></head><body><main><h1>${escapeHtml(offlineMessages.title)}</h1><p>${escapeHtml(offlineMessages.inlineUnavailableDescription)}</p></main></body></html>`;
}

/**
 * Build the root-scoped service worker from the same frozen policy constants
 * used by the TypeScript classifier tests. The returned program intentionally
 * has no push/background-sync surface.
 */
export function buildLuminaServiceWorkerSource(options: LuminaServiceWorkerSourceOptions): string {
  const inlineOfflineFallback = buildInlineOfflineFallback(options);
  return `"use strict";

const CACHE_PREFIX = ${JSON.stringify(LUMINA_PWA_CACHE_PREFIX)};
const DOCUMENT_CACHE = ${JSON.stringify(LUMINA_PWA_DOCUMENT_CACHE)};
const STATIC_CACHE = ${JSON.stringify(LUMINA_PWA_STATIC_CACHE)};
const METADATA_CACHE = ${JSON.stringify(LUMINA_PWA_METADATA_CACHE)};
const METADATA_PATH = ${JSON.stringify(LUMINA_PWA_METADATA_PATH)};
const CONNECTIVITY_PATH = ${JSON.stringify(LUMINA_PWA_CONNECTIVITY_PATH)};
const OFFLINE_FALLBACK_PATH = ${JSON.stringify(OFFLINE_FALLBACK_PATH)};
const INSTALL_SHELL_PATHS = ${JSON.stringify(INSTALL_SHELL_PATHS)};
const INLINE_OFFLINE_FALLBACK = ${JSON.stringify(inlineOfflineFallback)};
const NETWORK_ONLY_BASE_PATHS = ${JSON.stringify(LUMINA_PWA_NETWORK_ONLY_BASE_PATHS)};
const CACHEABLE_DOCUMENT_BASE_PATHS = ${JSON.stringify(LUMINA_PWA_CACHEABLE_DOCUMENT_BASE_PATHS)};
const CURRENT_CACHES = new Set([DOCUMENT_CACHE, STATIC_CACHE, METADATA_CACHE]);
let lastRecordedNetworkAvailable = null;
const SAVED_PLAN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function pathIsOrUnder(pathname, basePath) {
  return pathname === basePath || pathname.startsWith(basePath + "/");
}

function isNetworkOnlyPath(pathname) {
  return NETWORK_ONLY_BASE_PATHS.some((basePath) => pathIsOrUnder(pathname, basePath));
}

function isCacheableDocumentPath(pathname) {
  if (pathname === "/" || pathname === "/observe") return true;
  if (pathname.startsWith("/objects/")) return true;
  return CACHEABLE_DOCUMENT_BASE_PATHS.some((basePath) => pathIsOrUnder(pathname, basePath));
}

function isSavedPlanNavigation(url) {
  if (url.pathname !== "/observe") return false;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "saved") return false;
  const values = url.searchParams.getAll("saved");
  return values.length === 1 && SAVED_PLAN_ID_PATTERN.test(values[0] || "");
}

function classifyRequest(request) {
  if (request.method !== "GET") return "pass-through";
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return "pass-through";
  if (isNetworkOnlyPath(url.pathname)) return "network-only";
  if (request.mode === "navigate") {
    if (isSavedPlanNavigation(url)) return "saved-plan-navigation";
    if (url.search !== "") return "network-only";
    return isCacheableDocumentPath(url.pathname) ? "cache-document" : "network-only";
  }
  if (url.pathname.startsWith("/_next/static/")) return "cache-static";
  return "pass-through";
}

function canonicalDocumentRequest(url) {
  return new Request(url.origin + url.pathname, {
    headers: { Accept: "text/html" },
    method: "GET",
  });
}

function metadataRequest(url) {
  const key = new URL(METADATA_PATH, url.origin);
  key.searchParams.set("path", url.pathname);
  return new Request(key.href, { method: "GET" });
}

function connectivityRequest() {
  return new Request(new URL(CONNECTIVITY_PATH, self.location.origin).href, { method: "GET" });
}

async function recordNetworkAvailability(networkAvailable) {
  if (lastRecordedNetworkAvailable === networkAvailable) return;
  lastRecordedNetworkAvailable = networkAvailable;
  const checkedAt = new Date().toISOString();

  try {
    const metadataCache = await caches.open(METADATA_CACHE);
    await metadataCache.put(
      connectivityRequest(),
      new Response(JSON.stringify({ checkedAt, networkAvailable }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
    );
  } catch {
    // Connectivity reporting must never replace the underlying fetch result.
  }

  try {
    const windowClients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    for (const client of windowClients) {
      client.postMessage({ checkedAt, networkAvailable, type: "LUMINA_NETWORK_STATE" });
    }
  } catch {
    // The persisted state remains sufficient for the next controlled document.
  }
}

async function recordDocument(url, response) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || response.redirected || !contentType.toLowerCase().startsWith("text/html")) {
    return;
  }

  try {
    const cachedAt = new Date().toISOString();
    const documentCache = await caches.open(DOCUMENT_CACHE);
    const metadataCache = await caches.open(METADATA_CACHE);
    await Promise.all([
      documentCache.put(canonicalDocumentRequest(url), response.clone()),
      metadataCache.put(
        metadataRequest(url),
        new Response(JSON.stringify({ cachedAt }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }),
      ),
    ]);
  } catch {
    // CacheStorage is best-effort. A valid network response must remain usable.
  }
}

async function cachedDocument(url) {
  try {
    const cache = await caches.open(DOCUMENT_CACHE);
    return (await cache.match(canonicalDocumentRequest(url))) || null;
  } catch {
    return null;
  }
}

async function offlineFallback() {
  const url = new URL(OFFLINE_FALLBACK_PATH, self.location.origin);
  const cached = await cachedDocument(url);
  if (cached) return cached;
  return new Response(
    INLINE_OFFLINE_FALLBACK,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 503,
    },
  );
}

async function fetchNetworkOnly(request) {
  try {
    const response = await fetch(new Request(request, { cache: "no-store" }));
    await recordNetworkAvailability(true);
    return response;
  } catch (error) {
    await recordNetworkAvailability(false);
    throw error;
  }
}

async function networkOnlyNavigation(request) {
  try {
    return await fetchNetworkOnly(request);
  } catch {
    return offlineFallback();
  }
}

async function savedPlanNavigation(request) {
  try {
    return await fetchNetworkOnly(request);
  } catch {
    const observeUrl = new URL("/observe", self.location.origin);
    return (await cachedDocument(observeUrl)) || offlineFallback();
  }
}

async function networkFirstDocument(request) {
  const url = new URL(request.url);
  try {
    const response = await fetchNetworkOnly(request);
    await recordDocument(url, response);
    return response;
  } catch {
    return (await cachedDocument(url)) || offlineFallback();
  }
}

async function cachedStaticAsset(request) {
  let cache = null;
  try {
    cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
  } catch {
    cache = null;
  }
  const response = await fetch(request);
  if (cache && response.ok && !response.redirected && response.type !== "opaque") {
    try {
      await cache.put(request, response.clone());
    } catch {
      // Return the valid network asset even when the cache write is rejected.
    }
  }
  return response;
}

async function cacheInstallShell() {
  for (const path of INSTALL_SHELL_PATHS) {
    const url = new URL(path, self.location.origin);
    if (await cachedDocument(url)) continue;
    try {
      const response = await fetch(
        new Request(url.href, {
          cache: "no-store",
          headers: { Accept: "text/html" },
          method: "GET",
        }),
      );
      await recordDocument(url, response);
    } catch {
      // Inline fallback still keeps installation usable if one shell request fails.
    }
  }
}

async function deleteObsoleteCaches() {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(name))
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Cache cleanup failure must not block the worker's progressive enhancement lifecycle.
  }
}

async function offlineCopyInfo(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { cachedAt: null };
  }
  if (
    url.origin !== self.location.origin ||
    url.search !== "" ||
    !isCacheableDocumentPath(url.pathname)
  ) {
    return { cachedAt: null };
  }
  const document = await cachedDocument(url);
  if (!document) return { cachedAt: null };
  const metadataCache = await caches.open(METADATA_CACHE);
  const metadata = await metadataCache.match(metadataRequest(url));
  if (!metadata) return { cachedAt: null };
  try {
    const value = await metadata.json();
    return typeof value.cachedAt === "string" ? { cachedAt: value.cachedAt } : { cachedAt: null };
  } catch {
    return { cachedAt: null };
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheInstallShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await deleteObsoleteCaches();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "LUMINA_ACTIVATE_UPDATE") {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (data.type === "LUMINA_OFFLINE_COPY_INFO" && event.ports && event.ports[0]) {
    event.waitUntil(
      offlineCopyInfo(data.url).then((result) => {
        event.ports[0].postMessage(result);
      }),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const kind = classifyRequest(event.request);
  if (kind === "pass-through") return;
  if (kind === "cache-static") {
    event.respondWith(cachedStaticAsset(event.request));
    return;
  }
  if (kind === "cache-document") {
    event.respondWith(networkFirstDocument(event.request));
    return;
  }
  if (kind === "saved-plan-navigation") {
    event.respondWith(savedPlanNavigation(event.request));
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(networkOnlyNavigation(event.request));
    return;
  }
  event.respondWith(fetchNetworkOnly(event.request));
});
`;
}
