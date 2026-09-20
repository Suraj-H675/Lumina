export const NAVIGATION_MESSAGE_KEYS = [
  "explore",
  "learn",
  "lab",
  "spaceNow",
  "identify",
  "compare",
  "observe",
  "tonight",
  "participate",
  "journal",
  "collections",
  "systemStatus",
] as const;

export type NavigationMessageKey = (typeof NAVIGATION_MESSAGE_KEYS)[number];

export type NavigationMessages = Readonly<{
  ariaLabel: string;
  observationPlannerAriaLabel: string;
  items: Readonly<Record<NavigationMessageKey, string>>;
}>;

export type PwaStatusMessages = Readonly<{
  applyUpdate: string;
  applyingUpdate: string;
  offlineCopyNotice: string;
  offlineNotice: string;
  offlineTitle: string;
  updateHelp: string;
  updateTitle: string;
}>;

export type SiteShellMessages = Readonly<{
  exploreCatalogue: string;
  footerTagline: string;
  navigation: NavigationMessages;
  pwa: PwaStatusMessages;
  skipToMainContent: string;
}>;

export type NotFoundMessages = Readonly<{
  code: string;
  description: string;
  returnHome: string;
  title: string;
}>;

export type RouteErrorMessages = Readonly<{
  description: string;
  retry: string;
  title: string;
}>;

export type GlobalErrorMessages = Readonly<{
  description: string;
  retry: string;
  title: string;
}>;

export type RouteBoundaryMessages = Readonly<{
  globalError: GlobalErrorMessages;
  notFound: NotFoundMessages;
  routeError: RouteErrorMessages;
}>;

export type DiscoveriesMessages = Readonly<{
  backToMissionControl: string;
  bundleReviewed: string;
  confirmation: Readonly<{
    independentlyConfirmed: string;
    officialPrimaryOnly: string;
    peerReviewedPublication: string;
  }>;
  confirmationStateLabel: string;
  currentSetTitle: string;
  eventDateLabel: string;
  eyebrow: string;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  noSeparateEventDate: string;
  publishedLabel: string;
  reviewedSourcesTitle: string;
  title: string;
  whyItMattersTitle: string;
}>;

export type CollectionsMessages = Readonly<{
  addObject: Readonly<{
    inputLabel: string;
    placeholder: string;
    savedAnnouncement: string;
    suggestionsAvailable: CountMessageTemplates;
  }>;
  detail: Readonly<{
    addDescription: string;
    addHeading: string;
    backToCollections: string;
    cancelAction: string;
    compareDescription: string;
    compareEmpty: string;
    compareHeading: string;
    compareMaximumReached: string;
    compareSelected: string;
    compareSelectedWithCount: string;
    deleteAction: string;
    deleteCollectionAction: string;
    deleteDescription: string;
    deleteItemCount: CountMessageTemplates;
    deleteTitle: string;
    emptyDescription: string;
    emptyTitle: string;
    exploreCatalogue: string;
    goToCollections: string;
    keepCollectionAction: string;
    missingDescription: string;
    missingTitle: string;
    objectCount: CountMessageTemplates;
    objectsListLabel: string;
    removeObjectLabel: string;
    renameAction: string;
    renameDescription: string;
    renameTitle: string;
    saveNameAction: string;
    savedDescription: string;
    savedHeading: string;
    savedSummary: string;
    selectObjectsLabel: string;
  }>;
  failures: Readonly<{
    collectionLimit: string;
    collectionNotFound: string;
    duplicateName: string;
    invalidName: string;
    invalidObject: string;
    itemLimit: string;
    storageCorrupted: string;
    storageUnavailable: string;
    storageWriteFailed: string;
  }>;
  metadata: Readonly<{
    detailDescription: string;
    detailTitle: string;
    overviewDescription: string;
    overviewTitle: string;
  }>;
  overview: Readonly<{
    browseObjects: string;
    createAction: string;
    createDialogDescription: string;
    createDialogTitle: string;
    createFirstAction: string;
    createSubmitAction: string;
    emptyDescription: string;
    emptyTitle: string;
    exploreObjects: string;
    eyebrow: string;
    intro: string;
    objectCount: CountMessageTemplates;
    sectionLabel: string;
    title: string;
  }>;
  shared: Readonly<{
    corrupted: Readonly<{
      confirmResetAction: string;
      description: string;
      resetAction: string;
      resetSuccess: string;
      resetWarning: string;
      title: string;
    }>;
    loading: string;
    storageUnavailable: Readonly<{
      pageDescription: string;
      pickerDescription: string;
      title: string;
    }>;
  }>;
  validation: Readonly<{
    blankName: string;
    defaultHint: string;
    duplicateName: string;
    nameLabel: string;
    placeholder: string;
    renameHint: string;
    tooLongName: string;
  }>;
}>;

