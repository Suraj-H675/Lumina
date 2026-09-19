// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("server dictionary boundary", () => {
  it("keeps published dictionary loading server-only and excludes the draft locale", () => {
    const source = readFileSync(resolve("src/lib/i18n/dictionaries.ts"), "utf8");

    expect(source).toContain('import "server-only"');
    expect(source).toContain('en: () => import("./messages/en")');
    expect(source).not.toContain('es: () => import("./messages/es")');
  });
});
