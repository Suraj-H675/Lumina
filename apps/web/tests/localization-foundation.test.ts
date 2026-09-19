import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  KNOWN_LOCALES,
  PUBLISHED_LOCALES,
  isKnownLocale,
  isPublishedLocale,
  localeDefinition,
} from "../src/lib/i18n/locales";
import { formatLocaleDateTime, formatLocaleNumber } from "../src/lib/i18n/format";
import { enMessages } from "../src/lib/i18n/messages/en";

describe("Phase 8C localization foundation", () => {
  it("keeps English canonical while Spanish remains a non-routable draft candidate", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(KNOWN_LOCALES).toEqual(["en", "es"]);
    expect(PUBLISHED_LOCALES).toEqual(["en"]);
    expect(isKnownLocale("es")).toBe(true);
    expect(isPublishedLocale("es")).toBe(false);
    expect(isPublishedLocale("en")).toBe(true);
    expect(localeDefinition("es")).toMatchObject({
      direction: "ltr",
      languageTag: "es",
      publication: "draft",
      translationReview: null,
    });
  });

  it("fails closed for unknown locale identifiers", () => {
    expect(isKnownLocale("fr")).toBe(false);
    expect(isPublishedLocale("fr")).toBe(false);
    expect(() => localeDefinition("fr" as never)).toThrow(/unknown lumina locale/i);
  });

  it("formats dates and numbers with an explicit content locale rather than browser defaults", () => {
    const instant = new Date("2026-09-19T10:15:00.000Z");

    expect(
      formatLocaleDateTime(instant, "en", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      }),
    ).toBe("September 19, 2026");
    expect(
      formatLocaleDateTime(instant, "es", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      }),
    ).toBe("19 de septiembre de 2026");
    expect(formatLocaleNumber(1234.5, "en", { maximumFractionDigits: 1 })).toBe("1,234.5");
    expect(formatLocaleNumber(1234.5, "es", { maximumFractionDigits: 1 })).toBe("1234,5");
  });

  it("keeps the English shell dictionary semantic and placeholder-complete", () => {
    expect(enMessages.shell.navigation.items.observe).toBe("Observe");
    expect(enMessages.shell.navigation.items.systemStatus).toBe("Status");
    expect(enMessages.shell.pwa.offlineCopyNotice).toContain("{cachedAt}");
    expect(enMessages.shell.pwa.offlineCopyNotice.match(/\{cachedAt\}/gu)).toHaveLength(1);
    expect(enMessages.shell.pwa.offlineCopyNotice).toMatch(/may no longer be current/i);
    expect(enMessages.shell.pwa.applyUpdate).toBe("Apply update");
  });
});