export type CollectionStateMessages = Pick<CollectionsMessages, "failures" | "shared">;

export type LearnLandingMessages = Readonly<{
  eyebrow: string;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  pathLabel: string;
  pathMeta: string;
  title: string;
  viewPath: string;
}>;

export type CountMessageTemplates = Readonly<{
  one: string;
  other: string;
}>;

export type LearningProgressControlsMessages = Readonly<{
  cancelImportAction: string;
  confirmImportAction: string;
  confirmResetAction: string;
  description: string;
  exportAction: string;
  exportFailure: string;
  exportSuccess: string;
  failures: Readonly<{
    importInvalid: string;
    invalidContent: string;
    resetStorageUnavailable: string;
    storageCorrupted: string;
    storageQuotaExceeded: string;
    storageUnavailable: string;
    storageWriteFailed: string;
  }>;
  importAction: string;
  importCancelled: string;
  importInvalid: string;
  importReviewReady: string;
  importSuccess: Readonly<{
    onePathOneAttempt: string;
    onePathOtherAttempts: string;
    otherPathsOneAttempt: string;
    otherPathsOtherAttempts: string;
  }>;
  previewAttempts: CountMessageTemplates;
  previewLessons: CountMessageTemplates;
  previewPaths: CountMessageTemplates;
  previewRetention: string;
  previewTitle: string;
  resetAction: string;
  resetSuccess: string;
  resetWarning: string;
  statusCorrupted: string;
  statusUnavailable: string;
  storedSummary: CountMessageTemplates;
  title: string;
}>;

export type LearningPathMessages = Readonly<{
  breadcrumbLabel: string;
  capstoneIntro: string;
  capstoneTitle: string;
  eyebrow: string;
  learnLink: string;
  lessonList: Readonly<{
    checkingProgress: string;
    completeFirst: string;
    inProgress: string;
    lessonNumber: string;
    locked: string;
    mastered: string;
    notStarted: string;
    pathComplete: string;
    progress: string;
    statusCorrupted: string;
    title: string;
  }>;
  lessonMeta: CountMessageTemplates;
  metadataDescription: string;
  objectivesTitle: string;
  safetyLabel: string;
}>;

export type LearningSourcesMessages = Readonly<{
  reviewSummary: string;
  sourceMeta: string;
  sourcesLabel: string;
  title: string;
}>;

export type LearningLessonMessages = Readonly<{
  activityMeta: string;
  activityTitle: string;
  breadcrumbLabel: string;
  commonMistakeLabel: string;
  correctionLabel: string;
  expectedObservationLabel: string;
  failures: Readonly<{
    importInvalid: string;
    invalidContent: string;
    storageCorrupted: string;
    storageQuotaExceeded: string;
    storageUnavailable: string;
    storageWriteFailed: string;
  }>;
  goToAvailableLesson: string;
  learnLink: string;
  lessonIntroduction: string;
  lessonMeta: string;
  lockedDescription: string;
  lockedTitle: string;
  masterySaved: string;
  misconceptionTitle: string;
  nextLesson: string;
  objectivesTitle: string;
  previousLesson: string;
  quiz: Readonly<{
    checkAnswers: string;
    correctLabel: string;
    hintAction: string;
    intro: string;
    keepPractising: string;
    notYetLabel: string;
    question: string;
    resultMastered: string;
    title: string;
    tryAgain: string;
  }>;
  realExamplesTitle: string;
  reviewPathProgress: string;
  safetyLabel: string;
  saveAttempt: string;
  metadataDescription: string;
  metadataTitle: string;
  navigationLabel: string;
  thinkAboutLabel: string;
}>;

export type LearnMessages = Readonly<{
  landing: LearnLandingMessages;
  lesson: LearningLessonMessages;
  path: LearningPathMessages;
  progressControls: LearningProgressControlsMessages;
  sources: LearningSourcesMessages;
}>;

