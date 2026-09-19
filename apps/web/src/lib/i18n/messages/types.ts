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

export type MissionControlMessages = Readonly<{
  aboutBody: string;
  aboutTitle: string;
  checkSourceStatus: string;
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
  missionControl: MissionControlMessages;
  routeBoundaries: RouteBoundaryMessages;
  shell: SiteShellMessages;
}>;
