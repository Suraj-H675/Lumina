import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  KNOWN_LOCALES,
  PUBLISHED_LOCALES,
  isKnownLocale,
  isPublishedLocale,
  localeDefinition,
} from "../src/lib/i18n/locales";
import {
  formatLocaleDateTime,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../src/lib/i18n/format";
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

  it("formats semantic message templates without concatenating authored values into message keys", () => {
    expect(
      formatMessageTemplate("Continue with {lessonTitle}", {
        lessonTitle: "Find Patterns and Directions",
      }),
    ).toBe("Continue with Find Patterns and Directions");
    expect(() => formatMessageTemplate("Continue", { lessonTitle: "Lesson" })).toThrow(
      /does not contain \{lessonTitle\}/i,
    );
    expect(() => formatMessageTemplate("Continue with {lessonTitle}", {})).toThrow(
      /missing a value for \{lessonTitle\}/i,
    );
  });

  it("keeps the English shell dictionary semantic and placeholder-complete", () => {
    expect(enMessages.shell.navigation.items.observe).toBe("Observe");
    expect(enMessages.shell.navigation.items.systemStatus).toBe("Status");
    expect(enMessages.shell.pwa.offlineCopyNotice).toContain("{cachedAt}");
    expect(enMessages.shell.pwa.offlineCopyNotice.match(/\{cachedAt\}/gu)).toHaveLength(1);
    expect(enMessages.shell.pwa.offlineCopyNotice).toMatch(/may no longer be current/i);
    expect(enMessages.shell.pwa.applyUpdate).toBe("Apply update");
  });

  it("keeps generic route-boundary copy in the typed English dictionary", () => {
    expect(enMessages.routeBoundaries.notFound.title).toBe("Page not found");
    expect(enMessages.routeBoundaries.notFound.returnHome).toMatch(/return to the lumina/i);
    expect(enMessages.routeBoundaries.routeError.title).toMatch(/could not load/i);
    expect(enMessages.routeBoundaries.routeError.retry).toBe("Try again");
    expect(enMessages.routeBoundaries.globalError.title).toBe("Something went wrong");
    expect(enMessages.routeBoundaries.globalError.retry).toBe("Try again");
  });

  it("keeps the Mission Control page shell in the typed English dictionary", () => {
    expect(enMessages.missionControl.metadataTitle).toBe("Mission Control");
    expect(enMessages.missionControl.eyebrow).toBe("Mission Control");
    expect(enMessages.missionControl.title).toBe("Mission Control");
    expect(enMessages.missionControl.openLaunchCenter).toBe("Open Launch Center");
    expect(enMessages.missionControl.findSatellitePasses).toBe("Find satellite passes");
    expect(enMessages.missionControl.checkSourceStatus).toBe("Check source status");
    expect(enMessages.missionControl.aboutTitle).toBe("About Lumina");
  });

  it("keeps Mission Control live-state interface copy in the typed English dictionary", () => {
    expect(enMessages.missionControl.currentMissionEvent.title).toBe("Current mission event");
    expect(enMessages.missionControl.currentMissionEvent.providerDisabled).toMatch(
      /making no current-launch claim/i,
    );
    expect(enMessages.missionControl.currentMissionEvent.sourcePrecisionLabel).toBe(
      "Source precision",
    );
    expect(enMessages.missionControl.currentMissionEvent.missionLabel).toBe("Mission");
    expect(enMessages.missionControl.currentMissionEvent.missingValue).toBe(
      "Not provided by source",
    );
    expect(enMessages.missionControl.missionBoard.title).toBe("Upcoming mission board");
    expect(enMessages.missionControl.missionBoard.unavailable).toMatch(
      /validated launch snapshot/i,
    );
  });

  it("keeps reviewed-discovery wrapper copy separate from the reviewed article artifact", () => {
    expect(enMessages.missionControl.reviewedDiscovery.eyebrow).toBe("Reviewed discovery");
    expect(enMessages.missionControl.reviewedDiscovery.publishedLabel).toBe("Published");
    expect(enMessages.missionControl.reviewedDiscovery.whyItMattersTitle).toBe("Why it matters");
    expect(enMessages.missionControl.reviewedDiscovery.confirmationStateLabel).toBe(
      "Confirmation state",
    );
    expect(enMessages.missionControl.reviewedDiscovery.seeAll).toMatch(/reviewed discoveries/i);
  });

  it("keeps Continue Learning wrapper copy separate from authored path and lesson titles", () => {
    expect(enMessages.missionControl.continueLearning.eyebrow).toBe("Mission Control");
    expect(enMessages.missionControl.continueLearning.title).toBe("Continue Learning");
    expect(enMessages.missionControl.continueLearning.startPath).toContain("{pathTitle}");
    expect(enMessages.missionControl.continueLearning.reviewPath).toContain("{pathTitle}");
    expect(enMessages.missionControl.continueLearning.continueLesson).toContain("{lessonTitle}");
    expect(enMessages.missionControl.continueLearning.progress).toContain("{masteredCount}");
    expect(enMessages.missionControl.continueLearning.progress).toContain("{lessonCount}");
  });
});
