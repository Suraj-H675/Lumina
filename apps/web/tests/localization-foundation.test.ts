import { describe, expect, it } from "vitest";

import { formatCoordinateDisclosure } from "../src/lib/i18n/coordinate-disclosure";
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
  formatLocaleFixedNumber,
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

  it("preserves fixed-decimal rounding before applying locale presentation", () => {
    expect(formatLocaleFixedNumber(1.15, 1, "en")).toBe("1.1");
    expect(formatLocaleFixedNumber(9.95, 1, "en")).toBe("9.9");
    expect(formatLocaleFixedNumber(12.97155, 3, "en")).toBe("12.972");
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
    expect(
      formatCountMessage(
        {
          one: "{count} result for {query}.",
          other: "{count} results for {query}.",
        },
        2,
        "en",
        { query: "Kepler" },
      ),
    ).toBe("2 results for Kepler.");
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
    expect(enMessages.routeBoundaries.lab.scaleExplorer.title).toBe(
      "Scale Explorer could not load",
    );
    expect(enMessages.routeBoundaries.lab.telescopeBuilder.title).toBe(
      "Telescope Builder could not load",
    );
    expect(enMessages.learn.routeState.loading).toBe("The learning path is loading…");
    expect(enMessages.learn.routeState.error.retry).toBe("Try again");
    expect(enMessages.object.routeError.title).toBe("This page could not be loaded");
  });

  it("keeps Identify core privacy/status templates explicit and placeholder-complete", () => {
    expect(enMessages.identify.metadata.title).toBe("Identify an astronomical image");
    expect(enMessages.identify.header.remoteDescription).toContain("{service}");
    expect(enMessages.identify.upload.bound).toContain("{maxBytes}");
    expect(enMessages.identify.upload.bound).toContain("{maxPixels}");
    expect(enMessages.identify.upload.bound).toContain("{minDimension}");
    expect(enMessages.identify.upload.consentRemote).toContain("{service}");
    expect(enMessages.identify.upload.consentRemote).toContain("{provider}");
    expect(enMessages.identify.privacy.remote.sentToProvider).toContain("{service}");
    expect(enMessages.identify.privacy.remote.deletion).toContain("{provider}");
    expect(enMessages.identify.status.remoteConditions.busyFailed).toContain("{provider}");
    expect(enMessages.identify.status.deletion.remoteDescription).toContain("{provider}");
    expect(enMessages.identify.solutionOverlay.description).toContain("{provider}");
    expect(enMessages.identify.solutionOverlay.comparison.visibleAnnotations.one).toContain(
      "{count}",
    );
    expect(enMessages.identify.solutionOverlay.comparison.visibleAnnotations.other).toContain(
      "{count}",
    );
    expect(enMessages.identify.solutionOverlay.comparison.zoomLabel).toContain("{zoom}");
    expect(enMessages.identify.solutionOverlay.metrics.pixelScaleValue).toContain("{value}");
    expect(enMessages.identify.captureChecks.description).toContain("{provider}");
    expect(enMessages.identify.captureChecks.boundedSample).toContain("{count}");
    expect(enMessages.identify.captureChecks.metrics.sourceDimensionsValue).toContain("{width}");
    expect(enMessages.identify.captureChecks.metrics.sourceDimensionsValue).toContain("{height}");
    expect(enMessages.identify.captureChecks.nonOpaque.one).toContain("{count}");
    expect(enMessages.identify.captureChecks.nonOpaque.other).toContain("{count}");
    expect(enMessages.identify.journalPanel.snapshotDisclosure).toContain("{count}");
    expect(enMessages.identify.journalPanel.snapshotDisclosure).toContain("{service}");
    expect(enMessages.identify.surveyComparison.description).toContain("{service}");
    expect(enMessages.identify.surveyComparison.fieldDescription).toContain("{fieldOfView}");
    expect(enMessages.identify.surveyComparison.fieldDescriptionClamped).toContain("{fieldOfView}");
    expect(enMessages.identify.surveyComparison.figures.surveyCaption).toContain("{layer}");
    expect(enMessages.identify.surveyComparison.figures.surveyRegionLabel).toContain("{service}");
    expect(enMessages.identify.surveyComparison.privacy).toContain("{serviceShort}");
    expect(enMessages.identify.surveyComparison.states.checking).toContain("{layer}");
    expect(enMessages.identify.surveyComparison.states.layerUnavailable).toContain("{layer}");
    expect(enMessages.identify.surveyComparison.states.showingLayer).toContain("{layer}");
  });

  it("keeps Near-Earth wrapper templates explicit and placeholder-complete", () => {
    expect(enMessages.spaceNow.nearEarth.intro).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.metadataDescription).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.prediction.classification).toContain("{authority}");
    expect(enMessages.spaceNow.nearEarth.prediction.uncertainty).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.prediction.updates).toContain("{authority}");
    expect(enMessages.spaceNow.nearEarth.snapshot.freshDescription).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.snapshot.staleDescription).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.source.officialDocumentation).toContain("{sourceName}");
    expect(enMessages.spaceNow.nearEarth.table.approachTime).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.table.caption).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.table.hazardousLabel).toContain("{value}");
    expect(enMessages.spaceNow.nearEarth.table.objectReference).toContain("{id}");
    expect(enMessages.spaceNow.nearEarth.window.capped).toContain("{returned}");
    expect(enMessages.spaceNow.nearEarth.window.capped).toContain("{total}");
    expect(enMessages.spaceNow.nearEarth.window.empty).toContain("{provider}");
    expect(enMessages.spaceNow.nearEarth.window.listed.one).toContain("{count}");
    expect(enMessages.spaceNow.nearEarth.window.listed.other).toContain("{count}");
    expect(enMessages.spaceNow.nearEarth.window.range).toContain("{startDate}");
    expect(enMessages.spaceNow.nearEarth.window.range).toContain("{endDate}");
  });

  it("keeps Satellites wrapper/pass templates explicit and placeholder-complete", () => {
    const messages = enMessages.spaceNow.satellites;
    expect(messages.intro).toContain("{provider}");
    expect(messages.intro).toContain("{stationsGroup}");
    expect(messages.intro).toContain("{visualGroup}");
    expect(messages.intro).toContain("{propagationModel}");
    expect(messages.metadataDescription).toContain("{provider}");
    expect(messages.metadataDescription).toContain("{propagationModel}");
    expect(messages.snapshot.summary).toContain("{retrievedAt}");
    expect(messages.snapshot.summary).toContain("{latestEpoch}");
    expect(messages.snapshot.lastFailure).toContain("{code}");
    expect(messages.satellites.count).toContain("{returned}");
    expect(messages.satellites.count).toContain("{total}");
    expect(messages.satellites.noradReference).toContain("{catalogNumber}");
    expect(messages.satellites.elementAgeValue).toContain("{hours}");
    expect(messages.source.limitations).toContain("{warningHours}");
    expect(messages.source.limitations).toContain("{windowHours}");
    expect(messages.source.limitations).toContain("{maximumOffsetHours}");
    expect(messages.passFinder.actions.calculate).toContain("{hours}");
    expect(messages.passFinder.option).toContain("{name}");
    expect(messages.passFinder.option).toContain("{catalogNumber}");
    expect(messages.passFinder.privacy).toContain("{provider}");
    expect(messages.passFinder.result.heading).toContain("{satellite}");
    expect(messages.passFinder.result.algorithmSummary).toContain("{propagationModel}");
    expect(messages.passFinder.result.noPasses).toContain("{altitudeThreshold}");
    expect(messages.passFinder.result.noPasses).toContain("{windowHours}");
    expect(messages.passFinder.result.passPeakAfterTime).toContain("{altitude}");
    expect(messages.passFinder.result.passRiseSet).toContain("{riseTime}");
    expect(messages.passFinder.result.passRiseSet).toContain("{setTime}");
    expect(messages.passFinder.result.illumination).toContain("{skyState}");
    expect(messages.passFinder.result.illumination).toContain("{sunAltitude}");
  });

  it("keeps Space Weather provider/data templates explicit and placeholder-complete", () => {
    const messages = enMessages.spaceNow.spaceWeather;
    expect(messages.intro).toContain("{provider}");
    expect(messages.metadataDescription).toContain("{provider}");
    expect(messages.snapshot.description).toContain("{provider}");
    expect(messages.impacts.description).toContain("{provider}");
    expect(messages.impacts.title).toContain("{provider}");
    expect(messages.impacts.familyHeading).toContain("{family}");
    expect(messages.kp.description).toContain("{provider}");
    expect(messages.kp.forecast.caption).toContain("{provider}");
    expect(messages.kp.forecast.headers.time).toContain("{provider}");
    expect(messages.kp.forecast.headers.scale).toContain("{provider}");
    expect(messages.kp.labels.productTime).toContain("{provider}");
    expect(messages.kp.labels.scaleField).toContain("{provider}");
    expect(messages.notifications.title).toContain("{provider}");
    expect(messages.notifications.issueTime).toContain("{time}");
    expect(messages.scales.description).toContain("{provider}");
    expect(messages.scales.title).toContain("{provider}");
    expect(messages.scales.unavailable).toContain("{provider}");
    expect(messages.scales.familyContext).toContain("{provider}");
    expect(messages.scales.familyContext).toContain("{code}");
    expect(messages.scales.sourceTime).toContain("{provider}");
    expect(messages.scales.sourceTime).toContain("{date}");
    expect(messages.scales.sourceTime).toContain("{time}");
    expect(messages.solarWind.description).toContain("{provider}");
    expect(messages.solarWind.sourceObservationTime).toContain("{time}");
    expect(messages.source.documentation).toContain("{sourceName}");
    expect(messages.source.limitations).toContain("{provider}");
  });

  it("keeps Deep Sky atlas templates placeholder-complete", () => {
    expect(enMessages.deepSky.atlas.activation.readyForTarget).toContain("{objectName}");
    expect(enMessages.deepSky.atlas.status.checkingSurvey).toContain("{layerLabel}");
    expect(enMessages.deepSky.atlas.status.focused).toContain("{objectName}");
    expect(enMessages.deepSky.atlas.status.initialLayerUnavailable).toContain("{layerLabel}");
    expect(enMessages.deepSky.atlas.status.layerChanged).toContain("{layerLabel}");
    expect(enMessages.deepSky.atlas.status.switchLayerUnavailable).toContain("{layerLabel}");
    expect(enMessages.deepSky.atlas.status.utcApplied).toContain("{instant}");
    expect(enMessages.deepSky.atlas.rendererDisclosure).toContain("{engineVersion}");
    expect(enMessages.deepSky.atlas.rendererDisclosure).toContain("{helpersVersion}");
  });

  it("keeps Explore search templates placeholder-complete", () => {
    expect(enMessages.catalogueSearch.suggestionsAvailable.one).toContain("{count}");
    expect(enMessages.explore.search.matchedAlias).toContain("{alias}");
    expect(enMessages.explore.search.noResultsDescription).toContain("{example}");
    expect(enMessages.explore.search.noResultsTitle).toContain("{query}");
    expect(enMessages.explore.search.summary.one).toContain("{count}");
    expect(enMessages.explore.search.summary.one).toContain("{query}");
    expect(enMessages.explore.search.summary.other).toContain("{count}");
    expect(enMessages.explore.search.summary.other).toContain("{query}");
    expect(
      formatCountMessage(enMessages.explore.search.summary, 1, "en", { query: "Kepler" }),
    ).toBe("1 result for Kepler, ranked by the catalogue search engine.");
    expect(
      formatCountMessage(enMessages.explore.search.summary, 2, "en", { query: "Kepler" }),
    ).toBe("2 results for Kepler, ranked by the catalogue search engine.");
  });

  it("keeps Solar System Distance Explorer data placeholders explicit", () => {
    const messages = enMessages.explore.solarSystemDistance;
    expect(messages.intro).toContain("{provider}");
    expect(messages.explorer.description).toContain("{provider}");
    expect(messages.explorer.logDescription).toContain("{unit}");
    expect(messages.explorer.modelEyebrow).toContain("{modelVersion}");
    expect(messages.explorer.selected.compareSizeAction).toContain("{body}");
    expect(messages.explorer.sunOrigin).toContain("{unit}");
    expect(messages.explorer.trackSummary).toContain("{distance}");
    expect(messages.explorer.trackSummary).toContain("{unit}");
    expect(messages.explorer.trackSummary).toContain("{position}");
    expect(messages.explorer.trackSummary).toContain("{mode}");
    expect(messages.explorer.dataAlternative.logUndefined).toContain("{unit}");
    expect(messages.explorer.valueWithUnit).toContain("{value}");
    expect(messages.explorer.valueWithUnit).toContain("{unit}");
  });

  it("keeps Exoplanet System Layout data placeholders explicit", () => {
    const messages = enMessages.explore.exoplanetSystems;
    expect(messages.metadataDescription).toContain("{provider}");
    expect(messages.continue.description).toContain("{unit}");
    expect(messages.provenance.description).toContain("{provider}");
    expect(messages.provenance.tapDocumentation).toContain("{provider}");
    expect(messages.provenance.tapDocumentation).toContain("{tap}");
    expect(messages.provenance.columnDocumentation).toContain("{columnSet}");
    expect(messages.provenance.querySummary).toContain("{tap}");
    expect(messages.explorer.description).toContain("{provider}");
    expect(messages.explorer.description).toContain("{table}");
    expect(messages.explorer.modelEyebrow).toContain("{modelVersion}");
    expect(messages.explorer.title).toContain("{unit}");
    expect(messages.explorer.host.ariaLabel).toContain("{name}");
    expect(messages.explorer.host.ariaLabel).toContain("{countLabel}");
    expect(messages.explorer.host.confirmedPlanets.one).toContain("{count}");
    expect(messages.explorer.host.hostname).toContain("{hostname}");
    expect(messages.explorer.host.originDisclosure).toContain("{unit}");
    expect(messages.explorer.logDescription).toContain("{minimum}");
    expect(messages.explorer.logDescription).toContain("{maximum}");
    expect(messages.explorer.logDescription).toContain("{unit}");
    expect(messages.explorer.linearDescription).toContain("{maximum}");
    expect(messages.explorer.systemLayoutAriaLabel).toContain("{system}");
    expect(messages.explorer.trackSummary).toContain("{distance}");
    expect(messages.explorer.trackSummary).toContain("{position}");
    expect(messages.explorer.trackSummary).toContain("{mode}");
    expect(messages.explorer.planet.discoverySummary).toContain("{host}");
    expect(messages.explorer.planet.discoverySummary).toContain("{year}");
    expect(messages.explorer.planet.discoverySummary).toContain("{method}");
    expect(messages.explorer.planet.disclosure).toContain("{table}");
    expect(messages.explorer.parameter.valueWithUnit).toContain("{value}");
    expect(messages.explorer.parameter.valueWithUnit).toContain("{unit}");
    expect(messages.explorer.parameter.uncertainty).toContain("{plus}");
    expect(messages.explorer.parameter.uncertainty).toContain("{minus}");
    expect(messages.explorer.parameter.reference).toContain("{reference}");
  });

  it("keeps Voyager mission/trajectory data placeholders explicit", () => {
    const messages = enMessages.explore.voyager;
    expect(messages.metadataTitle).toContain("{mission}");
    expect(messages.metadataDescription).toContain("{mission}");
    expect(messages.metadataDescription).toContain("{provider}");
    expect(messages.title).toContain("{mission}");
    expect(messages.intro).toContain("{mission}");
    expect(messages.intro).toContain("{trajectoryProvider}");
    expect(messages.intro).toContain("{historyProvider}");
    expect(messages.intro).toContain("{launchDate}");
    expect(messages.intro).toContain("{vectorStartDate}");
    expect(messages.timeline.description).toContain("{historyProvider}");
    expect(messages.timeline.description).toContain("{trajectoryProvider}");
    expect(messages.timeline.source).toContain("{source}");
    expect(messages.provenance.title).toContain("{provider}");
    expect(messages.provenance.description).toContain("{provider}");
    expect(messages.provenance.targetValue).toContain("{mission}");
    expect(messages.provenance.targetValue).toContain("{targetId}");
    expect(messages.provenance.outputValue).toContain("{outputType}");
    expect(messages.provenance.outputValue).toContain("{outputUnits}");
    expect(messages.provenance.timeScaleValue).toContain("{value}");
    expect(messages.provenance.timeScaleValue).toContain("{timeScale}");
    expect(messages.provenance.documentation).toContain("{provider}");
    expect(messages.table.description).toContain("{xAxis}");
    expect(messages.table.description).toContain("{yAxis}");
    expect(messages.table.description).toContain("{zAxis}");
    expect(messages.table.description).toContain("{center}");
    expect(messages.table.description).toContain("{frame}");
    expect(messages.table.description).toContain("{unit}");
    expect(messages.table.axisHeader).toContain("{axis}");
    expect(messages.table.axisHeader).toContain("{unit}");
    expect(messages.table.epochHeader).toContain("{timeScale}");
    expect(messages.trajectory.eyebrow).toContain("{provider}");
    expect(messages.trajectory.title).toContain("{mission}");
    expect(messages.trajectory.description).toContain("{xyAxes}");
    expect(messages.trajectory.description).toContain("{center}");
    expect(messages.trajectory.description).toContain("{frame}");
    expect(messages.trajectory.description).toContain("{zAxis}");
    expect(messages.trajectory.sampleLabel).toContain("{year}");
    expect(messages.trajectory.sampleLabel).toContain("{distance}");
    expect(messages.trajectory.sampleLabel).toContain("{unit}");
    expect(messages.trajectory.sampleLabel).toContain("{center}");
    expect(messages.trajectory.projection.title).toContain("{frame}");
    expect(messages.trajectory.projection.title).toContain("{xyAxes}");
    expect(messages.trajectory.projection.description).toContain("{xAxis}");
    expect(messages.trajectory.projection.description).toContain("{yAxis}");
    expect(messages.trajectory.projection.description).toContain("{zAxis}");
    expect(messages.trajectory.projection.ariaLabel).toContain("{mission}");
    expect(messages.trajectory.distanceHistory.description).toContain("{formula}");
    expect(messages.trajectory.distanceHistory.description).toContain("{provider}");
    expect(messages.trajectory.selectedVectorTitle).toContain("{provider}");
    expect(messages.trajectory.selectedVectorTitle).toContain("{year}");
    expect(messages.trajectory.sliderAriaLabel).toContain("{mission}");
    expect(messages.trajectory.vectorLabels.epoch).toContain("{timeScale}");
    expect(messages.trajectory.valueWithUnit).toContain("{value}");
    expect(messages.trajectory.valueWithUnit).toContain("{unit}");
  });

  it("keeps System Scale Compare templates explicit around reviewed reference data", () => {
    const messages = enMessages.explore.systemScaleCompare;
    expect(messages.defaultComparison.description).toContain("{solar}");
    expect(messages.defaultComparison.description).toContain("{exoplanet}");
    expect(messages.defaultComparison.description).toContain("{voyager}");
    expect(messages.defaultComparison.headers.earthMultiple).toContain("{unit}");
    expect(messages.explorer.modelEyebrow).toContain("{modelVersion}");
    expect(messages.explorer.title).toContain("{unit}");
    expect(messages.explorer.referenceSelect.optionValue).toContain("{name}");
    expect(messages.explorer.referenceSelect.optionValue).toContain("{value}");
    expect(messages.explorer.referenceSelect.optionValue).toContain("{unit}");
    expect(messages.explorer.scaleModes.logAction).toContain("{unit}");
    expect(messages.explorer.scaleModes.logDescription).toContain("{minimum}");
    expect(messages.explorer.scaleModes.logDescription).toContain("{maximum}");
    expect(messages.explorer.scaleModes.linearDescription).toContain("{maximum}");
    expect(messages.explorer.laneAriaLabel).toContain("{name}");
    expect(messages.explorer.laneSummary).toContain("{value}");
    expect(messages.explorer.laneSummary).toContain("{position}");
    expect(messages.explorer.laneSummary).toContain("{mode}");
    expect(messages.explorer.laneSummary).toContain("{ratio}");
    expect(messages.inventory.description).toContain("{count}");
    expect(messages.inventory.summary).toContain("{count}");
    expect(messages.inventory.summary).toContain("{unit}");
    expect(messages.inventory.headers.value).toContain("{unit}");
  });

  it("keeps deterministic simulation-lab templates placeholder-complete", () => {
    const blackHole = enMessages.simulationLabs.blackHoleRelativity;
    expect(blackHole.model.currentState).toContain("{mass}");
    expect(blackHole.model.currentState).toContain("{radius}");
    expect(blackHole.model.sourceUnavailable).toContain("{sourceId}");
    expect(blackHole.result.description).toContain("{modelVersion}");

    const orbit = enMessages.simulationLabs.orbitSandbox;
    expect(orbit.model.currentState).toContain("{xPosition}");
    expect(orbit.model.currentState).toContain("{yVelocity}");
    expect(orbit.model.currentState).toContain("{duration}");
    expect(orbit.model.sourceUnavailable).toContain("{sourceId}");
    expect(orbit.preview.description).toContain("{shown}");
    expect(orbit.preview.description).toContain("{total}");
    expect(orbit.result.description).toContain("{modelVersion}");
    expect(orbit.result.model).toContain("{modelVersion}");
    expect(orbit.trajectory.caption).toContain("{halfSpan}");
    expect(orbit.trajectory.description).toContain("{count}");

    const transit = enMessages.simulationLabs.transitMethod;
    expect(transit.lightCurve.caption).toContain("{minimum}");
    expect(transit.lightCurve.caption).toContain("{maximum}");
    expect(transit.lightCurve.description).toContain("{count}");
    expect(transit.model.currentState).toContain("{stellarRadius}");
    expect(transit.model.currentState).toContain("{planetRadius}");
    expect(transit.model.currentState).toContain("{period}");
    expect(transit.model.currentState).toContain("{inclination}");
    expect(transit.model.sourceUnavailable).toContain("{sourceId}");
    expect(transit.preview.description).toContain("{shown}");
    expect(transit.preview.description).toContain("{total}");
    expect(transit.result.description).toContain("{modelVersion}");
    expect(transit.result.model).toContain("{modelVersion}");

    const radialVelocity = enMessages.simulationLabs.radialVelocity;
    expect(radialVelocity.curve.caption).toContain("{minimum}");
    expect(radialVelocity.curve.caption).toContain("{maximum}");
    expect(radialVelocity.curve.description).toContain("{count}");
    expect(radialVelocity.model.currentState).toContain("{stellarMass}");
    expect(radialVelocity.model.currentState).toContain("{companionMass}");
    expect(radialVelocity.model.currentState).toContain("{period}");
    expect(radialVelocity.model.currentState).toContain("{eccentricity}");
    expect(radialVelocity.model.currentState).toContain("{inclination}");
    expect(radialVelocity.model.sourceUnavailable).toContain("{sourceId}");
    expect(radialVelocity.preview.description).toContain("{shown}");
    expect(radialVelocity.preview.description).toContain("{total}");
    expect(radialVelocity.result.model).toContain("{modelVersion}");

    const relativity = enMessages.simulationLabs.relativityVisualizations;
    expect(relativity.lightCone.caption).toContain("{note}");
    expect(relativity.lightCone.caption).toContain("{coordinateSystem}");
    expect(relativity.lightCone.noScriptCoordinateConvention).toContain("{coordinateSystem}");
    expect(relativity.model.currentState).toContain("{beta}");
    expect(relativity.model.currentState).toContain("{properTime}");
    expect(relativity.model.currentState).toContain("{properLength}");
    expect(relativity.model.currentState).toContain("{separation}");
    expect(relativity.model.sourceUnavailable).toContain("{sourceId}");
    expect(relativity.result.description).toContain("{modelVersion}");

    const stellar = enMessages.simulationLabs.stellarLaboratory;
    expect(stellar.controls.description).toContain("{minimum}");
    expect(stellar.controls.description).toContain("{maximum}");
    expect(stellar.model.currentState).toContain("{mass}");
    expect(stellar.model.sourceUnavailable).toContain("{sourceId}");
    expect(stellar.result.description).toContain("{modelVersion}");

    const spectroscopy = enMessages.simulationLabs.spectroscopyLab;
    expect(spectroscopy.model.currentState).toContain("{mode}");
    expect(spectroscopy.model.currentState).toContain("{temperature}");
    expect(spectroscopy.model.currentState).toContain("{velocity}");
    expect(spectroscopy.model.sourceUnavailable).toContain("{sourceId}");
    expect(spectroscopy.noScript.displayNoiseTemplate).toContain("{sigma}");
    expect(spectroscopy.noScript.displayNoiseTemplate).toContain("{seed}");
    expect(spectroscopy.result.description).toContain("{modelVersion}");
    expect(spectroscopy.result.noScriptReturnedSamples).toContain("{count}");
    expect(spectroscopy.result.noScriptReturnedSamples).toContain("{minimum}");
    expect(spectroscopy.result.noScriptReturnedSamples).toContain("{maximum}");

    const impact = enMessages.simulationLabs.impactSimulator;
    expect(impact.figure.depositRadius).toContain("{thickness}");
    expect(impact.model.currentState).toContain("{diameter}");
    expect(impact.model.currentState).toContain("{density}");
    expect(impact.model.currentState).toContain("{speed}");
    expect(impact.model.currentState).toContain("{angle}");
    expect(impact.model.currentState).toContain("{target}");
    expect(impact.model.sourceUnavailable).toContain("{sourceId}");
    expect(impact.result.description).toContain("{modelVersion}");
    expect(impact.result.description).toContain("{targetDensity}");

    const builder = enMessages.simulationLabs.planetarySystemBuilder;
    expect(builder.controls.fieldAriaLabels.planetAxis).toContain("{index}");
    expect(builder.controls.fieldAriaLabels.planetMass).toContain("{index}");
    expect(builder.controls.fieldAriaLabels.removePlanet).toContain("{index}");
    expect(builder.controls.planetLegend).toContain("{index}");
    expect(builder.figure.displayExtent).toContain("{extent}");
    expect(builder.model.currentStateMany).toContain("{count}");
    expect(builder.model.currentStateMany).toContain("{mass}");
    expect(builder.model.currentStateMany).toContain("{luminosity}");
    expect(builder.model.currentStateMany).toContain("{temperature}");
    expect(builder.model.sourceUnavailable).toContain("{sourceId}");
    expect(builder.noScript.hzRange).toContain("{inner}");
    expect(builder.noScript.hzRange).toContain("{outer}");
    expect(builder.noScript.planetLine).toContain("{index}");
    expect(builder.noScript.planetLine).toContain("{mass}");
    expect(builder.noScript.planetLine).toContain("{axis}");
    expect(builder.pairwise.interpretation).toContain("{inner}");
    expect(builder.pairwise.interpretation).toContain("{outer}");
    expect(builder.pairwise.interpretation).toContain("{interpretation}");
    expect(builder.result.description).toContain("{modelVersion}");

    const rocket = enMessages.simulationLabs.rocketMissionDesigner;
    expect(rocket.controls.fieldAriaLabels.removeStage).toContain("{index}");
    expect(rocket.controls.fieldAriaLabels.stageDryMass).toContain("{index}");
    expect(rocket.controls.fieldAriaLabels.stagePropellantMass).toContain("{index}");
    expect(rocket.controls.fieldAriaLabels.stageSpecificImpulse).toContain("{index}");
    expect(rocket.controls.fieldAriaLabels.stageThrust).toContain("{index}");
    expect(rocket.controls.stageLegend).toContain("{index}");
    expect(rocket.model.currentStateMany).toContain("{count}");
    expect(rocket.model.currentStateMany).toContain("{payload}");
    expect(rocket.model.currentStateMany).toContain("{gravity}");
    expect(rocket.model.sourceUnavailable).toContain("{sourceId}");
    expect(rocket.result.description).toContain("{modelVersion}");
    expect(rocket.result.description).toContain("{gravity}");

    const eclipse = enMessages.simulationLabs.eclipseSimulator;
    expect(eclipse.controls.description).toContain("{minimumUtc}");
    expect(eclipse.controls.description).toContain("{maximumUtc}");
    expect(eclipse.event.title).toContain("{classification}");
    expect(eclipse.model.currentState).toContain("{utc}");
    expect(eclipse.model.currentState).toContain("{latitude}");
    expect(eclipse.model.currentState).toContain("{longitude}");
    expect(eclipse.model.sourceUnavailable).toContain("{sourceId}");
    expect(eclipse.noScript.observerLocation).toContain("{latitude}");
    expect(eclipse.noScript.observerLocation).toContain("{longitude}");
    expect(eclipse.noScript.observerLocation).toContain("{elevation}");
    expect(eclipse.result.description).toContain("{modelVersion}");

    const scale = enMessages.simulationLabs.scaleExplorer;
    expect(scale.comparisonEvidence.rounding).toContain("{rounding}");
    expect(scale.comparisonEvidence.summary).toContain("{algorithm}");
    expect(scale.comparisonEvidence.summary).toContain("{version}");
    expect(scale.comparisonEvidence.summary).toContain("{unit}");
    expect(scale.controls.description).toContain("{count}");
    expect(scale.controls.nodeSummary).toContain("{index}");
    expect(scale.controls.nodeSummary).toContain("{count}");
    expect(scale.controls.nodeSummary).toContain("{node}");
    expect(scale.controls.sliderAriaValue).toContain("{index}");
    expect(scale.controls.sliderAriaValue).toContain("{count}");
    expect(scale.controls.sliderAriaValue).toContain("{node}");
    expect(scale.model.contentReviewValue).toContain("{status}");
    expect(scale.model.contentReviewValue).toContain("{version}");
    expect(scale.model.contentReviewValue).toContain("{reviewers}");
    expect(scale.model.contentReviewValue).toContain("{reviewedAt}");
    expect(scale.model.inputValue).toContain("{name}");
    expect(scale.model.inputValue).toContain("{unit}");
    expect(scale.model.validRangeValue).toContain("{count}");
    expect(scale.model.validRangeValue).toContain("{nodes}");
    expect(scale.noScript.sourceSummary).toContain("{sourceValue}");
    expect(scale.noScript.sourceSummary).toContain("{sourceUnit}");
    expect(scale.noScript.sourceSummary).toContain("{sourceQuantity}");
    expect(scale.noScript.sourceSummary).toContain("{status}");
    expect(scale.noScript.sourceSummary).toContain("{position}");
    expect(scale.result.calculatedComparison).toContain("{selected}");
    expect(scale.result.calculatedComparison).toContain("{reference}");
    expect(scale.share.description).toContain("{modelVersion}");
    expect(scale.share.description).toContain("{schemaVersion}");
    expect(scale.sources.unavailable).toContain("{sourceId}");
    expect(scale.sources.unavailableReference).toContain("{sourceId}");
    expect(scale.table.onTrack).toContain("{percent}");
    expect(scale.track.markerSummary).toContain("{node}");
    expect(scale.transitionContract.unitsValue).toContain("{input}");
    expect(scale.transitionContract.unitsValue).toContain("{output}");

    const seasons = enMessages.simulationLabs.seasonsSimulator;
    expect(seasons.controls.range).toContain("{unit}");
    expect(seasons.controls.range).toContain("{minimum}");
    expect(seasons.controls.range).toContain("{maximum}");
    expect(seasons.controls.sliderAriaLabel).toContain("{label}");
    expect(seasons.controls.sliderAriaValue).toContain("{value}");
    expect(seasons.controls.sliderAriaValue).toContain("{unit}");
    expect(seasons.distance.description).toContain("{distance}");
    expect(seasons.distance.description).toContain("{flux}");
    expect(seasons.failures.invalidFinite).toContain("{field}");
    expect(seasons.failures.invalidRange).toContain("{field}");
    expect(seasons.figures.illumination.axisTilt).toContain("{angle}");
    expect(seasons.figures.illumination.caption).toContain("{incidence}");
    expect(seasons.figures.orbit.caption).toContain("{distance}");
    expect(seasons.figures.orbit.description).toContain("{position}");
    expect(seasons.model.sourceUnavailable).toContain("{sourceId}");
    expect(seasons.noScript.currentState.orbitalPositionValue).toContain("{angle}");
    expect(seasons.noScript.model.modelVersionSummary).toContain("{modelVersion}");
    expect(seasons.noScript.model.modelVersionSummary).toContain("{schemaVersion}");
    expect(seasons.noScript.result.comparisonSummary).toContain("{declination}");
    expect(seasons.noScript.result.comparisonSummary).toContain("{comparisonLatitude}");
    expect(seasons.noScript.result.distanceSummary).toContain("{distance}");
    expect(seasons.noScript.result.distanceSummary).toContain("{flux}");
    expect(seasons.result.comparisonSummary).toContain("{latitude}");
    expect(seasons.result.description).toContain("{modelVersion}");

    const telescope = enMessages.simulationLabs.telescopeBuilder;
    expect(telescope.controls.range).toContain("{unit}");
    expect(telescope.controls.range).toContain("{minimum}");
    expect(telescope.controls.range).toContain("{maximum}");
    expect(telescope.controls.sliderAriaLabel).toContain("{label}");
    expect(telescope.controls.sliderAriaValue).toContain("{value}");
    expect(telescope.controls.sliderAriaValue).toContain("{unit}");
    expect(telescope.failures.invalidFinite).toContain("{field}");
    expect(telescope.figures.fieldFit.targetExtent).toContain("{percent}");
    expect(telescope.figures.opticalTrain.description).toContain("{modifier}");
    expect(telescope.figures.opticalTrain.effectiveFocalLength).toContain("{value}");
    expect(telescope.figures.opticalTrain.nativeFocalLength).toContain("{value}");
    expect(telescope.figures.opticalTrain.schematicType).toContain("{telescopeType}");
    expect(telescope.model.defaultPresetSummary).toContain("{presets}");
    expect(telescope.model.inputFieldDetails).toContain("{unit}");
    expect(telescope.model.inputFieldDetails).toContain("{range}");
    expect(telescope.model.inputFieldDetails).toContain("{defaultValue}");
    expect(telescope.model.sourceUnavailable).toContain("{sourceId}");
    expect(telescope.noScript.model.defaultPresetSummary).toContain("{presets}");
    expect(telescope.noScript.model.modelVersionSummary).toContain("{modelVersion}");
    expect(telescope.noScript.model.modelVersionSummary).toContain("{schemaVersion}");
    expect(telescope.result.description).toContain("{modelVersion}");
    expect(telescope.result.targetFitFits).toContain("{targetFit}");
    expect(telescope.result.targetFitDoesNotFit).toContain("{targetFit}");
    expect(telescope.result.typeSummary).toContain("{telescopeType}");
  });

  it("keeps Object templates and shared entity-type labels placeholder-complete", () => {
    expect(enMessages.entityTypes.star).toBe("Star");
    expect(enMessages.entityTypes.dwarf_planet).toBe("Dwarf planet");
    expect(enMessages.entityTypes.black_hole).toBe("Black hole");
    expect(enMessages.entityTypes.sky_region).toBe("Sky region");

    expect(enMessages.object.metadata.description).toContain("{name}");
    expect(enMessages.object.metadata.description).toContain("{entityType}");
    expect(enMessages.object.notFound.description).toContain("{path}");
    expect(enMessages.object.header.measuredQuantities.one).toContain("{entityType}");
    expect(enMessages.object.header.measuredQuantities.one).toContain("{count}");
    expect(enMessages.object.science.measurementDetails.one).toContain("{count}");
    expect(enMessages.object.science.measurementDetails.one).toContain("{originalValue}");
    expect(enMessages.object.science.measurementDetails.one).toContain("{originalUnit}");
    expect(enMessages.object.science.unselected).toContain("{quantities}");
    expect(enMessages.object.provenance.sourceRecord).toContain("{recordId}");
    expect(enMessages.object.provenance.covers).toContain("{quantities}");

    expect(
      formatCountMessage(enMessages.object.header.measuredQuantities, 1, "en", {
        entityType: enMessages.entityTypes.star,
      }),
    ).toBe("Star · 1 measured quantity");
    expect(
      formatCountMessage(enMessages.object.header.measuredQuantities, 2, "en", {
        entityType: enMessages.entityTypes.star,
      }),
    ).toBe("Star · 2 measured quantities");
  });

  it("keeps Compare templates placeholder-complete and preserves English count grammar", () => {
    expect(enMessages.compare.metadata.twoObjectTitle).toContain("{first}");
    expect(enMessages.compare.metadata.twoObjectTitle).toContain("{second}");
    expect(enMessages.compare.metadata.threeObjectTitle).toContain("{third}");
    expect(enMessages.compare.slots.unknownDescription).toContain("{slug}");
    expect(enMessages.compare.removeAction).toContain("{displayName}");
    expect(enMessages.compare.selection.full).toContain("{count}");
    expect(enMessages.compare.add.suggestionsAvailable.one).toContain("{count}");
    expect(enMessages.compare.cells.measurementDetails.one).toContain("{sourceLabel}");
    expect(enMessages.compare.cells.measurementDetails.multiple).toContain("{count}");
    expect(enMessages.compare.cells.measurementDetails.multiple).toContain("{sourceLabel}");
    expect(enMessages.compare.cells.original).toContain("{originalValue}");
    expect(enMessages.compare.cells.original).toContain("{originalUnit}");

    expect(formatCountMessage(enMessages.compare.add.suggestionsAvailable, 1, "en")).toBe(
      "1 suggestion available",
    );
    expect(formatCountMessage(enMessages.compare.add.suggestionsAvailable, 2, "en")).toBe(
      "2 suggestions available",
    );
    expect(
      formatMessageTemplate(enMessages.compare.cells.measurementDetails.one, {
        sourceLabel: "Fixture source",
      }),
    ).toBe("source: Fixture source");
    expect(
      formatMessageTemplate(enMessages.compare.cells.measurementDetails.multiple, {
        count: formatLocaleNumber(2, "en"),
        sourceLabel: "Fixture source",
      }),
    ).toBe("2 measurements recorded — canonical selection shown · source: Fixture source");
  });

  it("keeps Tonight setup templates placeholder-complete and plural-safe", () => {
    expect(enMessages.tonight.collection.optionSaved.one).toContain("{name}");
    expect(enMessages.tonight.collection.optionSaved.one).toContain("{count}");
    expect(enMessages.tonight.analysis.loading.one).toContain("{count}");
    expect(enMessages.tonight.analysis.loading.one).toContain("{completed}");
    expect(enMessages.tonight.events.sourceLine).toContain("{provider}");
    expect(enMessages.tonight.events.sourceLine).toContain("{dataset}");
    expect(enMessages.tonight.events.sourceLine).toContain("{release}");
    expect(enMessages.tonight.events.sourceLine).toContain("{recordId}");
    expect(enMessages.tonight.events.sourceLine).toContain("{disclosure}");
    expect(enMessages.tonight.lists.acceptedPairs.one).toContain("{count}");
    expect(enMessages.tonight.lists.unresolvedSummary.one).toContain("{count}");
    expect(enMessages.tonight.location.currentLocation).toContain("{latitude}");
    expect(enMessages.tonight.location.currentLocation).toContain("{longitude}");
    expect(enMessages.tonight.night.selectedNight).toContain("{date}");
    expect(enMessages.tonight.night.timesShown).toContain("{timeZone}");
    expect(enMessages.tonight.summary.nightAndCollection).toContain("{date}");
    expect(enMessages.tonight.summary.nightAndCollection).toContain("{collectionName}");
    expect(enMessages.tonight.target.altitude).toContain("{value}");
    expect(enMessages.tonight.target.azimuth).toContain("{value}");
    expect(enMessages.tonight.target.azimuth).toContain("{compass}");
    expect(enMessages.tonight.target.highestAltitude).toContain("{altitude}");
    expect(enMessages.tonight.target.highestAltitude).toContain("{time}");
    expect(enMessages.tonight.target.moonLine).toContain("{illumination}");
    expect(enMessages.tonight.target.moonLine).toContain("{altitude}");
    expect(enMessages.tonight.target.moonLine).toContain("{horizon}");
    expect(enMessages.tonight.target.moonLine).toContain("{separation}");
    expect(enMessages.tonight.weather.peakSummary).toContain("{time}");
    expect(enMessages.tonight.weather.peakSummary).toContain("{cloudCover}");
    expect(enMessages.tonight.weather.peakSummary).toContain("{precipitation}");
    expect(enMessages.tonight.weather.consentDisclosure).toContain("{digits}");
    expect(enMessages.tonight.weather.consentDisclosure).toContain("{provider}");
    expect(enMessages.tonight.weather.consentPrompt).toContain("{digits}");
    expect(enMessages.tonight.weather.consentPrompt).toContain("{provider}");
    expect(enMessages.tonight.weather.providerLink).toContain("{provider}");
    expect(enMessages.tonight.weather.providerSummary).toContain("{provider}");
    expect(enMessages.tonight.weather.providerSummaryWithRetrieved).toContain("{retrievedAt}");
    expect(enMessages.tonight.weather.percentValue).toContain("{value}");
    expect(enMessages.tonight.weather.visibilityKilometres).toContain("{value}");
    expect(enMessages.tonight.weather.windKmh).toContain("{value}");

    expect(
      formatCountMessage(enMessages.tonight.collection.optionSaved, 1, "en", {
        name: "Interesting Worlds",
      }),
    ).toBe("Interesting Worlds · 1 saved");
    expect(
      formatCountMessage(enMessages.tonight.collection.optionSaved, 2, "en", {
        name: "Interesting Worlds",
      }),
    ).toBe("Interesting Worlds · 2 saved");
    expect(
      formatMessageTemplate(enMessages.tonight.location.currentLocation, {
        latitude: "12.972",
        longitude: "77.594",
      }),
    ).toBe("Current location 12.972°, 77.594°");
    expect(
      formatMessageTemplate(enMessages.tonight.night.timesShown, {
        timeZone: "Asia/Kolkata",
      }),
    ).toBe("Times shown in Asia/Kolkata");
    expect(formatCountMessage(enMessages.tonight.analysis.loading, 2, "en", { completed: 1 })).toBe(
      "Loading 2 saved objects… 1 of 2 catalogue details loaded.",
    );
    expect(formatCountMessage(enMessages.tonight.lists.unresolvedSummary, 1, "en")).toBe(
      "1 saved object is not in the factual order. The reason is shown for each object.",
    );
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

  it("keeps Launch Center templates placeholder-complete and provider values external", () => {
    const messages = enMessages.spaceNow.launches;

    expect(messages.detail.metadataDescription).toContain("{name}");
    expect(messages.list.lastSafeRefreshFailure).toContain("{code}");
    expect(messages.list.latestRecordUpdate).toContain("{updatedAt}");
    expect(messages.list.providerRecordUpdatedLabel).toBe("Provider record updated");
    expect(messages.list.retrievedCache).toContain("{retrievedAt}");
    expect(messages.list.snapshotCount.one).toContain("{count}");
    expect(messages.list.snapshotCount.one).toContain("{total}");
    expect(messages.schedule.providerPrecision).toContain("{precision}");
    expect(messages.schedule.providerPrecision).toContain("{abbreviation}");
    expect(messages.schedule.providerPrecision).toContain("{countdown}");
    expect(messages.schedule.sourcePrecision).toContain("{precision}");
    expect(messages.schedule.sourcePrecision).toContain("{abbreviation}");
    expect(messages.schedule.sourcePrecision).toContain("{countdown}");
    expect(messages.schedule.window).toContain("{start}");
    expect(messages.schedule.window).toContain("{end}");
    expect(messages.countdown.units.day).toContain("{value}");
    expect(messages.countdown.units.hour).toContain("{value}");
    expect(messages.countdown.units.minute).toContain("{value}");
    expect(messages.countdown.units.second).toContain("{value}");

    expect(formatCountMessage(messages.list.snapshotCount, 1, "en", { total: 2 })).toBe(
      "Showing 1 of 2 normalized launch record retained by this Lumina projection.",
    );
    expect(formatCountMessage(messages.list.snapshotCount, 2, "en", { total: 2 })).toBe(
      "Showing 2 of 2 normalized launch records retained by this Lumina projection.",
    );
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

  it("formats shared coordinate provenance from semantic descriptors", () => {
    const messages = enMessages.coordinateDisclosure;
    expect(messages.gaiaDr3).toContain("{referenceEpoch}");
    expect(messages.messierJ2000).toContain("{referenceEpoch}");
    expect(messages.messierResolverJ2000).toContain("{referenceEpoch}");
    expect(messages.reviewed).toContain("{referenceEpoch}");
    expect(
      formatCoordinateDisclosure({ kind: "gaia-dr3", referenceEpoch: "J2016.0" }, messages),
    ).toBe(
      "Gaia DR3 catalogue position at reference epoch J2016.0. Proper motion is not propagated.",
    );
    expect(
      formatCoordinateDisclosure(
        { kind: "messier-resolver-j2000", referenceEpoch: "J2000.0" },
        messages,
      ),
    ).toContain("SIMBAD Messier ICRS J2000 resolver-record catalogue anchor");
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
