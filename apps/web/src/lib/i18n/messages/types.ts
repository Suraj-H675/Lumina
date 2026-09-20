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
  save: Readonly<{
    compare: Readonly<{
      alreadySaved: string;
      chooseCollection: string;
      collectionLabel: string;
      corrupted: string;
      description: string;
      newCollectionNameLabel: string;
      newCollectionOption: string;
      objectCount: CountMessageTemplates;
      saveAction: string;
      savedToCollection: string;
      savedToNamedCollection: string;
      title: string;
      triggerAction: string;
      unavailable: string;
      willSave: string;
    }>;
    loading: string;
    picker: Readonly<{
      confirmResetAction: string;
      confirmResetAriaLabel: string;
      createAction: string;
      createdAnnouncement: string;
      createdUnavailable: string;
      corruptedDescription: string;
      description: string;
      doneAction: string;
      empty: string;
      full: string;
      listLabel: string;
      newCollectionLabel: string;
      removedAnnouncement: string;
      resetAction: string;
      resetAriaLabel: string;
      resetSuccess: string;
      resetWarning: string;
      savedAnnouncement: string;
      savedCount: CountMessageTemplates;
      title: string;
      unavailable: string;
    }>;
    trigger: Readonly<{
      manageAriaLabel: string;
      saveAction: string;
      saveAriaLabel: string;
      savedAction: string;
    }>;
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
export type CollectionSaveMessages = Pick<CollectionsMessages, "failures" | "save" | "validation">;

export type CatalogueSearchMessages = Readonly<{
  clearAction: string;
  inputLabel: string;
  placeholder: string;
  suggestionsAvailable: CountMessageTemplates;
}>;

export type EntityTypeMessages = Readonly<{
  asteroid: string;
  black_hole: string;
  cluster: string;
  comet: string;
  compact_object: string;
  concept: string;
  constellation: string;
  dwarf_planet: string;
  event: string;
  exoplanet: string;
  galaxy: string;
  launch_vehicle: string;
  mission: string;
  moon: string;
  nebula: string;
  observatory: string;
  person: string;
  planet: string;
  sky_region: string;
  spacecraft: string;
  star: string;
  system: string;
}>;

export type CompareMessages = Readonly<{
  add: Readonly<{
    fullPlaceholder: string;
    inputLabel: string;
    maximumStatus: string;
    placeholder: string;
    suggestionsAvailable: CountMessageTemplates;
  }>;
  cells: Readonly<{
    measurementDetails: Readonly<{
      multiple: string;
      one: string;
    }>;
    original: string;
    unavailable: string;
    unknown: string;
    unmeasured: string;
  }>;
  comparison: Readonly<{
    emptyDescription: string;
    emptySummary: string;
    heading: string;
    identityAriaLabel: string;
    identityHeading: string;
    identitySummary: string;
    quantityHeading: string;
    quantityListAriaLabel: string;
    scienceSummary: string;
    tableCaption: string;
  }>;
  empty: Readonly<{
    addHeading: string;
    description: string;
    title: string;
  }>;
  footerBackToExplore: string;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  metadata: Readonly<{
    description: string;
    genericTitle: string;
    twoObjectTitle: string;
    threeObjectTitle: string;
  }>;
  removeAction: string;
  selection: Readonly<{
    ariaLabel: string;
    full: string;
    heading: string;
    partial: string;
  }>;
  slots: Readonly<{
    unavailableDescription: string;
    unavailableTitle: string;
    unknownDescription: string;
    unknownTitle: string;
  }>;
}>;

export type TonightMessages = Readonly<{
  analysis: Readonly<{
    catalogueFailure: string;
    emptyOrdering: string;
    loading: CountMessageTemplates;
    orderingExplanation: string;
    prompt: string;
    retryCatalogue: string;
  }>;
  collection: Readonly<{
    emptyDescription: string;
    emptyTitle: string;
    exploreObjects: string;
    heading: string;
    manageCollections: string;
    noNonEmptyDescription: string;
    noNonEmptyTitle: string;
    openCollections: string;
    optionSaved: CountMessageTemplates;
    selectLabel: string;
    summary: string;
    usageNote: string;
  }>;
  emptyCollection: Readonly<{
    description: string;
    manageAction: string;
    title: string;
  }>;
  events: Readonly<{
    detailsSummary: string;
    meridianTransit: string;
    rise: string;
    set: string;
    sourceLine: string;
    statusCircumpolar: string;
    statusNeverRises: string;
    statusNotDuringNight: string;
    statusUnavailable: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidNight: Readonly<{
    description: string;
    title: string;
  }>;
  location: Readonly<{
    calculateAction: string;
    coordinateHelp: string;
    currentLocation: string;
    geolocationDenied: string;
    geolocationGeneric: string;
    geolocationTimeout: string;
    geolocationUnavailable: string;
    heading: string;
    invalidCoordinates: string;
    latitudeLabel: string;
    longitudeLabel: string;
    lookingUp: string;
    manualLegend: string;
    privacyNote: string;
    summary: string;
    unsupported: string;
    useMyLocation: string;
  }>;
  locationRequired: Readonly<{
    description: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  night: Readonly<{
    dateHelp: string;
    heading: string;
    nightOf: string;
    selectedNight: string;
    timesShown: string;
  }>;
  lists: Readonly<{
    aboveDescription: string;
    aboveTitle: string;
    acceptedPairs: CountMessageTemplates;
    authoritativeNote: string;
    belowDescription: string;
    belowTitle: string;
    inspectPlanner: string;
    noDarknessDescription: string;
    noDarknessTitle: string;
    openPlanner: string;
    unresolvedReasons: Readonly<{
      catalogueNotFound: string;
      catalogueUnavailable: string;
      geometryUnavailable: string;
      missingCoordinate: string;
      multipleCoordinateSources: string;
    }>;
    unresolvedSummary: CountMessageTemplates;
    unresolvedTitle: string;
  }>;
  resultsHeader: Readonly<{
    heading: string;
    orderBy: string;
    sortHighestAltitude: string;
    sortName: string;
    sortPeakTime: string;
    summary: string;
  }>;
  summary: Readonly<{
    aboveHorizon: string;
    astronomicalDawn: string;
    astronomicalDusk: string;
    calculating: string;
    darkness: string;
    heading: string;
    nightAndCollection: string;
    noDarkness: string;
    savedTargets: string;
    scientificallyAnalyzed: string;
    sunBelowEighteen: string;
    unavailable: string;
    unavailableForNight: string;
    unavailableUnresolved: string;
    waiting: string;
  }>;
  target: Readonly<{
    altitude: string;
    azimuth: string;
    azimuthAtPeak: string;
    highestAltitude: string;
    moonAbove: string;
    moonBelow: string;
    moonLine: string;
    moonUnavailable: string;
  }>;
  weather: Readonly<{
    consentDisclosure: string;
    consentPrompt: string;
    contextUnavailable: string;
    dateUnavailable: string;
    failure: string;
    heading: string;
    humidityLabel: string;
    intro: string;
    licenceLink: string;
    loadAction: string;
    loaded: string;
    loading: string;
    moreFacts: string;
    peakSummary: string;
    percentValue: string;
    providerLink: string;
    providerSummary: string;
    providerSummaryWithRetrieved: string;
    retry: string;
    unavailableValue: string;
    visibilityKilometres: string;
    visibilityLabel: string;
    windKmh: string;
    windLabel: string;
  }>;
}>;

export type ExploreMessages = Readonly<{
  browse: Readonly<{
    emptyDescription: string;
    emptyTitle: string;
    heading: string;
    nextPage: string;
    objectsAriaLabel: string;
    paginationAriaLabel: string;
    showingFirst: CountMessageTemplates;
    showingNext: CountMessageTemplates;
    summary: string;
  }>;
  header: Readonly<{
    deepSkyAction: string;
    exoplanetSystemsAction: string;
    eyebrow: string;
    intro: string;
    solarSystemAction: string;
    systemCompareAction: string;
    title: string;
    voyagerAction: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  search: Readonly<{
    heading: string;
    invalidQuery: string;
    matchedAlias: string;
    minimumQuery: string;
    noResultsDescription: string;
    noResultsTitle: string;
    resultsAriaLabel: string;
    summary: CountMessageTemplates;
  }>;
  unavailable: Readonly<{
    catalogueTitle: string;
    description: string;
    searchTitle: string;
  }>;
}>;

export type ObjectMessages = Readonly<{
  footerBackToExplore: string;
  header: Readonly<{
    backToExplore: string;
    compare: string;
    eyebrow: string;
    measuredQuantities: CountMessageTemplates;
    observe: string;
  }>;
  metadata: Readonly<{
    description: string;
    notFoundTitle: string;
    unavailableTitle: string;
  }>;
  notFound: Readonly<{
    browseCatalogue: string;
    description: string;
    title: string;
  }>;
  provenance: Readonly<{
    covers: string;
    empty: string;
    heading: string;
    sourceRecord: string;
    summary: string;
  }>;
  science: Readonly<{
    empty: string;
    heading: string;
    measurementDetails: CountMessageTemplates;
    summary: string;
    unselected: string;
  }>;
  unavailable: Readonly<{
    browseCatalogue: string;
    description: string;
    title: string;
  }>;
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

export type CoordinateDisclosureMessages = Readonly<{
  gaiaDr3: string;
  messierJ2000: string;
  messierResolverJ2000: string;
  reviewed: string;
  reviewedWithoutEpoch: string;
}>;

export type DeepSkyAtlasMessages = Readonly<{
  activation: Readonly<{
    checking: string;
    missingTarget: string;
    open: string;
    opening: string;
    readyForTarget: string;
  }>;
  canvasAriaLabel: string;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  observer: Readonly<{
    apply: string;
    elevationLabel: string;
    latitudeLabel: string;
    legend: string;
    localHorizon: string;
    longitudeLabel: string;
    privacy: string;
    useLocation: string;
  }>;
  rendererDisclosure: string;
  status: Readonly<{
    activationFailed: string;
    checkingSurvey: string;
    contextLost: string;
    currentTimeApplied: string;
    currentTimeFailed: string;
    focusFailed: string;
    focused: string;
    geolocationDenied: string;
    geolocationUnavailable: string;
    graphicsRestored: string;
    horizonDisabled: string;
    horizonEnabled: string;
    horizonFailed: string;
    initialLayerUnavailable: string;
    invalidLayer: string;
    layerChanged: string;
    layerDisplayFailed: string;
    loading: string;
    locationCopied: string;
    observerApplied: string;
    observerFailed: string;
    observerInvalid: string;
    panFailed: string;
    ready: string;
    switchLayerUnavailable: string;
    utcApplied: string;
    utcApplyFailed: string;
    utcInvalid: string;
    zoomFailed: string;
  }>;
  survey: Readonly<{
    creditLabel: string;
    legend: string;
    sourceDetails: string;
    wavelengthLabel: string;
  }>;
  time: Readonly<{
    apply: string;
    help: string;
    inputLabel: string;
    legend: string;
    useCurrent: string;
  }>;
  view: Readonly<{
    focus: string;
    legend: string;
    panAriaLabel: string;
    panDown: string;
    panLeft: string;
    panRight: string;
    panUp: string;
    zoomIn: string;
    zoomOut: string;
  }>;
}>;

export type DeepSkyMessages = Readonly<{
  atlas: DeepSkyAtlasMessages;
  browse: Readonly<{
    ariaLabel: string;
    boundedSlice: string;
    empty: string;
    summary: string;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
    unavailableTypes: string;
  }>;
  header: Readonly<{
    backToExplore: string;
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidLayer: string;
  layers: Readonly<{
    description: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  selection: Readonly<{
    coordinateAmbiguousDescription: string;
    coordinateAmbiguousTitle: string;
    coordinateSourceLabel: string;
    coordinateUnavailableDescription: string;
    coordinateUnavailableTitle: string;
    datasetLabel: string;
    declinationLabel: string;
    invalidDescription: string;
    invalidTitle: string;
    openObject: string;
    openPlanner: string;
    referenceEpochLabel: string;
    rightAscensionLabel: string;
    selectedEyebrow: string;
    selectDescription: string;
    selectTitle: string;
    sourceRecordLabel: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
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

export type JournalEntryMessages = Readonly<{
  addAction: string;
  cancelAction: string;
  description: string;
  dialogTitle: string;
  doneAction: string;
  failures: Readonly<{
    entryLimit: string;
    generic: string;
    invalidEntry: string;
    storageUnavailable: string;
    writeRejected: string;
  }>;
  form: Readonly<{
    intro: string;
    latitudeLabel: string;
    locationLabel: string;
    locationLegend: string;
    locationPlaceholder: string;
    longitudeLabel: string;
    notesLabel: string;
    observationTimeLabel: string;
    plannerCoordinatesHelp: string;
    plannerLocationLabel: string;
    saveAction: string;
    savingAction: string;
    timeHelp: string;
    titleLabel: string;
    titlePlaceholder: string;
    usePlannerCoordinates: string;
    usePlannerTime: string;
  }>;
  openJournal: string;
  savedStatus: string;
  validation: Readonly<{
    coordinatePairRequired: string;
    coordinatesInvalid: string;
    locationLabelRequired: string;
    timeInvalid: string;
    titleRequired: string;
  }>;
}>;

export type JournalMessages = Readonly<{
  entry: JournalEntryMessages;
  entries: Readonly<{
    conditionsTitle: string;
    coordinateFrameLabel: string;
    deleteGroupLabel: string;
    deleteLocalEntry: string;
    entryIdLabel: string;
    equipmentLabel: string;
    followUpLabel: string;
    followUpMarked: string;
    followUpNotMarked: string;
    keepEntry: string;
    localImageLabel: string;
    localImageNotRetained: string;
    localImageRetained: string;
    locationLabel: string;
    locationWithCoordinates: string;
    moreSavedObjects: CountMessageTemplates;
    noPlateSolve: string;
    notRecorded: string;
    notesTitle: string;
    observationTimeLabel: string;
    pixelScaleLabel: string;
    pixelScaleValue: string;
    plateSolveProvenance: string;
    savedAt: string;
    savedObjectsLabel: string;
    savedObjectsTitle: string;
    snapshotIdLabel: string;
    solvedCenterLabel: string;
    solvedCenterValue: string;
    solverVersionLabel: string;
    confirmLocalDelete: string;
    wcsFingerprintLabel: string;
  }>;
  eyebrow: string;
  failures: Readonly<{
    storageCorrupted: string;
    storageUnavailable: string;
  }>;
  identifyAnotherImage: string;
  intro: string;
  loading: string;
  metadataDescription: string;
  metadataTitle: string;
  privacyDetail: string;
  states: Readonly<{
    emptyDescription: string;
    emptyTitle: string;
    entriesTitle: string;
    unavailableTitle: string;
  }>;
  title: string;
  transfer: Readonly<{
    applyReviewedImport: string;
    conflictSummary: string;
    conflictTitle: string;
    description: string;
    exportAction: string;
    exportFailure: string;
    importActionWorking: string;
    importComplete: string;
    importDescription: string;
    importFileLabel: string;
    importFileSizeInvalid: string;
    importInvalid: string;
    importPreviewTitle: string;
    importPreviewConflicts: CountMessageTemplates;
    importPreviewNewEntries: CountMessageTemplates;
    keepLocal: string;
    preparingExport: string;
    recommendationKeepLocal: string;
    recommendationUseImported: string;
    title: string;
    useImported: string;
    failures: Readonly<{
      generic: string;
      invalid: string;
      previewStale: string;
      unresolved: string;
    }>;
  }>;
}>;

export type SavedObservationPlanMessages = Readonly<{
  actions: Readonly<{
    cancelDelete: string;
    confirmDelete: string;
    deletePlan: string;
    openPlanner: string;
    planAgain: string;
  }>;
  delete: Readonly<{
    description: string;
    failure: string;
    title: string;
  }>;
  events: Readonly<{
    astronomicalDawn: string;
    astronomicalDusk: string;
    circumpolar: string;
    neverRises: string;
    notDuringNight: string;
    rise: string;
    set: string;
    sunriseGeometric: string;
    sunsetGeometric: string;
    transit: string;
    unavailable: string;
  }>;
  eyebrow: string;
  loading: Readonly<{
    description: string;
    title: string;
  }>;
  night: Readonly<{
    darknessUnavailable: string;
    highestAltitude: string;
    title: string;
  }>;
  observer: Readonly<{
    altitudeValue: string;
    azimuthValue: string;
    locationLabel: string;
    locationValue: string;
    selectedTimeLabel: string;
    skyPositionLabel: string;
    storedLocal: string;
    title: string;
  }>;
  samples: Readonly<{
    altitudeGeometric: string;
    label: string;
    savedInstant: string;
    title: string;
  }>;
  snapshotDescription: string;
  snapshotSummary: string;
  source: Readonly<{
    calculationDescription: string;
    datasetSummary: string;
    referenceEpochLabel: string;
    sourceRecordLabel: string;
    title: string;
  }>;
  states: Readonly<{
    corrupted: Readonly<{ body: string; heading: string }>;
    deleted: Readonly<{ body: string; heading: string }>;
    error: Readonly<{ body: string; heading: string }>;
    invalid: Readonly<{ body: string; heading: string }>;
    missing: Readonly<{ body: string; heading: string }>;
    unavailable: Readonly<{ body: string; heading: string }>;
  }>;
}>;

export type SaveObservationPlanMessages = Readonly<{
  description: string;
  failures: Readonly<{
    generic: string;
    identifierUnavailable: string;
    planLimit: string;
    quotaExceeded: string;
    storageCorrupted: string;
    storageUnavailable: string;
  }>;
  openSavedPlan: string;
  saveAction: string;
  savingAction: string;
  savedStatus: string;
  title: string;
}>;

export type ObservationConditionsMessages = Readonly<{
  lunar: Readonly<{
    closest: Readonly<{
      description: string;
      notApplicable: string;
      unavailableDescription: string;
      title: string;
    }>;
    description: string;
    horizonPosition: Readonly<{
      above: string;
      below: string;
    }>;
    metrics: Readonly<{
      aboveHorizon: string;
      altitude: string;
      azimuth: string;
      azimuthConvention: string;
      belowHorizon: string;
      illumination: string;
      separation: string;
      separationDetail: string;
    }>;
    model: string;
    phases: Readonly<{
      firstQuarter: string;
      full: string;
      new: string;
      thirdQuarter: string;
      waningCrescent: string;
      waningGibbous: string;
      waxingCrescent: string;
      waxingGibbous: string;
    }>;
    selectedSummary: string;
    selectedTitle: string;
    title: string;
    unavailable: string;
  }>;
  overview: Readonly<{
    description: string;
    title: string;
  }>;
  unavailableValue: string;
  weather: Readonly<{
    attribution: Readonly<{
      dataLink: string;
      licenceLink: string;
      privacy: string;
      provider: string;
      providerRetrieved: string;
    }>;
    cloudLayers: Readonly<{
      high: string;
      low: string;
      mid: string;
      title: string;
    }>;
    conditions: Readonly<{
      clearSky: string;
      denseDrizzle: string;
      denseFreezingDrizzle: string;
      depositingRimeFog: string;
      fog: string;
      heavyFreezingRain: string;
      heavyRain: string;
      heavySnowFall: string;
      heavySnowShowers: string;
      lightDrizzle: string;
      lightFreezingDrizzle: string;
      lightFreezingRain: string;
      mainlyClear: string;
      moderateDrizzle: string;
      moderateRain: string;
      moderateRainShowers: string;
      moderateSnowFall: string;
      overcast: string;
      partlyCloudy: string;
      slightRain: string;
      slightRainShowers: string;
      slightSnowFall: string;
      slightSnowShowers: string;
      snowGrains: string;
      thunderstorm: string;
      thunderstormHeavyHail: string;
      thunderstormSlightHail: string;
      unavailable: string;
      unknown: string;
      violentRainShowers: string;
    }>;
    dateUnavailable: string;
    description: string;
    errorUnavailable: string;
    loadAction: string;
    loading: string;
    metrics: Readonly<{
      cloudCover: string;
      cloudCoverDetail: string;
      humidity: string;
      humidityDetail: string;
      precipitation: string;
      precipitationDetail: string;
      visibility: string;
      visibilityDetail: string;
      wind: string;
      windDetail: string;
    }>;
    optInDescription: string;
    retryAction: string;
    selectedDescription: string;
    selectedTitle: string;
    selectedUnavailable: string;
    summary: Readonly<{
      cloudCoverDetail: string;
      cloudCoverRange: string;
      cloudCoverRangeValue: string;
      empty: string;
      precipitationDetail: string;
      precipitationMaximum: string;
      points: CountMessageTemplates;
      title: string;
      visibilityDetail: string;
      visibilityMinimum: string;
      windDetail: string;
      windMaximum: string;
    }>;
    timeline: Readonly<{
      description: string;
      point: string;
      title: string;
    }>;
    title: string;
  }>;
}>;

export type SkyFinderMessages = Readonly<{
  brightStars: Readonly<{
    markerDescription: string;
    positionsDescription: string;
    sourceDescription: string;
    states: Readonly<{
      hidden: string;
      loading: string;
      shown: CountMessageTemplates;
      shownCapped: string;
      unavailable: string;
    }>;
    title: string;
  }>;
  compass: Readonly<{
    e: string;
    ene: string;
    ese: string;
    n: string;
    ne: string;
    nne: string;
    nnw: string;
    nw: string;
    s: string;
    se: string;
    sse: string;
    ssw: string;
    sw: string;
    w: string;
    wnw: string;
    wsw: string;
  }>;
  constellation: Readonly<{
    abbreviation: string;
    boundaryDescription: string;
    name: string;
    officialRegion: string;
    sourceDescription: string;
    states: Readonly<{
      hidden: string;
      loading: string;
      noVisibleBoundary: string;
      shown: string;
      unavailable: string;
    }>;
    title: string;
  }>;
  guidance: Readonly<{
    aboveHorizonValue: string;
    altitude: string;
    belowDescription: string;
    belowHeading: string;
    direction: string;
    directionValue: string;
    face: string;
    heading: string;
    localObstructions: string;
    lookUp: string;
    reference: string;
    spokenAbove: string;
    spokenBelow: string;
    spokenDegrees: string;
    trueAzimuth: string;
  }>;
  map: Readonly<{
    caption: string;
    horizon: string;
    zenith: string;
  }>;
  namedAnchors: Readonly<{
    altitudeGeometric: string;
    angularSeparation: string;
    listAriaLabel: string;
    nearest: string;
    objectiveContext: string;
    rowAriaLabel: string;
    sourceDescription: string;
    states: Readonly<{
      hidden: string;
      loading: string;
      ready: CountMessageTemplates;
      unavailable: string;
    }>;
    title: string;
  }>;
  overview: Readonly<{
    description: string;
    eyebrow: string;
    noSensors: string;
    title: string;
  }>;
  references: Readonly<{
    altitudeGeometric: string;
    bodies: Readonly<{
      jupiter: string;
      mars: string;
      mercury: string;
      saturn: string;
      sun: string;
      venus: string;
    }>;
    geometricOnly: string;
    hidden: string;
    moon: string;
    moonUnavailable: string;
    noneAboveHorizon: string;
    rowAriaLabel: string;
    targetTag: string;
    title: string;
  }>;
  toggles: Readonly<{
    brightStars: Readonly<{ help: string; label: string }>;
    constellation: Readonly<{ help: string; label: string }>;
    namedAnchors: Readonly<{ help: string; label: string }>;
    solarSystem: Readonly<{ help: string; label: string }>;
  }>;
}>;

export type ObservationPlannerMessages = Readonly<{
  chart: Readonly<{
    accessibleHighest: string;
    accessibleNoDarkness: string;
    description: string;
    descriptionWithSelectedTime: string;
    title: string;
  }>;
  coordinateSource: Readonly<{
    description: string;
    heading: string;
    option: string;
  }>;
  conditions: ObservationConditionsMessages;
  coordinatesUnavailable: Readonly<{
    description: string;
    title: string;
  }>;
  header: Readonly<{
    chooseObject: string;
    description: string;
    eyebrow: string;
    openObject: string;
    targetSummary: string;
  }>;
  location: Readonly<{
    calculateAction: string;
    coordinateHelp: string;
    currentLocation: string;
    deviceNote: string;
    geolocationFailures: Readonly<{
      denied: string;
      timeout: string;
      unavailable: string;
      unknown: string;
    }>;
    geolocationUnsupported: string;
    invalidCoordinates: string;
    latitudeLabel: string;
    longitudeLabel: string;
    lookupBusy: string;
    manualLegend: string;
    privacyDescription: string;
    title: string;
    useMyLocation: string;
  }>;
  metadata: Readonly<{
    description: string;
    title: string;
  }>;
  night: Readonly<{
    dateHelp: string;
    dateLabel: string;
    nowAction: string;
    selectedTimeHelp: string;
    selectedTimeLabel: string;
    summary: string;
    timeZoneSummary: string;
    title: string;
  }>;
  results: Readonly<{
    altitudeGeometric: string;
    azimuthConvention: string;
    belowHorizonHeading: string;
    darknessUnavailable: string;
    eyebrow: string;
    highestAltitude: string;
    highestHeading: string;
    nightBoundaries: string;
    solarBoundaryDescription: string;
    selectedTime: string;
    events: Readonly<{
      astronomicalDawn: string;
      astronomicalDusk: string;
      circumpolar: string;
      meridianTransit: string;
      neverRises: string;
      notDuringNight: string;
      rise: string;
      set: string;
      sunriseGeometric: string;
      sunsetGeometric: string;
      unavailable: string;
    }>;
    targetEvents: Readonly<{
      description: string;
      title: string;
    }>;
    source: Readonly<{
      sourceRecordLabel: string;
      title: string;
    }>;
  }>;
  savePlan: SaveObservationPlanMessages;
  skyFinder: SkyFinderMessages;
  states: Readonly<{
    invalidTime: Readonly<{
      description: string;
      title: string;
    }>;
    locationRequired: Readonly<{
      description: string;
      title: string;
    }>;
  }>;
  target: Readonly<{
    emptyDescription: string;
    heading: string;
    reviewedSuggestions: string;
    unavailable: string;
  }>;
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

export type LaunchCenterMessages = Readonly<{
  common: Readonly<{
    backToLaunchCenter: string;
    cacheStates: Readonly<{
      expired: string;
      fresh: string;
      missing: string;
      stale: string;
    }>;
    noneRecorded: string;
    notProvided: string;
    notProvidedBySource: string;
    notRecorded: string;
    spaceNowLaunchCenter: string;
    unavailableReasons: Readonly<{
      cachedContentExpired: string;
      noValidatedSnapshot: string;
      providerDisabled: string;
    }>;
  }>;
  countdown: Readonly<{
    label: string;
    loading: string;
    reachedOrPassed: string;
    units: Readonly<{
      day: string;
      hour: string;
      minute: string;
      second: string;
    }>;
  }>;
  detail: Readonly<{
    addToCalendar: string;
    calendarWithheld: string;
    factsTitle: string;
    labels: Readonly<{
      cacheState: string;
      country: string;
      destinationBody: string;
      lastRefreshFailure: string;
      launchPad: string;
      launchProvider: string;
      ll2RecordUpdated: string;
      location: string;
      luminaRetrieved: string;
      missionAgencies: string;
      missionType: string;
      orbit: string;
      vehicle: string;
      vehicleVariant: string;
    }>;
    metadataDescription: string;
    metadataNotFoundTitle: string;
    metadataUnavailableTitle: string;
    notFoundDescription: string;
    notFoundTitle: string;
    officialLaunchPage: string;
    officialLiveWebcast: string;
    officialWebcast: string;
    provenanceTitle: string;
    sourceActionsTitle: string;
    sourceDocumentation: string;
    transportDescription: string;
    transportTitle: string;
    unavailableTitle: string;
  }>;
  list: Readonly<{
    backToSpaceNow: string;
    currentSnapshotTitle: string;
    eyebrow: string;
    facts: Readonly<{
      launchProvider: string;
      mission: string;
      site: string;
      vehicle: string;
    }>;
    freshSnapshot: string;
    intro: string;
    lastSafeRefreshFailure: string;
    latestRecordUpdate: string;
    metadataDescription: string;
    metadataTitle: string;
    noBrowserProviderRequest: string;
    providerInformation: string;
    providerRecordUpdatedLabel: string;
    retrievedCache: string;
    snapshotCount: CountMessageTemplates;
    sourceDocumentation: string;
    sourceTitle: string;
    staleSnapshot: string;
    title: string;
    transportDescription: string;
    transportTitle: string;
    unavailableTitle: string;
    latestRecordNotRecorded: string;
    unrecordedTime: string;
  }>;
  schedule: Readonly<{
    countdownEligibleDetail: string;
    countdownEligibleList: string;
    countdownIneligibleDetail: string;
    countdownIneligibleList: string;
    launchWindow: string;
    providerPrecision: string;
    scheduleReference: string;
    scheduledNet: string;
    sourcePrecision: string;
    window: string;
  }>;
}>;

export type SpaceNowMessages = Readonly<{
  dailyVisual: Readonly<{
    aboutTitle: string;
    actions: Readonly<{
      image: string;
      video: string;
    }>;
    contentDateLabel: string;
    copyrightLabel: string;
    eyebrow: string;
    externalMediaNotice: string;
    freshSnapshot: string;
    freshnessDescription: string;
    invalidOfficialLink: string;
    mediaTypeLabel: string;
    mediaTypes: Readonly<{
      image: string;
      video: string;
    }>;
    staleSnapshot: string;
  }>;
  eyebrow: string;
  intro: string;
  launches: LaunchCenterMessages;
  metadataDescription: string;
  metadataTitle: string;
  navigation: Readonly<{
    launches: Readonly<{
      action: string;
      description: string;
      eyebrow: string;
      title: string;
    }>;
    nearEarth: Readonly<{
      action: string;
      description: string;
      eyebrow: string;
      title: string;
    }>;
    satellites: Readonly<{
      action: string;
      description: string;
      eyebrow: string;
      title: string;
    }>;
    spaceWeather: Readonly<{
      action: string;
      description: string;
      eyebrow: string;
      title: string;
    }>;
  }>;
  retrieval: Readonly<{
    cacheStateLabel: string;
    cacheStates: Readonly<{
      expired: string;
      fresh: string;
      missing: string;
      stale: string;
    }>;
    freshUntilLabel: string;
    lastFailureLabel: string;
    noneRecorded: string;
    notRecorded: string;
    retrievedAtLabel: string;
    staleUntilLabel: string;
    title: string;
  }>;
  source: Readonly<{
    apiDocumentation: string;
    mediaGuidance: string;
    officialPage: string;
    title: string;
  }>;
  title: string;
  unavailable: Readonly<{
    cachedContentExpired: string;
    generic: string;
    noCachedContent: string;
    providerDisabled: string;
    title: string;
  }>;
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
  catalogueSearch: CatalogueSearchMessages;
  collections: CollectionsMessages;
  compare: CompareMessages;
  coordinateDisclosure: CoordinateDisclosureMessages;
  deepSky: DeepSkyMessages;
  discoveries: DiscoveriesMessages;
  entityTypes: EntityTypeMessages;
  explore: ExploreMessages;
  journal: JournalMessages;
  labIndex: LabIndexMessages;
  learn: LearnMessages;
  missionControl: MissionControlMessages;
  object: ObjectMessages;
  observationPlanner: ObservationPlannerMessages;
  offline: OfflineMessages;
  participate: ParticipateMessages;
  presentationMode: PresentationModeMessages;
  routeBoundaries: RouteBoundaryMessages;
  savedObservationPlan: SavedObservationPlanMessages;
  shell: SiteShellMessages;
  spaceNow: SpaceNowMessages;
  status: StatusMessages;
  tonight: TonightMessages;
}>;
