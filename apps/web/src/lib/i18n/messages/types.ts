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
  lab: Readonly<{
    scaleExplorer: RouteErrorMessages;
    telescopeBuilder: RouteErrorMessages;
  }>;
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

export type SolarSystemDistanceMessages = Readonly<{
  backToExplore: string;
  continue: Readonly<{
    action: string;
    description: string;
    title: string;
  }>;
  eyebrow: string;
  explorer: Readonly<{
    dataAlternative: Readonly<{
      description: string;
      headers: Readonly<{
        body: string;
        lightTime: string;
        linearTrack: string;
        logTrack: string;
        meanDistance: string;
      }>;
      logUndefined: string;
      title: string;
    }>;
    description: string;
    logDescription: string;
    linearDescription: string;
    modelEyebrow: string;
    scaleAriaLabel: string;
    scaleModes: Readonly<{
      linearAction: string;
      linearTrackName: string;
      logAction: string;
      logTrackName: string;
    }>;
    selected: Readonly<{
      compareSizeAction: string;
      disclosure: string;
      earthRatioLabel: string;
      eyebrow: string;
      lightTimeLabel: string;
      meanDistanceLabel: string;
    }>;
    sunOrigin: string;
    trackSummary: string;
    title: string;
    valueWithUnit: string;
  }>;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptionsTitle: string;
    description: string;
    limitationsTitle: string;
    linearMappingLabel: string;
    logMappingLabel: string;
    title: string;
  }>;
  sources: Readonly<{
    description: string;
    title: string;
  }>;
  title: string;
}>;

export type ExoplanetSystemsMessages = Readonly<{
  backToExplore: string;
  continue: Readonly<{
    action: string;
    description: string;
    title: string;
  }>;
  eyebrow: string;
  explorer: Readonly<{
    dataAlternative: Readonly<{
      description: string;
      headers: Readonly<{
        discovery: string;
        host: string;
        orbitalPeriod: string;
        planet: string;
        semimajorAxis: string;
      }>;
      title: string;
    }>;
    description: string;
    host: Readonly<{
      ariaLabel: string;
      confirmedPlanets: CountMessageTemplates;
      groupAriaLabel: string;
      hostname: string;
      openCanonical: string;
      originDisclosure: string;
    }>;
    linearDescription: string;
    logDescription: string;
    modelEyebrow: string;
    parameter: Readonly<{
      noUncertainty: string;
      orbitalPeriodLabel: string;
      reference: string;
      semimajorAxisLabel: string;
      uncertainty: string;
      valueWithUnit: string;
    }>;
    planet: Readonly<{
      discoverySummary: string;
      disclosure: string;
      eyebrow: string;
    }>;
    scaleAriaLabel: string;
    scaleModes: Readonly<{
      linearAction: string;
      linearTrackName: string;
      logAction: string;
      logTrackName: string;
    }>;
    systemLayoutAriaLabel: string;
    title: string;
    trackSummary: string;
  }>;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptionsTitle: string;
    description: string;
    limitationsTitle: string;
    title: string;
  }>;
  provenance: Readonly<{
    archiveTableLabel: string;
    bytesLabel: string;
    columnDocumentation: string;
    description: string;
    providerLabel: string;
    querySummary: string;
    retrievedLabel: string;
    shaLabel: string;
    tapDocumentation: string;
    title: string;
  }>;
  title: string;
}>;

export type VoyagerMessages = Readonly<{
  backToExplore: string;
  centerBodyName: string;
  eyebrow: string;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptionsTitle: string;
    description: string;
    limitationsTitle: string;
    title: string;
  }>;
  provenance: Readonly<{
    bytesLabel: string;
    centerLabel: string;
    description: string;
    documentation: string;
    firstEpochLabel: string;
    lastSampleLabel: string;
    outputLabel: string;
    outputValue: string;
    providerLabel: string;
    referenceFrameLabel: string;
    samplingLabel: string;
    shaLabel: string;
    targetLabel: string;
    targetValue: string;
    timeScaleValue: string;
    title: string;
  }>;
  sourcesTitle: string;
  table: Readonly<{
    axisHeader: string;
    description: string;
    distanceHeader: string;
    epochHeader: string;
    title: string;
    yearHeader: string;
  }>;
  timeline: Readonly<{
    description: string;
    source: string;
    title: string;
  }>;
  title: string;
  trajectory: Readonly<{
    description: string;
    distanceHistory: Readonly<{
      ariaLabel: string;
      description: string;
      title: string;
    }>;
    eyebrow: string;
    projection: Readonly<{
      ariaLabel: string;
      description: string;
      title: string;
    }>;
    sampleLabel: string;
    selectedVectorTitle: string;
    sliderAriaLabel: string;
    title: string;
    valueWithUnit: string;
    vectorLabels: Readonly<{
      distance: string;
      epoch: string;
    }>;
  }>;
}>;

