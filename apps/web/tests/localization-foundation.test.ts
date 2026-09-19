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
  formatCountMessage,
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

  it("selects complete singular/plural messages with locale-aware counts", () => {
    const templates = {
      one: "Stored locally: {count} learning path.",
      other: "Stored locally: {count} learning paths.",
    } as const;

    expect(formatCountMessage(templates, 1, "en")).toBe("Stored locally: 1 learning path.");
    expect(formatCountMessage(templates, 2, "en")).toBe("Stored locally: 2 learning paths.");
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

  it("keeps the reviewed discoveries route wrapper in the typed English dictionary", () => {
    expect(enMessages.discoveries.metadataTitle).toBe("Reviewed discoveries");
    expect(enMessages.discoveries.eyebrow).toBe("Mission Control · Reviewed discoveries");
    expect(enMessages.discoveries.title).toBe("Reviewed discoveries");
    expect(enMessages.discoveries.currentSetTitle).toBe("Current reviewed set");
    expect(enMessages.discoveries.whyItMattersTitle).toBe("Why it matters");
    expect(enMessages.discoveries.reviewedSourcesTitle).toBe("Reviewed sources");
    expect(enMessages.discoveries.confirmation.peerReviewedPublication).toMatch(/peer-reviewed/i);
    expect(enMessages.discoveries.backToMissionControl).toBe("Back to Mission Control");
  });

  it("keeps the Learn landing wrapper separate from authored path content", () => {
    expect(enMessages.learn.landing.metadataTitle).toBe("Learn");
    expect(enMessages.learn.landing.eyebrow).toBe("Learn");
    expect(enMessages.learn.landing.title).toBe("Understand the sky by looking up");
    expect(enMessages.learn.landing.pathLabel).toBe("Complete learning path");
    expect(enMessages.learn.landing.pathMeta).toContain("{lessonCount}");
    expect(enMessages.learn.landing.viewPath).toBe("View the path");
  });

  it("keeps local learning-progress controls in a typed, plural-safe message group", () => {
    const messages = enMessages.learn.progressControls;
    expect(messages.title).toBe("Your local learning data");
    expect(messages.exportAction).toBe("Export learning progress");
    expect(messages.importAction).toBe("Import learning progress");
    expect(messages.resetAction).toBe("Reset local progress");
    expect(messages.previewTitle).toBe("Review this import");
    expect(messages.importSuccess.onePathOneAttempt).toContain("{pathCount}");
    expect(messages.importSuccess.onePathOneAttempt).toContain("{attemptCount}");
    expect(messages.storedSummary.one).toContain("{count}");
    expect(messages.storedSummary.other).toContain("{count}");
    expect(messages.failures.storageQuotaExceeded).toMatch(/storage is full/i);
  });

  it("keeps the Learning Path wrapper separate from authored path and lesson content", () => {
    const messages = enMessages.learn.path;
    expect(messages.metadataDescription).toMatch(/complete authored learning path/i);
    expect(messages.breadcrumbLabel).toBe("Breadcrumb");
    expect(messages.learnLink).toBe("Learn");
    expect(messages.eyebrow).toBe("Learning path");
    expect(messages.lessonMeta.other).toContain("{count}");
    expect(messages.objectivesTitle).toBe("What you will practise");
    expect(messages.capstoneTitle).toContain("{capstoneTitle}");
    expect(messages.safetyLabel).toBe("Safety:");
    expect(messages.lessonList.title).toBe("Lessons");
    expect(messages.lessonList.lessonNumber).toContain("{lessonNumber}");
    expect(messages.lessonList.pathComplete).toContain("{threshold}");
  });
});
