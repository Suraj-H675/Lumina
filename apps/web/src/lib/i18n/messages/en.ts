import type { LuminaMessages } from "./types";

export const enMessages = {
  discoveries: {
    backToMissionControl: "Back to Mission Control",
    bundleReviewed: "Bundle reviewed {reviewedAt}.",
    confirmation: {
      independentlyConfirmed: "Independently confirmed",
      officialPrimaryOnly: "Official primary source only; no independent confirmation claimed here",
      peerReviewedPublication: "Underlying result published in peer-reviewed literature",
    },
    confirmationStateLabel: "Independent-confirmation state",
    currentSetTitle: "Current reviewed set",
    eventDateLabel: "Event date",
    eyebrow: "Mission Control · Reviewed discoveries",
    intro:
      "These are authored, version-controlled summaries checked against the sources linked on each card. Lumina does not generate or continuously scrape science-news prose.",
    metadataDescription:
      "A small version-controlled set of recent space-science and mission updates reviewed against primary or peer-reviewed sources.",
    metadataTitle: "Reviewed discoveries",
    noSeparateEventDate: "No separate event date",
    publishedLabel: "published",
    reviewedSourcesTitle: "Reviewed sources",
    title: "Reviewed discoveries",
    whyItMattersTitle: "Why it matters",
  },
  learn: {
    landing: {
      eyebrow: "Learn",
      intro:
        "Lumina's learning content is authored, reviewed, and source-backed. Start with one complete path designed to help you make a real first observation.",
      metadataDescription:
        "Follow Lumina's authored, source-backed learning path for a first night sky.",
      metadataTitle: "Learn",
      pathLabel: "Complete learning path",
      pathMeta: "{lessonCount} lessons · authored mode variants · deterministic quizzes",
      title: "Understand the sky by looking up",
      viewPath: "View the path",
    },
    lesson: {
      activityMeta: "About {minutes} minutes · Materials: {materials}",
      activityTitle: "Activity: {activityTitle}",
      breadcrumbLabel: "Breadcrumb",
      commonMistakeLabel: "Common mistake:",
      correctionLabel: "Lumina's correction:",
      expectedObservationLabel: "Expected observation:",
      failures: {
        importInvalid: "The learning-progress operation could not be validated.",
        invalidContent: "That learning step is not part of a published Lumina path.",
        storageCorrupted:
          "Saved learning progress could not be read. Reset it from the Learn page to continue.",
        storageQuotaExceeded:
          "This browser's storage is full, so the learning-progress save was refused.",
        storageUnavailable:
          "Local storage is not available, so learning progress cannot be changed right now.",
        storageWriteFailed: "The browser refused the learning-progress save. Nothing was changed.",
      },
      goToAvailableLesson: "Go to the next available lesson",
      learnLink: "Learn",
      lessonIntroduction: "Lesson introduction",
      lessonMeta: "Lesson {lessonNumber} of {lessonCount} · about {minutes} minutes",
      lockedDescription: "This lesson opens after you master: {prerequisites}.",
      lockedTitle: "Complete the prerequisite lesson first",
      masterySaved: "Mastery saved locally.",
      metadataDescription:
        "An authored Lumina learning lesson with a deterministic knowledge check.",
      metadataTitle: "Learning lesson",
      misconceptionTitle: "Misconception check",
      navigationLabel: "Lesson navigation",
      nextLesson: "Next lesson",
      objectivesTitle: "Objectives",
      previousLesson: "Previous lesson",
      quiz: {
        checkAnswers: "Check answers",
        correctLabel: "Correct",
        hintAction: "Need a hint?",
        intro: "{quizTitle}. Choose one answer for each question, then check your work.",
        keepPractising: "{correctCount} of {totalCount} correct · Keep practising",
        notYetLabel: "Not yet",
        question: "{questionNumber}. {questionPrompt}",
        resultMastered: "{correctCount} of {totalCount} correct · Lesson mastered",
        title: "Knowledge check",
        tryAgain: "Try again",
      },
      realExamplesTitle: "Real sky examples",
      reviewPathProgress: "Review path progress",
      safetyLabel: "Safety:",
      saveAttempt: "Attempt saved locally. Try again whenever you are ready.",
      thinkAboutLabel: "Think about:",
    },
    path: {
      breadcrumbLabel: "Breadcrumb",
      capstoneIntro:
        "Finish by making a short, private note about a real observation. You do not need to identify everything; the note should preserve what you saw and what stayed unknown.",
      capstoneTitle: "Capstone: {capstoneTitle}",
      eyebrow: "Learning path",
      learnLink: "Learn",
      lessonList: {
        checkingProgress: "Checking local progress…",
        completeFirst: "Complete first: {prerequisites}.",
        inProgress: "In progress",
        lessonNumber: "Lesson {lessonNumber}",
        locked: "Locked",
        mastered: "Mastered",
        notStarted: "Not started",
        pathComplete: "Path complete — every lesson is mastered at the {threshold} threshold.",
        progress: "{masteredCount} of {lessonCount} mastered",
        statusCorrupted:
          "Saved progress could not be read. You can still read the lessons, but progress is paused until it is reset.",
        title: "Lessons",
      },
      lessonMeta: {
        one: "{count} lesson · quizzes included · no account required",
        other: "{count} lessons · quizzes included · no account required",
      },
      metadataDescription:
        "A complete authored learning path for making a first night-sky observation.",
      objectivesTitle: "What you will practise",
      safetyLabel: "Safety:",
    },
    progressControls: {
      cancelImportAction: "Cancel import",
      confirmImportAction: "Import progress",
      confirmResetAction: "Confirm reset — erase local progress",
      description:
        "Progress stays in this browser on this device. Export a backup when you want one; importing never uploads your file and requires a review step before merging.",
      exportAction: "Export learning progress",
      exportFailure: "Learning progress could not be exported. Nothing was uploaded.",
      exportSuccess: "Learning progress exported to a file on this device.",
      failures: {
        importInvalid:
          "This learning-progress file could not be validated, so nothing was imported.",
        invalidContent: "That learning step is not part of a published Lumina path.",
        resetStorageUnavailable:
          "Local storage is not available, so learning progress cannot be reset.",
        storageCorrupted:
          "Saved learning progress could not be read. Reset it from the Learn page to continue.",
        storageQuotaExceeded:
          "This browser's storage is full, so the learning-progress save was refused.",
        storageUnavailable:
          "Local storage is not available, so learning progress cannot be changed right now.",
        storageWriteFailed: "The browser refused the learning-progress save. Nothing was changed.",
      },
      importAction: "Import learning progress",
      importCancelled: "Import cancelled. Your current progress has not changed.",
      importInvalid: "This learning-progress file could not be validated, so nothing was imported.",
      importReviewReady:
        "Review this import before applying it. Your current progress has not changed.",
      importSuccess: {
        onePathOneAttempt: "Imported {pathCount} learning path and {attemptCount} new attempt.",
        onePathOtherAttempts: "Imported {pathCount} learning path and {attemptCount} new attempts.",
        otherPathsOneAttempt: "Imported {pathCount} learning paths and {attemptCount} new attempt.",
        otherPathsOtherAttempts:
          "Imported {pathCount} learning paths and {attemptCount} new attempts.",
      },
      previewAttempts: {
        one: "This file adds {count} new attempt.",
        other: "This file adds {count} new attempts.",
      },
      previewLessons: {
        one: "It may improve {count} lesson score.",
        other: "It may improve {count} lesson scores.",
      },
      previewPaths: {
        one: "This file adds {count} path.",
        other: "This file adds {count} paths.",
      },
      previewRetention: "Current progress is kept; newer local records are not overwritten.",
      previewTitle: "Review this import",
      resetAction: "Reset local progress",
      resetSuccess: "Local learning progress was cleared.",
      resetWarning: "Resetting removes all learning progress on this device. Confirm to continue.",
      statusCorrupted:
        "Saved learning progress could not be read. It has not been deleted. Reset is an explicit choice below.",
      statusUnavailable:
        "Local storage is unavailable. You can read the path, but progress cannot be saved here.",
      storedSummary: {
        one: "Stored locally: {count} learning path. No account or cloud sync is used.",
        other: "Stored locally: {count} learning paths. No account or cloud sync is used.",
      },
      title: "Your local learning data",
    },
    sources: {
      reviewSummary:
        "Authored content · version {version} · reviewed {reviewedAt} by {reviewedBy}.",
      sourceMeta: "{organization} · {claimScope} Accessed {accessedAt}.",
      sourcesLabel: "Learning content sources",
      title: "Sources and review",
    },
  },
  missionControl: {
    aboutBody:
      "Lumina connects visual exploration, authored learning, deterministic simulations, real-sky observation, and provenance-first current space data. Each capability is added only when its source, assumptions, freshness, and limitations can be shown honestly.",
    aboutTitle: "About Lumina",
    checkSourceStatus: "Check source status",
    continueLearning: {
      activeDescription:
        "Build a first observing habit with a complete, source-backed learning path.",
      checkingProgress: "Checking local progress…",
      completeDescription:
        "Your first path is complete. Revisit a lesson or make another sky note.",
      continueLesson: "Continue with {lessonTitle}",
      eyebrow: "Mission Control",
      nextLessonFallback: "the next lesson",
      noProgress: "{lessonCount} lessons · saved only on this device",
      progress: "{masteredCount} of {lessonCount} lessons mastered locally",
      reviewPath: "Review {pathTitle}",
      startPath: "Start {pathTitle}",
      title: "Continue Learning",
    },
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
  offline: {
    landing: {
      availableDescription:
        "Previously visited learning material, curated Explore pages, object pages, and the basic observation-planner shell can be available from Lumina's local content cache. Saved personal data is stored separately from those offline copies.",
      availableTitle: "What can still work",
      backupDescription:
        "Your browser or operating system can evict cached pages. Personal browser storage can also be cleared independently, so offline availability is best effort rather than a permanent guarantee.",
      backupTitle: "Offline copies are not a backup",
      eyebrow: "Offline mode",
      intro:
        "Pages you visited while online may still be available as reviewed offline copies. An unvisited page may need a connection before Lumina can make it available offline.",
      inlineDocumentTitle: "Offline — Lumina",
      inlineUnavailableDescription:
        "This page is not available from Lumina's reviewed offline copies yet. Reconnect and visit it once before relying on offline access.",
      manageStorage: "Manage offline storage",
      metadataDescription: "Lumina's bounded offline fallback and availability guidance.",
      metadataTitle: "Offline",
      networkDescription:
        "Live space data, source status, weather, uploads, and jobs need a network connection. Lumina never relabels an old provider result as current just because the app is offline.",
      networkTitle: "What still needs a network",
      title: "Lumina is offline",
    },
    storage: {
      approximate: {
        available:
          "Approximately {usage} MiB used of a {quota} MiB origin quota. This is an origin-wide estimate from the browser, not an exact measurement of Lumina's offline cache or personal data.",
        checking: "Checking the browser's storage estimate…",
        heading: "Approximate browser storage",
        unavailable:
          "The browser could not provide its approximate origin-wide usage and quota right now.",
        unsupported:
          "This browser does not expose an origin-wide storage estimate. Lumina does not request persistent-storage permission automatically.",
      },
      cancelAction: "Cancel",
      eyebrow: "Offline mode",
      intro:
        "Review Lumina's best-effort offline cache separately from personal data stored in this browser. These controls do not create an account or cloud backup.",
      metadataDescription:
        "Review and manage Lumina offline copies and local saved observation plans.",
      metadataTitle: "Offline storage",
      offlineCopies: {
        clearAction: "Clear offline copies",
        clearFailure:
          "Lumina could not clear its offline copies. Saved plans and journal data were not changed.",
        clearSuccess: {
          one: "Cleared {count} Lumina cache store. Personal browser data was not deleted.",
          other: "Cleared {count} Lumina cache stores. Personal browser data was not deleted.",
        },
        confirmAction: "Confirm clear offline copies",
        confirmDescription:
          "Lumina will delete only cache names it owns. Pages may need to be visited online again before they work offline.",
        description:
          "CacheStorage holds Lumina's visited offline pages, static app assets, and offline metadata. Cache storage is not a backup: the browser or operating system may evict it.",
        heading: "Offline copies",
        separationNotice:
          "Clearing these copies does not delete saved observation plans, journal entries, collections, or learning progress.",
      },
      personal: {
        checking: "Checking local IndexedDB…",
        confirmAction: "Confirm delete saved plans",
        confirmDescription:
          "Delete every saved observation plan from this browser? Journal entries and offline copies remain separate and will not be cleared.",
        deleteAction: "Delete all saved plans",
        deleteFailure:
          "Lumina could not delete the saved plans. Offline copies and journal data were not changed.",
        deleteSuccess: {
          one: "Deleted {count} saved observation plan. Journal entries and offline copies were not deleted.",
          other:
            "Deleted {count} saved observation plans. Journal entries and offline copies were not deleted.",
        },
        description:
          "Saved observation plans and journal entries live in IndexedDB, separately from offline page copies. Saved plans can contain the exact observer coordinates you explicitly chose to store.",
        heading: "Personal browser data",
        journalEntries: {
          one: "{count} journal entry",
          other: "{count} journal entries",
        },
        manageJournal: "Manage journal entries",
        savedPlans: {
          one: "{count} saved observation plan",
          other: "{count} saved observation plans",
        },
        separateStoresNotice:
          "Collections and learning progress use separate local browser stores and are not counted in the IndexedDB summary above. Neither action on this page deletes them.",
        unavailable:
          "Lumina cannot safely read the local personal-data counts right now. No data was changed.",
      },
      title: "Storage and offline copies",
    },
  },
  participate: {
    activities: {
      ageGuidanceLabel: "Age guidance:",
      cleanupLabel: "Cleanup",
      description:
        "Reviewed materials, steps, safety notes, expected observations, cleanup, supervision, and limitations are shown together so an activity is never separated from its safety boundary.",
      durationLabel: "Duration:",
      expectedObservationLabel: "Expected observation",
      heading: "Hands-on activities",
      learningObjectiveLabel: "Learning objective",
      limitationsTitle: "Limitations",
      materialsTitle: "Materials",
      noScriptCleanup: "Cleanup: {cleanup}",
      noScriptExpectedObservation: "Expected observation: {observation}",
      noScriptLearningObjective: "Learning objective: {objective}",
      safetyTitle: "Safety",
      skillGuidanceLabel: "Skill guidance:",
      stepsTitle: "Steps",
      suggestedDuration: "Suggested duration: {duration}",
      supervisionLabel: "Supervision",
    },
    challenges: {
      description:
        "These prompts do not predict that a target or event is visible from your hemisphere, latitude, weather, or current sky. Lumina does not request or store location for these challenges.",
      heading: "Twelve evergreen monthly challenges",
      monthTitle: "Month {month}: {challengeTitle}",
      noScriptDescription:
        "These are authored observing prompts, not visibility predictions for your location or hemisphere. Lumina does not request or store location for them.",
      safetyTitle: "Safety",
      stepsTitle: "Steps",
      suggestedDuration: "Suggested duration: {duration}",
    },
    eyebrow: "Participate",
    freshness: {
      cacheStateLabel: "Cache state",
      cacheStates: {
        expired: "expired",
        fresh: "fresh",
        missing: "missing",
        stale: "stale",
      },
      description:
        "Project status comes only from Lumina's last validated Panoptes cache. This page does not contact Zooniverse from your browser. Reviewed descriptions, challenges, activities, and source links remain Lumina-owned static content.",
      freshUntilLabel: "Fresh until",
      headings: {
        fresh: "Fresh project-status snapshot",
        stale: "Project status may be stale",
        unavailable: "Current project status unavailable",
      },
      noScriptDescription:
        "Panoptes status is read only from Lumina's last validated server-side cache. This page does not contact Zooniverse from your browser.",
      noScriptCacheState: "Cache state: {cacheState}",
      noScriptFreshUntil: "Fresh until: {timestamp}",
      noScriptRetrievedAt: "Retrieved at: {timestamp}",
      noScriptStaleGraceEnds: "Stale grace ends: {timestamp}",
      retrievedAtLabel: "Retrieved at",
      staleGraceEndsLabel: "Stale grace ends",
    },
    metadataDescription:
      "Reviewed astronomy citizen-science projects, evergreen observing challenges, and safe hands-on activities with explicit source and external-handoff boundaries.",
    metadataTitle: "Participate",
    projects: {
      description:
        "Six reviewed astronomy projects. The filters describe task shape and source-reported training/device context; skill focus is not a difficulty ranking.",
      filters: {
        all: "All",
        deviceLabel: "Device",
        deviceOptions: {
          mobileOrComputer: "Mobile device or computer",
          tabletExplicit: "Tablet explicitly supported",
          webDevice: "Web-connected device",
        },
        empty: "No reviewed project matches all three filters. Reset or broaden a filter.",
        heading: "Filter citizen-science projects",
        reset: "Reset filters",
        shown: "{shownCount} of {totalCount} projects shown",
        skillFocusLabel: "Skill focus",
        skillOptions: {
          candidateImageValidation: "Candidate-image validation",
          lightCurveReading: "Light-curve reading",
          plotReading: "Plot reading",
          spectroscopyData: "Spectroscopy data",
          visualClassification: "Visual classification",
        },
        timeLabel: "Training time",
        timeOptions: {
          aFewMinutes: "A few minutes",
          about10Minutes: "About 10 minutes",
          about15Minutes: "About 15 minutes",
          fiveToFifteenMinutes: "5–15 minutes",
        },
      },
      heading: "Citizen-science projects",
      labels: {
        currentStatus: "Current status",
        device: "Device",
        providerSourceUpdated: "Provider source updated",
        skillFocus: "Skill focus",
        sourceUpdated: "Source updated",
        trainingTime: "Training/time",
      },
      noScriptDescription:
        "Filters require JavaScript, so all six reviewed projects are listed here. Skill focus describes the task, not a difficulty ranking.",
      openOnZooniverse: "Open {projectTitle} on Zooniverse",
      sourceAttribution: "{sourceTitle} — {organization}",
      sourceLink: "Source: {sourceTitle}",
      status: {
        active: "Currently public and live",
        activeStale: "Currently public and live — status may be stale",
        inactive: "Currently not public/live",
        inactiveStale: "Currently not public/live — status may be stale",
        unavailable: "Current project status unavailable",
      },
      trainingTimeValue: "{filterLabel} — {timeLabel}",
      unavailableReviewedSource: "Unavailable reviewed source: {sourceId}",
    },
    sourcesTitle: "Reviewed sources",
    unavailable: {
      description:
        "Lumina could not load the reviewed Participate contract from its own API. No project status, challenge, activity, or external destination is being reconstructed in the browser.",
      title: "Participate is temporarily unavailable",
    },
    unavailableValue: "Unavailable",
  },
  presentationMode: {
    description: "The science and answers stay the same.",
    label: "Presentation mode",
    options: {
      deepDive: "Deep Dive",
      explorer: "Explorer",
      student: "Student",
    },
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
