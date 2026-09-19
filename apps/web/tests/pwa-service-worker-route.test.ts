import { describe, expect, it } from "vitest";

import { GET } from "../src/app/sw.js/route";
import {
  LUMINA_PWA_DOCUMENT_CACHE,
  LUMINA_PWA_METADATA_CACHE,
  LUMINA_PWA_STATIC_CACHE,
} from "../src/lib/pwa-policy";

describe("Lumina service worker route", () => {
  it("serves executable JavaScript with update-safe security and cache headers", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-store, must-revalidate");
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'self'; script-src 'self'",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const source = await response.text();
    expect(() => new Function(source)).not.toThrow();
    expect(source).toContain(JSON.stringify(LUMINA_PWA_DOCUMENT_CACHE));
    expect(source).toContain(JSON.stringify(LUMINA_PWA_STATIC_CACHE));
    expect(source).toContain(JSON.stringify(LUMINA_PWA_METADATA_CACHE));
    expect(source).toContain('const INSTALL_SHELL_PATHS = ["/offline","/observe"]');
  });

  it("contains only the accepted install/activate/message/fetch lifecycle surface", async () => {
    const source = await GET().text();

    expect(source).toContain('self.addEventListener("install"');
    expect(source).toContain('self.addEventListener("activate"');
    expect(source).toContain('self.addEventListener("message"');
    expect(source).toContain('self.addEventListener("fetch"');
    expect(source).not.toContain('addEventListener("push"');
    expect(source).not.toContain('addEventListener("sync"');
    expect(source).not.toContain('addEventListener("periodicsync"');
  });
});
