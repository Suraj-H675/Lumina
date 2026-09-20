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
  formatLocaleList,
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

  it("formats reviewer lists with the explicit content locale", () => {
    expect(formatLocaleList(["Reviewer A", "Reviewer B"], "en")).toBe("Reviewer A and Reviewer B");
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

  it("keeps shared learning provenance wrappers separate from reviewed source data", () => {
    const messages = enMessages.learn.sources;
    expect(messages.title).toBe("Sources and review");
    expect(messages.sourcesLabel).toBe("Learning content sources");
    expect(messages.reviewSummary).toContain("{version}");
    expect(messages.reviewSummary).toContain("{reviewedAt}");
    expect(messages.reviewSummary).toContain("{reviewedBy}");
    expect(messages.sourceMeta).toContain("{organization}");
    expect(messages.sourceMeta).toContain("{claimScope}");
    expect(messages.sourceMeta).toContain("{accessedAt}");
  });

  it("keeps lesson and quiz wrappers separate from authored learning and assessment content", () => {
    const messages = enMessages.learn.lesson;
    expect(messages.metadataTitle).toBe("Learning lesson");
    expect(messages.breadcrumbLabel).toBe("Breadcrumb");
    expect(messages.lessonMeta).toContain("{lessonNumber}");
    expect(messages.lessonMeta).toContain("{lessonCount}");
    expect(messages.lessonMeta).toContain("{minutes}");
    expect(messages.lockedTitle).toBe("Complete the prerequisite lesson first");
    expect(messages.lockedDescription).toContain("{prerequisites}");
    expect(messages.thinkAboutLabel).toBe("Think about:");
    expect(messages.activityTitle).toContain("{activityTitle}");
    expect(messages.activityMeta).toContain("{minutes}");
    expect(messages.activityMeta).toContain("{materials}");
    expect(messages.failures.storageQuotaExceeded).toMatch(/storage is full/i);
    expect(messages.quiz.title).toBe("Knowledge check");
    expect(messages.quiz.intro).toContain("{quizTitle}");
    expect(messages.quiz.question).toContain("{questionNumber}");
    expect(messages.quiz.question).toContain("{questionPrompt}");
    expect(messages.quiz.resultMastered).toContain("{correctCount}");
    expect(messages.quiz.resultMastered).toContain("{totalCount}");
  });

  it("keeps the shared presentation-mode control in one typed cross-surface message group", () => {
    const messages = enMessages.presentationMode;
    expect(messages.label).toBe("Presentation mode");
    expect(messages.description).toBe("The science and answers stay the same.");
    expect(messages.options.explorer).toBe("Explorer");
    expect(messages.options.student).toBe("Student");
    expect(messages.options.deepDive).toBe("Deep Dive");
  });

  it("keeps Participate interface copy separate from reviewed participation content", () => {
    const messages = enMessages.participate;
    expect(messages.metadataTitle).toBe("Participate");
    expect(messages.projects.heading).toBe("Citizen-science projects");
    expect(messages.projects.filters.shown).toContain("{shownCount}");
    expect(messages.projects.filters.shown).toContain("{totalCount}");
    expect(messages.projects.openOnZooniverse).toContain("{projectTitle}");
    expect(messages.projects.sourceAttribution).toContain("{sourceTitle}");
    expect(messages.projects.sourceAttribution).toContain("{organization}");
    expect(messages.projects.unavailableReviewedSource).toContain("{sourceId}");
    expect(messages.challenges.monthTitle).toContain("{month}");
    expect(messages.challenges.monthTitle).toContain("{challengeTitle}");
    expect(messages.activities.heading).toBe("Hands-on activities");
    expect(messages.activities.noScriptLearningObjective).toContain("{objective}");
    expect(messages.freshness.noScriptCacheState).toContain("{cacheState}");
    expect(messages.freshness.headings.unavailable).toBe("Current project status unavailable");
  });

  it("keeps offline fallback and storage-management copy in typed message groups", () => {
    const landing = enMessages.offline.landing;
    expect(landing.title).toBe("Lumina is offline");
    expect(landing.inlineDocumentTitle).toBe("Offline — Lumina");
    expect(landing.inlineUnavailableDescription).toMatch(/reviewed offline copies/i);
    expect(landing.manageStorage).toBe("Manage offline storage");

    const storage = enMessages.offline.storage;
    expect(storage.approximate.available).toContain("{usage}");
    expect(storage.approximate.available).toContain("{quota}");
    expect(storage.offlineCopies.clearSuccess.one).toContain("{count}");
    expect(storage.offlineCopies.clearSuccess.other).toContain("{count}");
    expect(storage.personal.savedPlans.one).toContain("{count}");
    expect(storage.personal.journalEntries.other).toContain("{count}");
    expect(storage.personal.deleteSuccess.other).toContain("{count}");
  });

  it("keeps status interpretation and provider labels in one typed message group", () => {
    const messages = enMessages.status;
    expect(messages.title).toBe("Lumina API status");
    expect(messages.states.ready.heading).toBe("API available and ready");
    expect(messages.provider.cache.historicalOnlyWhileDisabled).toContain("{cacheLabel}");
    expect(messages.provider.circuit.halfOpen).toBe("Half-open");
    expect(messages.provider.labels.lastRefreshFailure).toBe("Last refresh failure");
    expect(messages.provider.counters.httpRequests).toBe("HTTP requests");
    expect(messages.provider.notRecorded).toBe("Not recorded");
  });

  it("keeps the Lab index wrapper separate from authored laboratory records", () => {
    const messages = enMessages.labIndex;
    expect(messages.metadataTitle).toBe("Lab");
    expect(messages.navigationLabel).toBe("Implemented laboratories");
    expect(messages.openLab).toBe("Open lab →");
    expect(messages.intro).toMatch(/reviewed Lumina laboratory/i);
  });

  it("keeps Collections interface copy separate from local user data and stable store reasons", () => {
    const messages = enMessages.collections;
    expect(messages.metadata.overviewTitle).toBe("Collections");
    expect(messages.overview.objectCount.one).toContain("{count}");
    expect(messages.detail.objectsListLabel).toContain("{collectionName}");
    expect(messages.detail.removeObjectLabel).toContain("{objectName}");
    expect(messages.detail.deleteTitle).toContain("{collectionName}");
    expect(messages.addObject.savedAnnouncement).toContain("{objectName}");
    expect(messages.save.trigger.saveAriaLabel).toContain("{objectName}");
    expect(messages.save.picker.createdAnnouncement).toContain("{collectionName}");
    expect(messages.save.compare.title).toContain("{countText}");
    expect(messages.save.compare.willSave).toContain("{objects}");
    expect(messages.validation.tooLongName).toContain("{max}");
    expect(messages.failures.collectionLimit).toContain("{max}");
    expect(messages.shared.corrupted.confirmResetAction).toMatch(/confirm reset/i);
  });

  it("keeps Space Now wrapper/state copy separate from provider APOD payloads", () => {
    const messages = enMessages.spaceNow;
    expect(messages.metadataTitle).toBe("Space Now");
    expect(messages.dailyVisual.contentDateLabel).toBe("APOD content date");
    expect(messages.retrieval.cacheStates.expired).toBe("expired");
    expect(messages.navigation.launches.action).toBe("Open Launch Center");
    expect(messages.unavailable.cachedContentExpired).toMatch(/expired/i);
  });

  it("keeps Journal interface copy separate from personal observation and import data", () => {
    const messages = enMessages.journal;
    expect(messages.metadataTitle).toBe("Journal · Lumina");
    expect(messages.entries.savedAt).toContain("{timestamp}");
    expect(messages.entries.deleteGroupLabel).toContain("{title}");
    expect(messages.entries.locationWithCoordinates).toContain("{label}");
    expect(messages.transfer.conflictTitle).toContain("{id}");
    expect(messages.transfer.conflictSummary).toContain("{localUpdated}");
    expect(messages.transfer.importComplete).toContain("{keptLocal}");
    expect(messages.failures.storageCorrupted).toMatch(/left the local bytes untouched/i);
  });

  it("keeps saved observation-plan chrome separate from snapshot science and personal values", () => {
    const messages = enMessages.savedObservationPlan;
    expect(messages.snapshotSummary).toContain("{savedAt}");
    expect(messages.snapshotSummary).toContain("{timeZone}");
    expect(messages.observer.locationValue).toContain("{latitude}");
    expect(messages.observer.azimuthValue).toContain("{compass}");
    expect(messages.night.highestAltitude).toContain("{altitude}");
    expect(messages.source.datasetSummary).toContain("{sourceRecordId}");
    expect(messages.source.calculationDescription).toContain("{solarAltitude}");
    expect(messages.states.corrupted.body).toMatch(/left the local data untouched/i);
  });

  it("keeps the live observation planner setup shell in one typed message group", () => {
    const messages = enMessages.observationPlanner;
    expect(messages.metadata.title).toBe("Observation planner");
    expect(messages.header.targetSummary).toContain("{entityType}");
    expect(messages.location.currentLocation).toContain("{latitude}");
    expect(messages.location.currentLocation).toContain("{longitude}");
    expect(messages.night.timeZoneSummary).toContain("{timeZone}");
    expect(messages.night.summary).toContain("{date}");
    expect(messages.coordinateSource.option).toContain("{sourceRecordId}");
    expect(messages.states.locationRequired.title).toMatch(/add a location/i);
  });

  it("keeps live observation result presentation in the planner message group", () => {
    const messages = enMessages.observationPlanner;
    expect(messages.results.highestHeading).toContain("{time}");
    expect(messages.results.highestAltitude).toContain("{altitude}");
    expect(messages.results.targetEvents.description).toContain("{timeZone}");
    expect(messages.results.source.sourceRecordLabel).toBe("Source record");
    expect(messages.chart.accessibleHighest).toContain("{altitude}");
    expect(messages.chart.accessibleHighest).toContain("{time}");
    expect(messages.results.events.circumpolar).toMatch(/latitude/i);
  });

  it("keeps lunar and weather condition presentation in the planner message group", () => {
    const messages = enMessages.observationPlanner.conditions;
    expect(messages.lunar.selectedSummary).toContain("{time}");
    expect(messages.lunar.selectedSummary).toContain("{altitude}");
    expect(messages.lunar.selectedSummary).toContain("{separation}");
    expect(messages.weather.selectedTitle).toContain("{time}");
    expect(messages.weather.selectedDescription).toContain("{condition}");
    expect(messages.weather.metrics.humidityDetail).toContain("{height}");
    expect(messages.weather.summary.windMaximum).toContain("{height}");
    expect(messages.weather.summary.cloudCoverRangeValue).toContain("{minimum}");
    expect(messages.weather.summary.cloudCoverRangeValue).toContain("{maximum}");
    expect(messages.weather.attribution.privacy).toContain("{provider}");
    expect(messages.weather.timeline.point).toContain("{cloudCover}");
  });

  it("keeps Sky Finder presentation and dynamic labels in the planner message group", () => {
    const messages = enMessages.observationPlanner.skyFinder;
    expect(messages.guidance.heading).toContain("{targetName}");
    expect(messages.guidance.directionValue).toContain("{azimuth}");
    expect(messages.guidance.spokenAbove).toContain("{compass}");
    expect(messages.brightStars.states.shownCapped).toContain("{cap}");
    expect(messages.brightStars.states.shownCapped).toContain("{count}");
    expect(messages.constellation.name).toContain("{name}");
    expect(messages.constellation.abbreviation).toContain("{abbreviation}");
    expect(messages.namedAnchors.nearest).toContain("{separation}");
    expect(messages.namedAnchors.rowAriaLabel).toContain("{altitude}");
    expect(messages.references.rowAriaLabel).toContain("{azimuth}");
    expect(messages.toggles.solarSystem.help).toContain("{bodies}");
    expect(messages.compass.n).toBe("N");
    expect(messages.references.bodies.sun).toBe("Sun");
  });

  it("keeps the local saved-plan action in the planner message group", () => {
    const messages = enMessages.observationPlanner.savePlan;
    expect(messages.description).toMatch(/only in this browser/i);
    expect(messages.failures.planLimit).toContain("{count}");
    expect(messages.failures.identifierUnavailable).toMatch(/local identifier/i);
    expect(messages.savedStatus).toMatch(/snapshot/i);
  });

  it("keeps the reusable journal-entry action in the journal message group", () => {
    const messages = enMessages.journal.entry;
    expect(messages.description).toContain("{objectName}");
    expect(messages.form.titlePlaceholder).toContain("{objectName}");
    expect(messages.form.plannerCoordinatesHelp).toMatch(/not copied/i);
    expect(messages.validation.coordinatesInvalid).toMatch(/longitude/i);
  });
});
