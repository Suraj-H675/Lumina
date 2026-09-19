import { describe, expect, it } from "vitest";

import { classifyPwaRequest, type PwaRequestKind } from "../src/lib/pwa-policy";

const ORIGIN = "https://lumina.example";

function classify(
  url: string,
  options: Readonly<{
    method?: string;
    mode?: string;
  }> = {},
): PwaRequestKind {
  return classifyPwaRequest({
    appOrigin: ORIGIN,
    method: options.method ?? "GET",
    mode: options.mode ?? "navigate",
    requestUrl: url.startsWith("http") ? url : `${ORIGIN}${url}`,
  });
}

describe("Phase 8B service-worker request policy", () => {
  it.each([
    "/",
    "/learn",
    "/learn/your-first-night-sky",
    "/learn/your-first-night-sky/meet-the-night-sky",
    "/explore",
    "/explore/deep-sky",
    "/objects/sirius",
    "/observe",
    "/offline",
    "/offline/storage",
  ])("allows a successful visited document to become an offline copy: %s", (path) => {
    expect(classify(path)).toBe("cache-document");
  });

  it.each([
    "/api/v1/catalog/search?q=sirius",
    "/status",
    "/status?detail=1",
    "/now",
    "/now/near-earth",
    "/participate",
    "/identify",
    "/identify?job=private",
  ])("keeps live or privacy-sensitive same-origin traffic network-only: %s", (path) => {
    expect(classify(path, { mode: "cors" })).toBe("network-only");
  });

  it("caches only same-origin Next static assets outside document navigation", () => {
    expect(classify("/_next/static/chunks/app.js", { mode: "cors" })).toBe("cache-static");
    expect(classify("https://cdn.example/_next/static/chunks/app.js", { mode: "cors" })).toBe(
      "pass-through",
    );
  });

  it("does not treat query-bearing document state as the canonical offline document", () => {
    expect(classify("/observe?object=sirius&date=2026-09-19")).toBe("network-only");
    expect(classify("/explore?sort=name")).toBe("network-only");
  });

  it("routes only a UUID-only saved-plan navigation through the canonical observe shell", () => {
    expect(classify("/observe?saved=13000000-0000-4000-8000-000000000001")).toBe(
      "saved-plan-navigation",
    );
    expect(classify("/observe?saved=not-a-uuid")).toBe("network-only");
    expect(classify("/observe?saved=13000000-0000-4000-8000-000000000001&latitude=12.9")).toBe(
      "network-only",
    );
  });

  it("does not cache mutations, cross-origin requests, or Next RSC-style subrequests", () => {
    expect(classify("/api/v1/jobs", { method: "POST", mode: "cors" })).toBe("pass-through");
    expect(classify("https://api.open-meteo.com/v1/forecast", { mode: "cors" })).toBe(
      "pass-through",
    );
    expect(classify("/learn/path/lesson?_rsc=abc", { mode: "cors" })).toBe("pass-through");
  });

  it("uses the explicit offline fallback rather than caching unrelated page classes", () => {
    expect(classify("/collections")).toBe("network-only");
    expect(classify("/journal")).toBe("network-only");
    expect(classify("/lab/orbit-sandbox")).toBe("network-only");
  });
});