export type SystemScaleCompareMessages = Readonly<{
  backToExplore: string;
  defaultComparison: Readonly<{
    description: string;
    headers: Readonly<{
      earthMultiple: string;
      reference: string;
      scientificQuantity: string;
      value: string;
    }>;
    title: string;
  }>;
  eyebrow: string;
  explorer: Readonly<{
    card: Readonly<{
      openSourceExplorer: string;
      quantityLabel: string;
      reviewedValueLabel: string;
      sampleEpochLabel: string;
      source: string;
    }>;
    description: string;
    laneAriaLabel: string;
    laneSummary: string;
    modelEyebrow: string;
    referenceSelect: Readonly<{
      exoplanetLabel: string;
      optionValue: string;
      solarLabel: string;
      voyagerLabel: string;
    }>;
    scaleAriaLabel: string;
    scaleModes: Readonly<{
      linearAction: string;
      linearDescription: string;
      linearName: string;
      logAction: string;
      logDescription: string;
      logName: string;
    }>;
    selectedDefinitionsTitle: string;
    title: string;
  }>;
  intro: string;
  inventory: Readonly<{
    description: string;
    headers: Readonly<{
      group: string;
      quantity: string;
      reference: string;
      source: string;
      value: string;
    }>;
    summary: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptionsTitle: string;
    description: string;
    limitationsTitle: string;
    title: string;
  }>;
  title: string;
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
  exoplanetSystems: ExoplanetSystemsMessages;
  solarSystemDistance: SolarSystemDistanceMessages;
  systemScaleCompare: SystemScaleCompareMessages;
  voyager: VoyagerMessages;
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
  routeError: RouteErrorMessages;
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
  routeState: Readonly<{
    error: RouteErrorMessages;
    loading: string;
  }>;
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

export type OrbitSandboxMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  classification: Readonly<{
    bound: string;
    collision: string;
    escape: string;
    parabolicNear: string;
  }>;
  controls: Readonly<{
    description: string;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  fields: Readonly<{
    centralMass: string;
    centralRadius: string;
    duration: string;
    positionX: string;
    positionY: string;
    secondaryMass: string;
    timeStep: string;
    velocityX: string;
    velocityY: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    equations: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    currentStateTitle: string;
    eyebrow: string;
    intro: string;
    modelTitle: string;
    collisionTimeLabel: string;
    stateLabels: Readonly<{
      centralMass: string;
      centralRadius: string;
      duration: string;
      initialPosition: string;
      initialVelocity: string;
      secondaryMass: string;
      timeStep: string;
    }>;
  }>;
  notApplicable: string;
  preview: Readonly<{
    description: string;
    headers: Readonly<{
      distance: string;
      speed: string;
      time: string;
      x: string;
      y: string;
    }>;
    summary: string;
  }>;
  result: Readonly<{
    description: string;
    labels: Readonly<{
      apoapsis: string;
      classification: string;
      collisionTime: string;
      eccentricity: string;
      maxAngularMomentumDrift: string;
      maxSpecificEnergyDrift: string;
      periapsis: string;
      period: string;
      semiMajorAxis: string;
      specificAngularMomentum: string;
      specificOrbitalEnergy: string;
      trajectorySamples: string;
    }>;
    model: string;
    noScriptCaption: string;
    noScriptTitle: string;
    notReached: string;
    title: string;
    unavailableDescription: string;
    unavailableNoScriptDescription: string;
    unavailableNoScriptTitle: string;
    unavailableTitle: string;
  }>;
  trajectory: Readonly<{
    description: string;
    caption: string;
    title: string;
  }>;
}>;

export type TransitMethodMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  classification: Readonly<{
    full: string;
    grazing: string;
    noTransit: string;
  }>;
  controls: Readonly<{
    description: string;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  fields: Readonly<{
    inclination: string;
    orbitalPeriod: string;
    planetRadius: string;
    semiMajorAxis: string;
    stellarRadius: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    equations: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    currentStateTitle: string;
    eyebrow: string;
    intro: string;
    modelTitle: string;
    stateLabels: Readonly<{
      inclination: string;
      orbitalPeriod: string;
      planetRadius: string;
      semiMajorAxis: string;
      stellarRadius: string;
    }>;
  }>;
  notApplicable: string;
  preview: Readonly<{
    description: string;
    headers: Readonly<{
      orbitalPhase: string;
      projectedSeparation: string;
      relativeFlux: string;
      time: string;
    }>;
    summary: string;
  }>;
  result: Readonly<{
    description: string;
    labels: Readonly<{
      alignment: string;
      centralDepthApproximation: string;
      fullDuration: string;
      impactParameter: string;
      lightCurveSamples: string;
      maximumDepth: string;
      maximumUniformSourceDepth: string;
      radiusRatio: string;
      scaledSemiMajorAxis: string;
      totalDuration: string;
    }>;
    model: string;
    noScriptCaption: string;
    noScriptLabels: Readonly<{
      alignment: string;
      centralDepthApproximation: string;
      fullDuration: string;
      impactParameter: string;
      lightCurveSamples: string;
      maximumDepth: string;
      maximumUniformSourceDepth: string;
      radiusRatio: string;
      scaledSemiMajorAxis: string;
      totalDuration: string;
    }>;
    noScriptTitle: string;
    noTransit: string;
    title: string;
    unavailableDescription: string;
    unavailableNoScriptDescription: string;
    unavailableNoScriptTitle: string;
    unavailableTitle: string;
  }>;
  lightCurve: Readonly<{
    caption: string;
    description: string;
    title: string;
  }>;
}>;

export type RadialVelocityMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    title: string;
  }>;
  curve: Readonly<{
    caption: string;
    description: string;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  fields: Readonly<{
    argumentOfPeriastron: string;
    companionMass: string;
    eccentricity: string;
    inclination: string;
    meanAnomalyAtEpoch: string;
    orbitalPeriod: string;
    stellarMass: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  minimumMass: Readonly<{
    description: string;
    noScriptDescription: string;
    noScriptTitle: string;
    title: string;
  }>;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    equations: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    currentStateTitle: string;
    intro: string;
    modelTitle: string;
    stateLabels: Readonly<{
      argumentOfPeriastron: string;
      companionMass: string;
      eccentricity: string;
      inclination: string;
      meanAnomalyAtEpoch: string;
      orbitalPeriod: string;
      stellarMass: string;
    }>;
  }>;
  preview: Readonly<{
    description: string;
    headers: Readonly<{
      orbitalPhase: string;
      stellarRv: string;
      time: string;
    }>;
    summary: string;
  }>;
  result: Readonly<{
    labels: Readonly<{
      edgeOnMinimumMass: string;
      inclinationProjection: string;
      massFunction: string;
      projectedMass: string;
      samples: string;
      semiAmplitude: string;
    }>;
    model: string;
    noScriptCaption: string;
    noScriptLabels: Readonly<{
      edgeOnMinimumMass: string;
      inclinationProjection: string;
      massFunction: string;
      projectedMass: string;
      samples: string;
      semiAmplitude: string;
    }>;
    title: string;
    unavailableDescription: string;
    unavailableNoScriptDescription: string;
    unavailableNoScriptTitle: string;
    unavailableTitle: string;
  }>;
}>;

