import type { LuminaMessages } from "./types";

export const enMessages = {
  missionControl: {
    aboutBody:
      "Lumina connects visual exploration, authored learning, deterministic simulations, real-sky observation, and provenance-first current space data. Each capability is added only when its source, assumptions, freshness, and limitations can be shown honestly.",
    aboutTitle: "About Lumina",
    checkSourceStatus: "Check source status",
    currentMissionEvent: {
      countdownEligibleExplanation:
        "The detailed Launch Center may show an exact countdown because this record is Go and precise to the minute or second.",
      countdownIneligibleExplanation:
        "Mission Control does not turn this source status and precision into an exact countdown.",
      inspectLaunch: "Inspect this launch and its provenance",
      launchProviderLabel: "Launch provider",
      missionLabel: "Mission",
      missingValue: "Not provided by source",
      openLaunchCenter: "Open Launch Center",
      providerDisabled:
        "The launch provider is disabled, so Mission Control is making no current-launch claim.",
      scheduleReferenceLabel: "Schedule reference",
      scheduledNetLabel: "Scheduled NET",
      siteLabel: "Site",
      sourcePrecisionLabel: "Source precision",
      title: "Current mission event",
      unavailable:
        "No validated Launch Library 2 snapshot is available to Mission Control right now.",
      vehicleLabel: "Vehicle",
    },
    exploreCatalogue: "Explore the catalogue",
    eyebrow: "Mission Control",
    findSatellitePasses: "Find satellite passes",
    intro:
      "A small live-and-reviewed home for what is happening in space now: one source-labelled launch event, a bounded upcoming mission board, reviewed discoveries, and your authored learning progress. Lumina is still under construction, so unavailable data stays visibly unavailable rather than being replaced with guesses.",
    metadataDescription:
      "Lumina Mission Control combines a cache-backed current launch event, bounded mission board, reviewed discoveries, and authored learning without hiding source freshness or uncertainty.",
    metadataTitle: "Mission Control",
    missionBoard: {
      description:
        "Mission-bearing, nonterminal records from the same bounded Launch Library 2 snapshot. This is not a catalogue of every active spacecraft mission.",
      emptyCurrent: "No mission-bearing records are available in the current public launch slice.",
      siteMissing: "Site not provided",
      title: "Upcoming mission board",
      unavailable: "The mission board is unavailable until Lumina has a validated launch snapshot.",
      vehicleMissing: "Vehicle not provided",
    },
    openLaunchCenter: "Open Launch Center",
    reviewedDiscovery: {
      confirmationStateLabel: "Confirmation state",
      eyebrow: "Reviewed discovery",
      publishedLabel: "Published",
      seeAll: "See all reviewed discoveries and sources",
      whyItMattersTitle: "Why it matters",
    },
    title: "Mission Control",
  },
  routeBoundaries: {
    globalError: {
      description: "Lumina could not load. Try again, or return to the foundation home page later.",
      retry: "Try again",
      title: "Something went wrong",
    },
    notFound: {
      code: "404",
      description: "This address is not part of the Lumina foundation yet.",
      returnHome: "Return to the Lumina foundation home page",
      title: "Page not found",
    },
    routeError: {
      description: "Try again. If the problem continues, return to the foundation home page.",
      retry: "Try again",
      title: "This part of Lumina could not load",
    },
  },
  shell: {
    exploreCatalogue: "Explore the catalogue",
    footerTagline: "Lumina — a free, scientifically grounded way to explore space.",
    navigation: {
      ariaLabel: "Primary",
      observationPlannerAriaLabel: "Observation planner",
      items: {
        collections: "Collections",
        compare: "Compare",
        explore: "Explore",
        identify: "Identify",
        journal: "Journal",
        lab: "Lab",
        learn: "Learn",
        observe: "Observe",
        participate: "Participate",
        spaceNow: "Space Now",
        systemStatus: "Status",
        tonight: "Tonight",
      },
    },
    pwa: {
      applyUpdate: "Apply update",
      applyingUpdate: "Applying update…",
      offlineCopyNotice:
        "This page is an offline copy saved by Lumina at {cachedAt}. Displayed live or provider data may no longer be current; check its source and retrieval time.",
      offlineNotice:
        "Displayed live or provider data may no longer be current; check its source and retrieval time. Unvisited pages and network-only features may be unavailable.",
      offlineTitle: "You are offline.",
      updateHelp: "Apply it when you are ready to reload this page.",
      updateTitle: "A Lumina update is ready.",
    },
    skipToMainContent: "Skip to main content",
  },
} as const satisfies LuminaMessages;