export type LabIndexMessages = Readonly<{
  eyebrow: string;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  navigationLabel: string;
  openLab: string;
  title: string;
}>;

export type MissionControlMessages = Readonly<{
  aboutBody: string;
  aboutTitle: string;
  checkSourceStatus: string;
  continueLearning: Readonly<{
    activeDescription: string;
    checkingProgress: string;
    completeDescription: string;
    continueLesson: string;
    eyebrow: string;
    nextLessonFallback: string;
    noProgress: string;
    progress: string;
    reviewPath: string;
    startPath: string;
    title: string;
  }>;
  currentMissionEvent: Readonly<{
    countdownEligibleExplanation: string;
    countdownIneligibleExplanation: string;
    inspectLaunch: string;
    launchProviderLabel: string;
    missionLabel: string;
    missingValue: string;
    openLaunchCenter: string;
    providerDisabled: string;
    scheduleReferenceLabel: string;
    scheduledNetLabel: string;
    siteLabel: string;
    sourcePrecisionLabel: string;
    title: string;
    unavailable: string;
    vehicleLabel: string;
  }>;
  exploreCatalogue: string;
  eyebrow: string;
  findSatellitePasses: string;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  missionBoard: Readonly<{
    description: string;
    emptyCurrent: string;
    siteMissing: string;
    title: string;
    unavailable: string;
    vehicleMissing: string;
  }>;
  openLaunchCenter: string;
  reviewedDiscovery: Readonly<{
    confirmationStateLabel: string;
    eyebrow: string;
    publishedLabel: string;
    seeAll: string;
    whyItMattersTitle: string;
  }>;
  title: string;
}>;