export type BlackHoleRelativityMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    massAriaLabel: string;
    massLabel: string;
    radiusAriaLabel: string;
    radiusLabel: string;
    title: string;
  }>;
  failures: Readonly<{
    emptyInput: string;
    outOfDomain: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  landmarks: Readonly<{
    caption: string;
    description: string;
    headers: Readonly<{
      interpretation: string;
      landmark: string;
      radiusM: string;
      radiusRs: string;
    }>;
    schematicAriaLabel: string;
    schematicCaption: string;
    selectedStaticObserver: string;
    tableAriaLabel: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    equations: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    clock: Readonly<{
      farAwayInterval: string;
      frequencyRatio: string;
      properTimeRate: string;
      redshift: string;
      title: string;
    }>;
    controlDisclosure: string;
    eyebrow: string;
    intro: string;
    requestedStateTitle: string;
    result: Readonly<{
      gravitationalParameter: string;
      modelVersion: string;
      schwarzschildRadius: string;
      selectedObserverRadius: string;
      title: string;
    }>;
    stateLabels: Readonly<{
      mass: string;
      massUnit: string;
      staticObserverRadius: string;
    }>;
    tableCaption: string;
    tableHeaders: Readonly<{
      landmark: string;
      meaning: string;
      radiusM: string;
      radiusRs: string;
    }>;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  result: Readonly<{
    clock: Readonly<{
      farAwayInterval: string;
      frequencyRatio: string;
      redshift: string;
      selectedRadius: string;
      title: string;
    }>;
    description: string;
    metrics: Readonly<{
      clockRate: string;
      eventHorizonRadius: string;
      gravitationalParameter: string;
      redshift: string;
    }>;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
}>;

export type RelativityVisualizationsMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    fields: Readonly<{
      properLength: string;
      properTime: string;
      relativeSpeed: string;
      separation: string;
    }>;
    fieldAriaLabels: Readonly<{
      properLength: string;
      properTime: string;
      relativeSpeed: string;
      separation: string;
    }>;
    title: string;
  }>;
  failures: Readonly<{
    emptyInput: string;
    outOfDomain: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  gravity: Readonly<{
    description: string;
    link: string;
    noScriptLink: string;
    noScriptSuffix: string;
    noScriptTitle: string;
    title: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  lightCone: Readonly<{
    ariaLabel: string;
    caption: string;
    noScriptCoordinateConvention: string;
    noScriptTitle: string;
    sectionDescription: string;
    sectionTitle: string;
    svgTitle: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    equations: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    eyebrow: string;
    intro: string;
    requestedStateTitle: string;
    result: Readonly<{
      dilatedInterval: string;
      lengthTitle: string;
      lorentzFactor: string;
      modelVersion: string;
      movingLength: string;
      relativeSpeed: string;
      simultaneityOffset: string;
      simultaneityTitle: string;
      timeTitle: string;
      title: string;
    }>;
    stateLabels: Readonly<{
      properLength: string;
      properTime: string;
      relativeSpeed: string;
      separation: string;
    }>;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  result: Readonly<{
    description: string;
    lengthTitle: string;
    lorentzFactor: string;
    relativeSpeed: string;
    simultaneityTitle: string;
    timeTitle: string;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
}>;

export type StellarLaboratoryMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    fieldLabel: string;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    equations: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    eyebrow: string;
    intro: string;
    requestedMassTitle: string;
    resultCaption: string;
    resultLabels: Readonly<{
      approximateLifetime: string;
      expectedRemnant: string;
      initialMass: string;
      nearestColourAnchor: string;
      typicalLuminosity: string;
      typicalRadius: string;
      typicalTemperature: string;
      yearsUnit: string;
    }>;
    resultTitle: string;
    modelVersion: string;
    lifecycleTitle: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  result: Readonly<{
    description: string;
    labels: Readonly<{
      approximateLifetime: string;
      colourAnchorMass: string;
      expectedRemnant: string;
      initialMass: string;
      nearestColourAnchor: string;
      typicalLuminosity: string;
      typicalRadius: string;
      typicalTemperature: string;
    }>;
    lifecycleDescription: string;
    lifecycleTitle: string;
    sourceTableAnchor: string;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
    yearsUnit: string;
  }>;
}>;

export type SpectroscopyLabMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    fields: Readonly<{
      displayNoise: string;
      mode: string;
      noiseSeed: string;
      radialVelocity: string;
      representativeSpecies: string;
      resolvingPower: string;
      temperature: string;
    }>;
    fieldAriaLabels: Readonly<{
      displayNoise: string;
      noiseSeed: string;
      radialVelocity: string;
      resolvingPower: string;
      temperature: string;
    }>;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    outOfDomain: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  figure: Readonly<{
    caption: string;
    normalizedFlux: string;
    plotAriaLabel: string;
    scrollAriaLabel: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  modes: Readonly<{
    absorption: string;
    continuum: string;
    doppler: string;
    elementMatch: string;
    emission: string;
  }>;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    displayNoiseTemplate: string;
    eyebrow: string;
    intro: string;
    lineCaption: string;
    requestedModelTitle: string;
    stateLabels: Readonly<{
      displayNoise: string;
      mode: string;
      radialVelocity: string;
      resolvingPower: string;
      selectedSpecies: string;
      temperature: string;
    }>;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  none: string;
  result: Readonly<{
    description: string;
    labels: Readonly<{
      dopplerFactor: string;
      mode: string;
      radialVelocity: string;
      resolvingPower: string;
      returnedSamples: string;
      selectedSpecies: string;
      temperature: string;
      wienPeak: string;
    }>;
    lines: Readonly<{
      caption: string;
      empty: string;
      headers: Readonly<{
        feature: string;
        fwhm: string;
        rest: string;
        shifted: string;
        species: string;
      }>;
      scrollAriaLabel: string;
    }>;
    modelVersion: string;
    noScriptReturnedSamples: string;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
    wienPeak: string;
  }>;
}>;

export type ImpactSimulatorMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    fields: Readonly<{
      angle: string;
      density: string;
      diameter: string;
      speed: string;
      target: string;
    }>;
    fieldAriaLabels: Readonly<{
      angle: string;
      density: string;
      diameter: string;
      speed: string;
      target: string;
    }>;
    title: string;
  }>;
  ejecta: Readonly<{
    description: string;
    table: Readonly<{
      caption: string;
      headers: Readonly<{
        radius: string;
        thickness: string;
      }>;
      scrollAriaLabel: string;
    }>;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    outOfDomain: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  figure: Readonly<{
    ariaLabel: string;
    caption: string;
    depositRadius: string;
    finalCraterRadius: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    equations: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    angleUnit: string;
    ejectaCaption: string;
    ejectaTitle: string;
    eyebrow: string;
    intro: string;
    requestedTitle: string;
    result: Readonly<{
      bestFinalCrater: string;
      bestTransientCrater: string;
      impactorMass: string;
      kineticEnergy: string;
      modelVersion: string;
      title: string;
      tntContext: string;
      tntDescription: string;
    }>;
    sensitivityCaption: string;
    sensitivityTitle: string;
    stateLabels: Readonly<{
      angle: string;
      density: string;
      diameter: string;
      speed: string;
      target: string;
    }>;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  result: Readonly<{
    description: string;
    labels: Readonly<{
      bestFinalCrater: string;
      impactorMass: string;
      kineticEnergy: string;
      tntContext: string;
    }>;
    title: string;
    tntDescription: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  sensitivity: Readonly<{
    caption: string;
    headers: Readonly<{
      classification: string;
      finalDiameter: string;
      scalingCoefficient: string;
      transientDiameter: string;
    }>;
    scrollAriaLabel: string;
    title: string;
  }>;
  targets: Readonly<{
    crystallineRock: string;
    sedimentaryRock: string;
  }>;
}>;

export type EclipseSimulatorMessages = Readonly<{
  actions: Readonly<{
    calculate: string;
    calculating: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    fields: Readonly<{
      elevation: string;
      latitude: string;
      longitude: string;
      utc: string;
    }>;
    fieldAriaLabels: Readonly<{
      elevation: string;
      latitude: string;
      longitude: string;
      utc: string;
    }>;
    title: string;
  }>;
  event: Readonly<{
    centralBegin: string;
    centralEnd: string;
    maximum: string;
    noEvent: string;
    partialBegin: string;
    partialEnd: string;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  figure: Readonly<{
    caption: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  horizon: Readonly<{
    above: string;
    below: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentState: string;
    limitations: string;
    monthlyQuestion: string;
    reviewedSources: string;
    sourceUnavailable: string;
  }>;
  noScript: Readonly<{
    eventLabels: Readonly<{
      centralBegin: string;
      centralEnd: string;
      maximum: string;
      partialBegin: string;
      partialEnd: string;
    }>;
    eventTitle: string;
    eyebrow: string;
    intro: string;
    modelLimitations: string;
    modelVersion: string;
    monthlyQuestion: string;
    noEvent: string;
    observerLocation: string;
    observerTitle: string;
    resultCaption: string;
    resultLabels: Readonly<{
      centerSeparation: string;
      moonRadius: string;
      obscuration: string;
      phase: string;
      shadow: string;
      sunAltitude: string;
      sunRadius: string;
    }>;
    resultTitle: string;
    unavailableDescription: string;
    unavailableTitle: string;
    utcInstant: string;
  }>;
  result: Readonly<{
    description: string;
    labels: Readonly<{
      centerSeparation: string;
      horizon: string;
      moonRadius: string;
      obscuration: string;
      phase: string;
      shadow: string;
      sunAltitude: string;
      sunRadius: string;
    }>;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  safety: Readonly<{
    link: string;
    title: string;
  }>;
}>;

export type PlanetarySystemBuilderMessages = Readonly<{
  actions: Readonly<{
    addPlanet: string;
    calculate: string;
    calculating: string;
    remove: string;
    reset: string;
  }>;
  classifications: Readonly<{
    exteriorReferenceHz: string;
    insideReferenceHz: string;
    interiorReferenceHz: string;
    noPairwiseHillWarning: string;
    pairwiseCloseWarning: string;
  }>;
  controls: Readonly<{
    description: string;
    fields: Readonly<{
      effectiveTemperature: string;
      planetAxis: string;
      planetMass: string;
      stellarLuminosity: string;
      stellarMass: string;
    }>;
    fieldAriaLabels: Readonly<{
      effectiveTemperature: string;
      planetAxis: string;
      planetMass: string;
      removePlanet: string;
      stellarLuminosity: string;
      stellarMass: string;
    }>;
    orderedPlanetsDescription: string;
    orderedPlanetsLegend: string;
    planetLegend: string;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    outOfDomain: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  figure: Readonly<{
    ariaLabel: string;
    caption: string;
    displayExtent: string;
    hzLabel: string;
    scrollAriaLabel: string;
    starLabel: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentStateMany: string;
    currentStateOne: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    hzRange: string;
    intro: string;
    eyebrow: string;
    modelVersion: string;
    pairwiseCaption: string;
    pairwiseHeaders: Readonly<{
      assessment: string;
      interpretation: string;
      pair: string;
      separation: string;
    }>;
    planetLine: string;
    planetsCaption: string;
    requestedTitle: string;
    resultTitle: string;
    singlePlanet: string;
    stateLabels: Readonly<{
      effectiveTemperature: string;
      stellarLuminosity: string;
      stellarMass: string;
    }>;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  pairwise: Readonly<{
    caption: string;
    headers: Readonly<{
      assessment: string;
      mutualHillRadius: string;
      pair: string;
      referenceThreshold: string;
      separation: string;
    }>;
    interpretation: string;
    scrollAriaLabel: string;
    singlePlanet: string;
  }>;
  planets: Readonly<{
    caption: string;
    headers: Readonly<{
      axis: string;
      hzPlacement: string;
      mass: string;
      period: string;
      planet: string;
    }>;
    scrollAriaLabel: string;
  }>;
  result: Readonly<{
    description: string;
    furtherStabilityAnalysis: string;
    labels: Readonly<{
      hzInner: string;
      hzOuter: string;
      pairwiseDiagnostics: string;
      returnedPlanets: string;
    }>;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
}>;

export type RocketMissionDesignerMessages = Readonly<{
  actions: Readonly<{
    addStage: string;
    calculate: string;
    calculating: string;
    remove: string;
    reset: string;
  }>;
  controls: Readonly<{
    description: string;
    fields: Readonly<{
      gravityReference: string;
      payloadMass: string;
      reference: string;
      stageDryMass: string;
      stagePropellantMass: string;
      stageSpecificImpulse: string;
      stageThrust: string;
    }>;
    fieldAriaLabels: Readonly<{
      gravityReference: string;
      payloadMass: string;
      reference: string;
      removeStage: string;
      stageDryMass: string;
      stagePropellantMass: string;
      stageSpecificImpulse: string;
      stageThrust: string;
    }>;
    stagesDescription: string;
    stagesLegend: string;
    stageLegend: string;
    title: string;
  }>;
  failures: Readonly<{
    invalidInput: string;
    outOfDomain: string;
    rejected: string;
    resultMismatch: string;
    serviceUnavailable: string;
  }>;
  figure: Readonly<{
    ariaLabel: string;
    caption: string;
    payloadMultiplierAxis: string;
    scrollAriaLabel: string;
  }>;
  gravityBodies: Readonly<{
    earth: string;
    mars: string;
    moon: string;
  }>;
  header: Readonly<{
    eyebrow: string;
    intro: string;
    title: string;
  }>;
  invalidState: Readonly<{
    description: string;
    inline: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    assumptionsAndLimitations: string;
    currentStateMany: string;
    currentStateOne: string;
    description: string;
    limitations: string;
    reviewedSources: string;
    sourceUnavailable: string;
    title: string;
  }>;
  noScript: Readonly<{
    inputCaption: string;
    inputHeaders: Readonly<{
      dryMass: string;
      isp: string;
      propellant: string;
      stage: string;
      thrust: string;
    }>;
    intro: string;
    eyebrow: string;
    modelVersion: string;
    payloadCaption: string;
    payloadDescription: string;
    payloadTitle: string;
    referenceDifference: string;
    referenceTitle: string;
    requestedTitle: string;
    resultStageHeaders: Readonly<{
      burnoutMass: string;
      idealDeltaV: string;
      ignitionMass: string;
      stage: string;
      twr: string;
    }>;
    resultTitle: string;
    resultLabels: Readonly<{
      launchMass: string;
      payloadFraction: string;
      propellantFraction: string;
      selectedGravity: string;
      totalIdealDeltaV: string;
    }>;
    stageCaption: string;
    stateLabels: Readonly<{
      gravityBody: string;
      payload: string;
      reference: string;
    }>;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  payload: Readonly<{
    caption: string;
    description: string;
    headers: Readonly<{
      payload: string;
      multiplier: string;
      totalDeltaV: string;
    }>;
    scrollAriaLabel: string;
    title: string;
  }>;
  references: Readonly<{
    earthOrbit: string;
    earthEscape: string;
    marsEscape: string;
  }>;
  referenceResult: Readonly<{
    labels: Readonly<{
      difference: string;
      ratio: string;
      value: string;
    }>;
    title: string;
  }>;
  result: Readonly<{
    description: string;
    labels: Readonly<{
      launchMass: string;
      payloadFraction: string;
      propellantFraction: string;
      totalIdealDeltaV: string;
    }>;
    title: string;
    unavailableDescription: string;
    unavailableTitle: string;
  }>;
  stages: Readonly<{
    caption: string;
    headers: Readonly<{
      burnoutMass: string;
      dryMass: string;
      idealDeltaV: string;
      ignitionMass: string;
      massRatio: string;
      propellantMass: string;
      stage: string;
      twr: string;
    }>;
    scrollAriaLabel: string;
  }>;
}>;

export type ScaleExplorerMessages = Readonly<{
  actions: Readonly<{
    continueLearning: string;
    copyShareLink: string;
    nextNode: string;
    previousNode: string;
    reset: string;
  }>;
  categories: Readonly<{
    cosmological: string;
    galaxy: string;
    moon: string;
    planet: string;
    star: string;
  }>;
  comparisonEvidence: Readonly<{
    inputNodeIds: string;
    inputSourceRecords: string;
    rounding: string;
    summary: string;
    title: string;
  }>;
  controls: Readonly<{
    description: string;
    nodeSummary: string;
    sliderAriaValue: string;
    sliderLabel: string;
    title: string;
  }>;
  dataAlternative: Readonly<{
    description: string;
    title: string;
  }>;
  entityLinks: Readonly<{
    description: string;
    entityReference: string;
    sourceReference: string;
    title: string;
  }>;
  header: Readonly<{
    breadcrumbAriaLabel: string;
    eyebrow: string;
    intro: string;
    labBreadcrumb: string;
    title: string;
  }>;
  invalidMetadataDescription: string;
  invalidMetadataTitle: string;
  invalidState: Readonly<{
    description: string;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  model: Readonly<{
    assumptions: string;
    automatedValidationFixtures: string;
    characteristicSizeAlgorithm: string;
    characteristicSizeInputs: string;
    characteristicSizeTolerance: string;
    characteristicSizeValidDomain: string;
    comparisonAlgorithm: string;
    comparisonInputs: string;
    contentReview: string;
    contentReviewValue: string;
    derivedQuantityContracts: string;
    disclaimer: string;
    howScaleBuilt: string;
    input: string;
    inputValue: string;
    knownLimitations: string;
    mathsToNotice: string;
    modelVersion: string;
    output: string;
    references: string;
    relationshipsUsed: string;
    shareStateShape: string;
    shareStateSuffix: string;
    title: string;
    validDomain: string;
    validRange: string;
    validRangeValue: string;
    numericalTolerance: string;
  }>;
  noScript: Readonly<{
    dataDescription: string;
    dataTitle: string;
    invalidDescription: string;
    intro: string;
    model: Readonly<{
      assumptions: string;
      knownLimitations: string;
      model: string;
      references: string;
      relationships: string;
      title: string;
    }>;
    selectedSuffix: string;
    selectedSummary: string;
    sourceSummary: string;
    tableCaption: string;
    tableHeaders: Readonly<{
      characteristicSize: string;
      comparison: string;
      evidence: string;
      node: string;
      sourceStatus: string;
      transition: string;
    }>;
    tableSourceEvidence: string;
    tableStatus: string;
  }>;
  objective: Readonly<{
    thinkAbout: string;
    title: string;
  }>;
  quantities: Readonly<{
    diameter: string;
    observableExtent: string;
    width: string;
  }>;
  result: Readonly<{
    calculatedComparison: string;
    characteristicEvidence: string;
    comparison: string;
    displayPosition: string;
    displayPositionValue: string;
    readingTitle: string;
    referenceFallback: string;
    selectedNode: string;
    sourceValue: string;
    transitionEvidence: string;
    valueStatus: string;
    category: string;
  }>;
  share: Readonly<{
    copied: string;
    description: string;
    label: string;
    ready: string;
    reset: string;
    title: string;
  }>;
  sourceQuantities: Readonly<{
    diameter: string;
    extent: string;
    radius: string;
    width: string;
  }>;
  sources: Readonly<{
    agency: string;
    citation: string;
    details: string;
    education: string;
    metadata: string;
    unavailable: string;
    unavailableReference: string;
    unavailableShort: string;
  }>;
  statuses: Readonly<{
    approximate: string;
    derivedApproximate: string;
    modelBased: string;
    reported: string;
  }>;
  table: Readonly<{
    caption: string;
    characteristicValue: string;
    headers: Readonly<{
      characteristicSize: string;
      comparison: string;
      evidence: string;
      node: string;
      sourceStatus: string;
    }>;
    onTrack: string;
    selected: string;
    transitionExplanation: string;
  }>;
  track: Readonly<{
    coordinate: string;
    description: string;
    largest: string;
    legendAriaLabel: string;
    markerSummary: string;
    otherMarker: string;
    selectedMarker: string;
    smallest: string;
    title: string;
  }>;
  transitionContract: Readonly<{
    algorithm: string;
    generated: string;
    inputNodeIds: string;
    inputSourceRecords: string;
    learnerFacingRounding: string;
    numericalTolerance: string;
    testReferences: string;
    title: string;
    units: string;
    unitsValue: string;
    validDomain: string;
  }>;
}>;

export type SimulationLabMessages = Readonly<{
  blackHoleRelativity: BlackHoleRelativityMessages;
  eclipseSimulator: EclipseSimulatorMessages;
  impactSimulator: ImpactSimulatorMessages;
  orbitSandbox: OrbitSandboxMessages;
  planetarySystemBuilder: PlanetarySystemBuilderMessages;
  radialVelocity: RadialVelocityMessages;
  relativityVisualizations: RelativityVisualizationsMessages;
  rocketMissionDesigner: RocketMissionDesignerMessages;
  scaleExplorer: ScaleExplorerMessages;
  spectroscopyLab: SpectroscopyLabMessages;
  stellarLaboratory: StellarLaboratoryMessages;
  transitMethod: TransitMethodMessages;
}>;

export type IdentifyMessages = Readonly<{
  captureChecks: Readonly<{
    actions: Readonly<{
      retry: string;
      run: string;
    }>;
    analyzing: string;
    boundedSample: string;
    description: string;
    endpointDisclosure: string;
    eyebrow: string;
    failures: Readonly<{
      decodeFailed: string;
      invalidPixels: string;
      noOpaquePixels: string;
      unknown: string;
    }>;
    histogram: Readonly<{
      ariaLabel: string;
      description: string;
      title: string;
    }>;
    metrics: Readonly<{
      diagnosticSample: string;
      diagnosticSampleValue: string;
      maximumCode: string;
      minimumCode: string;
      sourceDimensions: string;
      sourceDimensionsValue: string;
    }>;
    nonOpaque: CountMessageTemplates;
    proxyCaveat: string;
    title: string;
  }>;
  header: Readonly<{
    localDescription: string;
    localEyebrow: string;
    remoteDescription: string;
    remoteEyebrow: string;
    title: string;
  }>;
  journalPanel: Readonly<{
    actions: Readonly<{
      openJournal: string;
      save: string;
      saving: string;
    }>;
    attachment: Readonly<{
      description: string;
      title: string;
    }>;
    description: string;
    entryIdLabel: string;
    eyebrow: string;
    failures: Readonly<{
      attachment: string;
      entryLimit: string;
      generic: string;
      invalidFields: string;
      rollbackFailed: string;
      storageUnavailable: string;
      writeRejected: string;
    }>;
    fields: Readonly<{
      camera: string;
      conditions: string;
      latitude: string;
      location: string;
      locationPlaceholder: string;
      longitude: string;
      notes: string;
      observationTime: string;
      observationTimeHelp: string;
      telescope: string;
      title: string;
      titlePlaceholder: string;
    }>;
    savedStatus: string;
    snapshotDisclosure: string;
    title: string;
    validation: Readonly<{
      coordinatePairRequired: string;
      coordinatesInvalid: string;
      locationLabelRequired: string;
      solvedTimestampUnavailable: string;
      timeInvalid: string;
      titleRequired: string;
    }>;
  }>;
  metadata: Readonly<{
    description: string;
    title: string;
  }>;
  privacy: Readonly<{
    local: Readonly<{
      deletion: string;
      fakeSolver: string;
      noRemote: string;
      title: string;
    }>;
    remote: Readonly<{
      deletion: string;
      privateMode: string;
      sentToProvider: string;
      title: string;
      unsolved: string;
    }>;
    retentionLocal: string;
    retentionRemote: string;
  }>;
  solutionOverlay: Readonly<{
    annotations: Readonly<{
      allLoaded: string;
      categoriesLegend: string;
      empty: string;
      loadMore: string;
      loadedCount: string;
      loadingMore: string;
      warning: string;
      visibleCount: string;
    }>;
    comparison: Readonly<{
      annotated: string;
      legend: string;
      original: string;
      originalDescription: string;
      scrollRegionLabel: string;
      solvedImageLabel: string;
      visibleAnnotations: CountMessageTemplates;
      zoomHelp: string;
      zoomLabel: string;
    }>;
    description: string;
    eyebrow: string;
    metrics: Readonly<{
      centerDec: string;
      centerRa: string;
      coordinateFrame: string;
      fieldRadius: string;
      orientation: string;
      parity: string;
      pixelScale: string;
      pixelScaleValue: string;
      solutionTimestamp: string;
      solvedImage: string;
      solvedImageValue: string;
    }>;
    provenance: Readonly<{
      annotationDescription: string;
      fingerprintLabel: string;
      solverDescription: string;
      solverLabel: string;
      title: string;
    }>;
    table: Readonly<{
      caption: string;
      category: string;
      dec: string;
      label: string;
      pixelX: string;
      pixelY: string;
      ra: string;
    }>;
    title: string;
  }>;
  surveyComparison: Readonly<{
    action: string;
    creditLabel: string;
    description: string;
    eyebrow: string;
    fieldDescription: string;
    fieldDescriptionClamped: string;
    figures: Readonly<{
      localAlt: string;
      localCaption: string;
      surveyCaption: string;
      surveyRegionLabel: string;
    }>;
    layerLabel: string;
    privacy: string;
    sourceDetails: string;
    states: Readonly<{
      checking: string;
      comparisonReady: string;
      contextLost: string;
      contextRestored: string;
      layerApplyFailed: string;
      layerUnavailable: string;
      loading: string;
      rendererFailed: string;
      showingLayer: string;
    }>;
    title: string;
  }>;
  status: Readonly<{
    deleted: Readonly<{
      description: string;
      title: string;
    }>;
    deletion: Readonly<{
      confirmDelete: string;
      confirmGroupLabel: string;
      deleteUpload: string;
      keepSubmission: string;
      localDescription: string;
      remoteDescription: string;
    }>;
    errorTitle: string;
    eyebrow: string;
    heading: string;
    initialLocal: string;
    initialRemote: string;
    jobIdLabel: string;
    labels: Readonly<{
      progressLabel: string;
      fakeSucceeded: string;
      remoteSucceeded: string;
      stateCreated: string;
      stateDeadLetter: string;
      stateDeleted: string;
      stateExpired: string;
      stateFailed: string;
      stateFetchingResults: string;
      stateQueued: string;
      stateRemoteRunning: string;
      stateRunningFake: string;
      stateSubmittingRemote: string;
      stateUnsolved: string;
      stateWaitingRemote: string;
      statusLabel: string;
    }>;
    pollingWarning: string;
    providerIdentifiersPrivate: string;
    remoteConditions: Readonly<{
      busyFailed: string;
      busyRetry: string;
      unavailable: string;
    }>;
    results: Readonly<{
      expired: string;
      fakeFailure: string;
      fakeSuccessDescription: string;
      fakeSuccessTitle: string;
      remoteFailure: string;
      remoteSuccessDescription: string;
      remoteSuccessTitle: string;
      unsolved: string;
    }>;
    solution: Readonly<{
      loadingDescription: string;
      loadingTitle: string;
      unavailableDescription: string;
      unavailableTitle: string;
    }>;
    uploading: Readonly<{
      localDescription: string;
      localTitle: string;
      remoteDescription: string;
      remoteTitle: string;
    }>;
  }>;
  unavailable: Readonly<{
    description: string;
    eyebrow: string;
    heading: string;
    reasons: Readonly<{
      apiOrigin: string;
      policy: string;
    }>;
    title: string;
  }>;
  upload: Readonly<{
    actions: Readonly<{
      startLocal: string;
      startRemote: string;
      uploadingLocal: string;
      uploadingRemote: string;
    }>;
    bound: string;
    consentLocal: string;
    consentRemote: string;
    description: string;
    errors: Readonly<{
      consentRequired: string;
      fileRequired: string;
      serverMediaOnly: string;
      sizeLimit: string;
      timeout: string;
      unavailable: string;
      unsupportedMedia: string;
      validationFailed: string;
    }>;
    fileLabel: string;
    heading: string;
    noScript: string;
  }>;
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

export type NearEarthMessages = Readonly<{
  eyebrow: string;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  prediction: Readonly<{
    classification: string;
    title: string;
    uncertainty: string;
    updates: string;
  }>;
  snapshot: Readonly<{
    freshDescription: string;
    freshTitle: string;
    staleDescription: string;
    staleTitle: string;
  }>;
  source: Readonly<{
    officialDocumentation: string;
    title: string;
  }>;
  table: Readonly<{
    absoluteMagnitude: string;
    approachTime: string;
    caption: string;
    classification: string;
    diameterRange: string;
    hazardousLabel: string;
    heading: string;
    nominalLunarDistance: string;
    nominalMissDistance: string;
    object: string;
    objectReference: string;
    relativeVelocity: string;
    yes: string;
    no: string;
    context: string;
  }>;
  title: string;
  unavailable: Readonly<{
    cachedContentExpired: string;
    generic: string;
    noCachedContent: string;
    providerDisabled: string;
    returnToSpaceNow: string;
    title: string;
  }>;
  window: Readonly<{
    capped: string;
    empty: string;
    listed: CountMessageTemplates;
    range: string;
    title: string;
  }>;
}>;

export type SatelliteMessages = Readonly<{
  backToSpaceNow: string;
  eyebrow: string;
  intro: string;
  metadataDescription: string;
  metadataTitle: string;
  passFinder: Readonly<{
    actions: Readonly<{
      calculate: string;
      calculating: string;
      useLocation: string;
    }>;
    errors: Readonly<{
      finiteValues: string;
      geolocationUnavailable: string;
      locationPermission: string;
      noLongerAvailable: string;
      requestInvalid: string;
      responseInvalid: string;
      temporarilyUnavailable: string;
      unknown: string;
    }>;
    fields: Readonly<{
      elevation: string;
      latitude: string;
      longitude: string;
      satellite: string;
    }>;
    heading: string;
    idle: string;
    loading: string;
    option: string;
    privacy: string;
    result: Readonly<{
      algorithmSummary: string;
      heading: string;
      illumination: string;
      limitation: string;
      no: string;
      noPasses: string;
      passPeakAfterTime: string;
      passPeakLabel: string;
      passRiseSet: string;
      reasonLabel: string;
      refusedTitle: string;
      refusalCatalogUnsupported: string;
      refusalElementAge: string;
      refusalEventSequence: string;
      refusalFallback: string;
      refusalSgp4State: string;
      skyAstronomicalTwilight: string;
      skyCivilTwilight: string;
      skyDaylight: string;
      skyNauticalTwilight: string;
      skyNight: string;
      skyUnknown: string;
      staleWarning: string;
      yes: string;
    }>;
  }>;
  satellites: Readonly<{
    count: string;
    elementAgeValue: string;
    heading: string;
    labels: Readonly<{
      elementAge: string;
      elementEpoch: string;
      groups: string;
      passRuntime: string;
    }>;
    noradReference: string;
    runtimeNotSupported: string;
    runtimeSupported: string;
    staleWarning: string;
  }>;
  snapshot: Readonly<{
    freshTitle: string;
    lastFailure: string;
    latestEpochNotRecorded: string;
    summary: string;
    staleTitle: string;
    unrecordedTime: string;
  }>;
  source: Readonly<{
    documentation: string;
    limitations: string;
    title: string;
    usagePolicy: string;
  }>;
  title: string;
  transport: Readonly<{
    description: string;
    title: string;
  }>;
  unavailable: Readonly<{
    cachedContentExpired: string;
    noBrowserProviderRequest: string;
    noCachedContent: string;
    providerDisabled: string;
    title: string;
  }>;
}>;

export type SpaceWeatherMessages = Readonly<{
  aurora: Readonly<{
    title: string;
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
    freshUntilLabel: string;
    lastFailureLabel: string;
    noneRecorded: string;
    notRecorded: string;
    retrievedAtLabel: string;
    staleUntilLabel: string;
    title: string;
  }>;
  impacts: Readonly<{
    description: string;
    familyHeading: string;
    title: string;
  }>;
  intro: string;
  kp: Readonly<{
    description: string;
    forecast: Readonly<{
      caption: string;
      empty: string;
      heading: string;
      headers: Readonly<{
        kp: string;
        scale: string;
        statusColumn: string;
        time: string;
      }>;
      statuses: Readonly<{
        estimated: string;
        observed: string;
        predicted: string;
      }>;
    }>;
    labels: Readonly<{
      kp: string;
      latestEstimated: string;
      latestObserved: string;
      productTime: string;
      providerStatus: string;
      scaleField: string;
    }>;
    notReported: string;
    notReportedInSnapshot: string;
    statuses: Readonly<{
      estimated: string;
      observed: string;
      predicted: string;
    }>;
    title: string;
  }>;
  metadataDescription: string;
  metadataTitle: string;
  notifications: Readonly<{
    description: string;
    empty: string;
    issueTime: string;
    title: string;
  }>;
  scales: Readonly<{
    description: string;
    families: Readonly<{
      geomagnetic: string;
      radioBlackout: string;
      solarRadiation: string;
    }>;
    familyContext: string;
    noSourceDescription: string;
    sourceTime: string;
    title: string;
    unavailable: string;
  }>;
  snapshot: Readonly<{
    description: string;
    freshTitle: string;
    staleTitle: string;
  }>;
  solarWind: Readonly<{
    description: string;
    labels: Readonly<{
      bt: string;
      bz: string;
      protonSpeed: string;
    }>;
    notRecorded: string;
    notReported: string;
    sourceObservationTime: string;
    title: string;
    unavailable: string;
  }>;
  source: Readonly<{
    documentation: string;
    limitations: string;
    returnToSpaceNow: string;
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
  nearEarth: NearEarthMessages;
  satellites: SatelliteMessages;
  spaceWeather: SpaceWeatherMessages;
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
  identify: IdentifyMessages;
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
  simulationLabs: SimulationLabMessages;
  spaceNow: SpaceNowMessages;
  status: StatusMessages;
  tonight: TonightMessages;
}>;
