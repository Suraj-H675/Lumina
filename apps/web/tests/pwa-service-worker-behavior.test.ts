// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { buildLuminaServiceWorkerSource } from "../src/lib/pwa-service-worker";
import { LUMINA_PWA_DOCUMENT_CACHE, LUMINA_PWA_METADATA_CACHE } from "../src/lib/pwa-policy";

const ORIGIN = "https://lumina.example";

type WorkerListener = (event: unknown) => void;

function serviceWorkerRuntime(cachesValue: unknown, fetchValue: unknown) {
  const listeners = new Map<string, WorkerListener>();
  const selfValue = {
    addEventListener: vi.fn((type: string, listener: WorkerListener) =>
      listeners.set(type, listener),
    ),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue([]),
    },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
  };
  const execute = new Function(
    "self",
    "caches",
    "fetch",
    "Request",
    "Response",
    "URL",
    buildLuminaServiceWorkerSource(),
  );
  execute(selfValue, cachesValue, fetchValue, Request, Response, URL);
  return { listeners, selfValue };
}

function navigationRequest(path: string): Request {
  const request = new Request(`${ORIGIN}${path}`, {
    headers: { Accept: "text/html" },
    method: "GET",
  });
  Object.defineProperty(request, "mode", { configurable: true, value: "navigate" });
  return request;
}

async function fetchResponse(listener: WorkerListener, request: Request): Promise<Response> {
  let response: Promise<Response> | null = null;
  listener({
    request,
    respondWith(value: Promise<Response> | Response) {
      response = Promise.resolve(value);
    },
  });
  if (response === null) throw new Error("service worker did not intercept the request");
  return await response;
}

describe("Lumina service-worker storage failure behavior", () => {
  it("returns a successful network document even when CacheStorage cannot be opened", async () => {
    const cacheFailure = new DOMException("blocked", "SecurityError");
    const cachesValue = {
      open: vi.fn().mockRejectedValue(cacheFailure),
    };
    const fetchValue = vi.fn().mockResolvedValue(
      new Response("<html><body>network lesson</body></html>", {
        headers: { "Content-Type": "text/html" },
        status: 200,
      }),
    );
    const { listeners } = serviceWorkerRuntime(cachesValue, fetchValue);

    const response = await fetchResponse(
      listeners.get("fetch")!,
      navigationRequest("/learn/path/lesson"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("network lesson");
  });

  it("returns a successful static network asset when its cache cannot be opened", async () => {
    const cachesValue = {
      open: vi.fn().mockRejectedValue(new DOMException("blocked", "SecurityError")),
    };
    const fetchValue = vi.fn().mockResolvedValue(
      new Response("console.log('network asset')", {
        headers: { "Content-Type": "application/javascript" },
        status: 200,
      }),
    );
    const { listeners } = serviceWorkerRuntime(cachesValue, fetchValue);
    const request = new Request(`${ORIGIN}/_next/static/chunks/app.js`);

    const response = await fetchResponse(listeners.get("fetch")!, request);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("network asset");
  });

  it("uses the inline offline fallback when both network and CacheStorage are unavailable", async () => {
    const cachesValue = {
      open: vi.fn().mockRejectedValue(new DOMException("blocked", "SecurityError")),
    };
    const fetchValue = vi.fn().mockRejectedValue(new TypeError("network unavailable"));
    const { listeners } = serviceWorkerRuntime(cachesValue, fetchValue);

    const response = await fetchResponse(
      listeners.get("fetch")!,
      navigationRequest("/learn/path/lesson"),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Lumina is offline");
  });

  it("does not overwrite an existing install shell while a replacement worker is waiting", async () => {
    const existingDocument = new Response("<html>accepted shell</html>", {
      headers: { "Content-Type": "text/html" },
    });
    const documentCache = {
      match: vi.fn().mockResolvedValue(existingDocument),
      put: vi.fn(),
    };
    const metadataCache = { match: vi.fn(), put: vi.fn() };
    const cachesValue = {
      open: vi.fn(async (name: string) =>
        name === LUMINA_PWA_DOCUMENT_CACHE ? documentCache : metadataCache,
      ),
    };
    const fetchValue = vi.fn().mockResolvedValue(
      new Response("<html>new shell</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    );
    const { listeners } = serviceWorkerRuntime(cachesValue, fetchValue);
    let installation: Promise<unknown> | null = null;

    listeners.get("install")!({
      waitUntil(value: Promise<unknown>) {
        installation = value;
      },
    });
    await installation;

    expect(fetchValue).not.toHaveBeenCalled();
    expect(documentCache.put).not.toHaveBeenCalled();
    expect(metadataCache.put).not.toHaveBeenCalled();
    expect(cachesValue.open).toHaveBeenCalledWith(LUMINA_PWA_DOCUMENT_CACHE);
    expect(cachesValue.open).not.toHaveBeenCalledWith(LUMINA_PWA_METADATA_CACHE);
  });
});
