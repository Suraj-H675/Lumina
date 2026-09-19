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

export type LearnMessages = Readonly<{
  landing: LearnLandingMessages;
  path: LearningPathMessages;
  progressControls: LearningProgressControlsMessages;
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

export type LuminaMessages = Readonly<{
  discoveries: DiscoveriesMessages;
  learn: LearnMessages;
  missionControl: MissionControlMessages;
  routeBoundaries: RouteBoundaryMessages;
  shell: SiteShellMessages;
}>;