export type ParticipateMessages = Readonly<{
  activities: Readonly<{
    ageGuidanceLabel: string;
    cleanupLabel: string;
    description: string;
    durationLabel: string;
    expectedObservationLabel: string;
    heading: string;
    learningObjectiveLabel: string;
    limitationsTitle: string;
    materialsTitle: string;
    noScriptCleanup: string;
    noScriptExpectedObservation: string;
    noScriptLearningObjective: string;
    safetyTitle: string;
    skillGuidanceLabel: string;
    stepsTitle: string;
    suggestedDuration: string;
    supervisionLabel: string;
  }>;
  challenges: Readonly<{
    description: string;
    heading: string;
    monthTitle: string;
    noScriptDescription: string;
    safetyTitle: string;
    stepsTitle: string;
    suggestedDuration: string;
  }>;
  eyebrow: string;
  freshness: Readonly<{
    cacheStateLabel: string;
    cacheStates: Readonly<{
      expired: string;
      fresh: string;
      missing: string;
      stale: string;
    }>;
    description: string;
    freshUntilLabel: string;
    headings: Readonly<{
      fresh: string;
      stale: string;
      unavailable: string;
    }>;
    noScriptDescription: string;
    noScriptCacheState: string;
    noScriptFreshUntil: string;
    noScriptRetrievedAt: string;
    noScriptStaleGraceEnds: string;
    retrievedAtLabel: string;
    staleGraceEndsLabel: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  projects: Readonly<{
    description: string;
    filters: Readonly<{
      all: string;
      deviceLabel: string;
      deviceOptions: Readonly<{
        mobileOrComputer: string;
        tabletExplicit: string;
        webDevice: string;
      }>;
      empty: string;
      heading: string;
      reset: string;
      shown: string;
      skillFocusLabel: string;
      skillOptions: Readonly<{
        candidateImageValidation: string;
        lightCurveReading: string;
        plotReading: string;
        spectroscopyData: string;
        visualClassification: string;
      }>;
      timeLabel: string;
      timeOptions: Readonly<{
        aFewMinutes: string;
        about10Minutes: string;
        about15Minutes: string;
        fiveToFifteenMinutes: string;
      }>;
    }>;
    heading: string;
    labels: Readonly<{
      currentStatus: string;
      device: string;
      providerSourceUpdated: string;
      skillFocus: string;
      sourceUpdated: string;
      trainingTime: string;
    }>;
    noScriptDescription: string;
    openOnZooniverse: string;
    sourceAttribution: string;
    sourceLink: string;
    status: Readonly<{
      active: string;
      activeStale: string;
      inactive: string;
      inactiveStale: string;
      unavailable: string;
    }>;
    trainingTimeValue: string;
    unavailableReviewedSource: string;
  }>;
  sourcesTitle: string;
  unavailable: Readonly<{
    description: string;
    title: string;
  }>;
  unavailableValue: string;
}>;

export type OfflineMessages = Readonly<{
  landing: Readonly<{
    availableDescription: string;
    availableTitle: string;
    backupDescription: string;
    backupTitle: string;
    eyebrow: string;
    intro: string;
    inlineDocumentTitle: string;
    inlineUnavailableDescription: string;
    manageStorage: string;
    metadataDescription: string;
    metadataTitle: string;
    networkDescription: string;
    networkTitle: string;
    title: string;
  }>;
  storage: Readonly<{
    approximate: Readonly<{
      available: string;
      checking: string;
      heading: string;
      unavailable: string;
      unsupported: string;
    }>;
    cancelAction: string;
    eyebrow: string;
    intro: string;
    metadataDescription: string;
    metadataTitle: string;
    offlineCopies: Readonly<{
      clearAction: string;
      clearFailure: string;
      clearSuccess: CountMessageTemplates;
      confirmAction: string;
      confirmDescription: string;
      description: string;
      heading: string;
      separationNotice: string;
    }>;
    personal: Readonly<{
      checking: string;
      confirmAction: string;
      confirmDescription: string;
      deleteAction: string;
      deleteFailure: string;
      deleteSuccess: CountMessageTemplates;
      description: string;
      heading: string;
      journalEntries: CountMessageTemplates;
      manageJournal: string;
      savedPlans: CountMessageTemplates;
      separateStoresNotice: string;
      unavailable: string;
    }>;
    title: string;
  }>;
}>;

export type PresentationModeMessages = Readonly<{
  description: string;
  label: string;
  options: Readonly<{
    deepDive: string;
    explorer: string;
    student: string;
  }>;
}>;

export type StatusMessages = Readonly<{
  contract: Readonly<{
    apiVersionLabel: string;
    applicationVersionLabel: string;
    heading: string;
  }>;
  eyebrow: string;
  provider: Readonly<{
    acknowledgmentAndUsage: string;
    cache: Readonly<{
      expired: string;
      fresh: string;
      historicalOnlyWhileDisabled: string;
      missing: string;
      stale: string;
    }>;
    circuit: Readonly<{
      closed: string;
      halfOpen: string;
      open: string;
    }>;
    counters: Readonly<{
      cyclesStarted: string;
      heading: string;
      httpRequests: string;
      httpRetries: string;
      quarantines: string;
      schemaFailures: string;
      staleFallbacks: string;
      successfulCycles: string;
      upstreamFailures: string;
    }>;
    heading: string;
    labels: Readonly<{
      acceptedSnapshotFetched: string;
      cacheState: string;
      circuit: string;
      freshUntil: string;
      lastRefreshFailure: string;
      lastSuccessfulRefresh: string;
      nextCircuitProbe: string;
      nextPlannedAttempt: string;
      providerCode: string;
      providerState: string;
      staleUntil: string;
      syncLease: string;
    }>;
    lease: Readonly<{
      active: string;
      notActive: string;
    }>;
    noneRecorded: string;
    notRecorded: string;
    officialDocumentation: string;
    state: Readonly<{
      disabled: string;
      enabled: string;
    }>;
    unavailable: string;
  }>;
  returnHome: string;
  states: Readonly<{
    availableUnconfirmed: Readonly<{
      detail: string;
      heading: string;
    }>;
    notReady: Readonly<{
      detail: string;
      heading: string;
    }>;
    ready: Readonly<{
      detail: string;
      heading: string;
    }>;
    unavailable: Readonly<{
      detail: string;
      heading: string;
    }>;
  }>;
  title: string;
}>;

export type LuminaMessages = Readonly<{
  collections: CollectionsMessages;
  discoveries: DiscoveriesMessages;
  labIndex: LabIndexMessages;
  learn: LearnMessages;
  missionControl: MissionControlMessages;
  offline: OfflineMessages;
  participate: ParticipateMessages;
  presentationMode: PresentationModeMessages;
  routeBoundaries: RouteBoundaryMessages;
  shell: SiteShellMessages;
  status: StatusMessages;
}>;
