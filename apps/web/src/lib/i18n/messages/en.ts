import type { LuminaMessages } from "./types";

export const enMessages = {
  catalogueSearch: {
    clearAction: "Clear search",
    inputLabel: "Search the catalogue",
    placeholder: 'Try "Kepler" or "HD 209458"',
    suggestionsAvailable: {
      one: "{count} suggestion available",
      other: "{count} suggestions available",
    },
  },
  collections: {
    addObject: {
      inputLabel: "Find an object to save in this collection",
      placeholder: "e.g. K2-18",
      savedAnnouncement: "Saved {objectName} to the collection.",
      suggestionsAvailable: {
        one: "{count} suggestion available",
        other: "{count} suggestions available",
      },
    },
    detail: {
      addDescription: "Search the reviewed catalogue for something to save here.",
      addHeading: "Add object",
      backToCollections: "← Collections",
      cancelAction: "Cancel",
      compareDescription: "Choose 2–3 to compare — maximum {max}.",
      compareEmpty: "Save at least two objects to compare them side by side.",
      compareHeading: "Compare saved objects",
      compareMaximumReached: "Maximum of {max} reached — unselect one to choose another.",
      compareSelected: "⇄ Compare selected",
      compareSelectedWithCount: "⇄ Compare selected ({count})",
      deleteAction: "Delete",
      deleteCollectionAction: "Delete collection",
      deleteDescription:
        "This removes “{collectionName}” from this browser only. The Lumina catalogue itself is not affected.",
      deleteItemCount: {
        one: "Its {count} saved object will be removed with it.",
        other: "Its {count} saved objects will be removed with it.",
      },
      deleteTitle: "Delete {collectionName}?",
      emptyDescription: "Add objects above, or save them while exploring the catalogue.",
      emptyTitle: "No objects saved here yet",
      exploreCatalogue: "Explore catalogue",
      goToCollections: "Go to your collections",
      keepCollectionAction: "Keep collection",
      missingDescription:
        "Collections are stored per browser. There is nothing saved under this address here.",
      missingTitle: "This collection is not on this device",
      objectCount: {
        one: "{count} object",
        other: "{count} objects",
      },
      objectsListLabel: "Objects in {collectionName}",
      removeObjectLabel: "Remove {objectName} from the collection",
      renameAction: "Rename",
      renameDescription: "The collection keeps its saved objects.",
      renameTitle: "Rename collection",
      saveNameAction: "Save name",
      savedDescription: "Identities are snapshots; open any object for its current reviewed data.",
      savedHeading: "Saved objects",
      savedSummary: "{countText} · Saved in this browser on this device",
      selectObjectsLabel: "Select objects to compare",
    },
    failures: {
      collectionLimit: "You have reached the maximum of {max} collections.",
      collectionNotFound: "That collection no longer exists on this device.",
      duplicateName: "You already have a collection with this name.",
      invalidName: "Use a collection name from 1 to {max} characters.",
      invalidObject: "That object has an invalid catalogue identity and could not be saved.",
      itemLimit: "This collection has reached the maximum of {max} saved objects.",
      storageCorrupted:
        "Saved collections could not be read from this browser. Reset them from the Collections page to continue.",
      storageUnavailable:
        "Local storage is not available, so collections cannot be changed right now.",
      storageWriteFailed:
        "The browser refused the storage write. Nothing was changed; storage may be full or restricted.",
    },
    metadata: {
      detailDescription:
        "One of your object collections. Collections are stored locally in this browser on this device.",
      detailTitle: "Collection",
      overviewDescription:
        "Create and browse your own collections of catalogue objects. Saved locally in this browser — no account needed.",
      overviewTitle: "Collections",
    },
    overview: {
      browseObjects: "Browse objects",
      createAction: "+ Create a collection",
      createDialogDescription: "Collections live only in this browser on this device.",
      createDialogTitle: "Create a collection",
      createFirstAction: "Create your first collection",
      createSubmitAction: "Create collection",
      emptyDescription:
        "Create your first collection — then save objects to it while exploring or comparing.",
      emptyTitle: "No collections yet",
      exploreObjects: "Explore objects",
      eyebrow: "Your shelf",
      intro:
        "Keep the objects you investigate — from Explore or Compare — in small personal sets. Collections are saved in this browser on this device; they are not accounts and do not sync elsewhere. Clearing this site's browser data will remove them.",
      objectCount: {
        one: "{count} object",
        other: "{count} objects",
      },
      sectionLabel: "Your collections",
      title: "Collections",
    },
    save: {
      compare: {
        alreadySaved: "Already saved — every object was in the collection.",
        chooseCollection: "Choose a collection…",
        collectionLabel: "Collection",
        corrupted:
          "Your saved collections could not be read. Open Collections to reset them; nothing has been changed meanwhile.",
        description:
          "Objects are saved into one of your collections — stored only in this browser.",
        newCollectionNameLabel: "New collection name",
        newCollectionOption: "+ New collection…",
        objectCount: {
          one: "{count} object",
          other: "{count} objects",
        },
        saveAction: "Save",
        savedToCollection: "Saved {countText} to the collection.",
        savedToNamedCollection: "Saved {countText} to {collectionName}.",
        title: "Save {countText} to a collection",
        triggerAction: "Save compared objects",
        unavailable: "This browser is blocking local storage, so saving is unavailable right now.",
        willSave: "Will save: {objects}",
      },
      loading: "Checking your saved collections…",
      picker: {
        confirmResetAction: "Confirm reset — erase all local collections",
        confirmResetAriaLabel: "Confirm: reset all local collections",
        createAction: "Create",
        createdAnnouncement: "Created {collectionName} and saved {objectName}.",
        createdUnavailable: "The collection was created, but could not be opened for saving.",
        corruptedDescription:
          "Your saved collections could not be read from this browser's storage. Nothing has been changed or deleted — resetting replaces them with an empty slate. Browsing, search, and comparison remain available meanwhile.",
        description:
          "Collections are stored only in this browser on this device. Choose where to save {objectName}.",
        doneAction: "Done",
        empty: "No collections yet — name your first one below.",
        full: "Full",
        listLabel: "Your collections",
        newCollectionLabel: "New collection",
        removedAnnouncement: "Removed {objectName} from {collectionName}.",
        resetAction: "Reset local collections",
        resetAriaLabel: "Reset all local collections on this device",
        resetSuccess: "Local collections were cleared.",
        resetWarning:
          "Resetting erases every local collection on this device. Confirm to continue.",
        savedAnnouncement: "Saved {objectName} to {collectionName}.",
        savedCount: {
          one: "{count} saved",
          other: "{count} saved",
        },
        title: "Save to a collection",
        unavailable:
          "This browser is blocking local storage, so Lumina cannot save collections here right now. Browsing and comparing still work normally.",
      },
      trigger: {
        manageAriaLabel: "Saved. Manage where {objectName} is saved",
        saveAction: "Save",
        saveAriaLabel: "Save {objectName} to a collection",
        savedAction: "Saved",
      },
    },
    shared: {
      corrupted: {
        confirmResetAction: "Confirm reset — erase all local collections",
        description:
          "The data stored for collections in this browser could not be understood. Nothing has been changed or deleted. You can keep browsing, searching, and comparing normally, or reset collections below to start fresh.",
        resetAction: "Reset local collections",
        resetSuccess: "Local collections were cleared.",
        resetWarning:
          "Resetting erases every saved collection on this device. Confirm to continue.",
        title: "Your saved collections could not be read",
      },
      loading: "Checking your saved collections…",
      storageUnavailable: {
        pageDescription:
          "This browser is blocking site storage, so Lumina cannot save or show collections right now. Browsing, search, object pages, and comparison all keep working normally.",
        pickerDescription:
          "This browser is blocking site storage, so Lumina cannot save or show collections right now. Nothing was changed. Browsing, search, object pages, and comparison all keep working normally.",
        title: "Local storage is unavailable",
      },
    },
    validation: {
      blankName: "Give the collection a name.",
      defaultHint: "Up to {max} characters. You can rename it later.",
      duplicateName: "You already have a collection with this name.",
      nameLabel: "Name",
      placeholder: "e.g. Interesting Worlds",
      renameHint: "Up to {max} characters.",
      tooLongName: "Keep the name within {max} characters.",
    },
  },
  coordinateDisclosure: {
    gaiaDr3:
      "Gaia DR3 catalogue position at reference epoch {referenceEpoch}. Proper motion is not propagated.",
    messierJ2000:
      "SIMBAD Messier J2000 catalogue position at reference epoch {referenceEpoch}. No epoch propagation is applied.",
    messierResolverJ2000:
      "SIMBAD Messier ICRS J2000 resolver-record catalogue anchor at reference epoch {referenceEpoch}. It is not asserted to be a geometric target centre; no epoch propagation is applied.",
    reviewed:
      "Reviewed catalogue position at reference epoch {referenceEpoch}. No epoch propagation is applied.",
    reviewedWithoutEpoch: "Reviewed catalogue position. No epoch propagation is applied.",
  },
  deepSky: {
    atlas: {
      activation: {
        checking: "Checking survey…",
        missingTarget:
          "Select a deep-sky object with one accepted coordinate before focusing the atlas.",
        open: "Open interactive atlas",
        opening: "Opening atlas…",
        readyForTarget: "Ready to open the atlas around {objectName}.",
      },
      canvasAriaLabel: "Interactive sky atlas canvas",
      header: {
        eyebrow: "Optional interactive renderer",
        intro:
          "The catalogue above is Lumina's canonical science. Opening this supplemental atlas loads the WorldWide Telescope engine and imagery from the credited survey hosts. No external WWT or imagery request is made before you activate it.",
        title: "WorldWide Telescope atlas",
      },
      observer: {
        apply: "Apply observer context",
        elevationLabel: "Elevation m",
        latitudeLabel: "Latitude °",
        legend: "Observer context — optional",
        localHorizon: "Show local-horizon context",
        longitudeLabel: "Longitude °",
        privacy:
          "Coordinates remain only in this component's memory. They are not placed in the URL, stored, logged, sent to Lumina APIs, or sent to imagery providers.",
        useLocation: "Use my location",
      },
      rendererDisclosure:
        "Renderer: WorldWide Telescope web engine {engineVersion} / helpers {helpersVersion}, MIT licensed. Survey images are separate datasets with the per-layer credits shown above. Survey composites and false-colour maps are display representations; changing wavelength does not change the physical object.",
      status: {
        activationFailed:
          "The interactive atlas could not start. The catalogue, coordinates, sources, and survey information below remain available.",
        checkingSurvey: "Checking {layerLabel} imagery availability from its reviewed survey host…",
        contextLost:
          "The graphics context was lost. Rendering is paused; the non-canvas catalogue content remains available.",
        currentTimeApplied: "Viewing context synchronized to the system clock.",
        currentTimeFailed: "The atlas could not synchronize to the current time.",
        focusFailed: "The atlas could not focus that reviewed coordinate.",
        focused: "Focused on {objectName}.",
        geolocationDenied: "Location permission was unavailable or declined.",
        geolocationUnavailable: "Geolocation is not available in this browser.",
        graphicsRestored: "Graphics context restored.",
        horizonDisabled: "Equatorial sky context restored.",
        horizonEnabled: "Local-horizon observer context enabled.",
        horizonFailed: "The atlas could not change horizon context.",
        initialLayerUnavailable:
          "{layerLabel} imagery is unavailable right now. Lumina did not start the interactive renderer; the canonical catalogue and source information remain available.",
        invalidLayer: "That survey layer is not part of the reviewed inventory.",
        layerChanged: "Survey layer changed to {layerLabel}.",
        layerDisplayFailed: "That survey layer could not be displayed.",
        loading: "Loading the opt-in WWT renderer and reviewed survey inventory…",
        locationCopied:
          "Location copied into the local fields. Press Apply observer context to use it.",
        observerApplied:
          "Observer context applied in this browser tab only. Coordinates were not saved.",
        observerFailed: "The atlas could not apply that observer context.",
        observerInvalid: "Enter valid finite latitude, longitude, and elevation.",
        panFailed: "The atlas could not move the view.",
        ready: "Interactive atlas ready.",
        switchLayerUnavailable:
          "{layerLabel} imagery is unavailable right now. The current atlas layer remains active.",
        utcApplied: "Viewing context set to {instant}.",
        utcApplyFailed: "The atlas could not apply that UTC instant.",
        utcInvalid: "Enter an ISO 8601 UTC instant such as 2026-09-15T18:30:00Z.",
        zoomFailed: "The atlas could not change the field of view.",
      },
      survey: {
        creditLabel: "Credit",
        legend: "Survey layer",
        sourceDetails: "Source details",
        wavelengthLabel: "Wavelength context",
      },
      time: {
        apply: "Apply UTC time",
        help: "Time changes viewing context only. It does not change Lumina's canonical catalogue coordinates.",
        inputLabel: "ISO 8601 UTC instant",
        legend: "UTC viewing context",
        useCurrent: "Use current time",
      },
      view: {
        focus: "Focus selected object",
        legend: "View controls",
        panAriaLabel: "Pan atlas",
        panDown: "Pan down",
        panLeft: "Pan left",
        panRight: "Pan right",
        panUp: "Pan up",
        zoomIn: "Zoom in",
        zoomOut: "Zoom out",
      },
    },
    browse: {
      ariaLabel: "Deep-sky objects",
      boundedSlice:
        "Bounded atlas slice: additional {types} are available through the main catalogue.",
      empty: "No reviewed deep-sky objects are currently published.",
      summary: "Galaxies · nebulae · clusters",
      title: "Reviewed deep-sky catalogue",
      unavailableDescription:
        "Lumina could not load any of the bounded galaxy, nebula, or cluster slices. No substitute objects are shown.",
      unavailableTitle: "Deep-sky catalogue temporarily unavailable",
      unavailableTypes:
        "Partial catalogue: {types} could not be loaded, while the available types remain usable.",
    },
    header: {
      backToExplore: "← Explore catalogue",
      eyebrow: "Advanced atlas · Phase 5A",
      intro:
        "Browse reviewed galaxies, nebulae, and clusters from Lumina's catalogue. The optional WorldWide Telescope view is a renderer only: object identity, coordinates, epoch, and provenance continue to come from Lumina's reviewed data.",
      title: "Deep-sky atlas",
    },
    invalidLayer:
      "The requested survey layer is not part of Lumina's reviewed atlas inventory. Visible DSS2 is shown instead.",
    layers: {
      description:
        "These links are safe shareable atlas state. They contain only a closed layer identifier and, when selected, the catalogue object slug — never observer coordinates or viewing time.",
      title: "Reviewed survey layers",
    },
    metadataDescription:
      "Browse Lumina's reviewed galaxies, nebulae, and clusters, then optionally view them with credited WorldWide Telescope survey imagery.",
    metadataTitle: "Deep-sky atlas",
    selection: {
      coordinateAmbiguousDescription:
        "The atlas will not choose between scientifically distinct coordinate sources automatically. Use the observation planner for the detailed source choice.",
      coordinateAmbiguousTitle: "{objectName} has multiple accepted coordinate pairs",
      coordinateSourceLabel: "Coordinate source",
      coordinateUnavailableDescription:
        "The canonical object remains valid, but Lumina does not currently have one complete reviewed coordinate pair that this renderer may use.",
      coordinateUnavailableTitle: "{objectName} has no accepted atlas coordinate",
      datasetLabel: "Dataset",
      declinationLabel: "Declination",
      invalidDescription: "Choose a galaxy, nebula, or cluster from the reviewed list above.",
      invalidTitle: "That atlas object is not valid",
      openObject: "Open canonical object page",
      openPlanner: "Open observation planner",
      referenceEpochLabel: "Reference epoch",
      rightAscensionLabel: "Right ascension",
      selectedEyebrow: "Selected catalogue object",
      selectDescription:
        "Choose a reviewed deep-sky object above to expose its accepted catalogue coordinates and provenance before using the optional atlas renderer.",
      selectTitle: "Select an object",
      sourceRecordLabel: "source record",
      unavailableDescription:
        "Lumina could not reload the selected catalogue object, so the atlas will not invent coordinates.",
      unavailableTitle: "Selected object unavailable",
    },
  },
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
  compare: {
    add: {
      fullPlaceholder: "Comparison is full — remove an object to add another",
      inputLabel: "Add an object to compare",
      maximumStatus: "The comparison is at the maximum of three objects.",
      placeholder: "e.g. K2-18",
      suggestionsAvailable: {
        one: "{count} suggestion available",
        other: "{count} suggestions available",
      },
    },
    cells: {
      measurementDetails: {
        one: "source: {sourceLabel}",
        multiple:
          "{count} measurements recorded — canonical selection shown · source: {sourceLabel}",
      },
      original: "original: {originalValue} {originalUnit}",
      unavailable: "Not available",
      unknown: "No catalogue object",
      unmeasured: "Tracked, no canonical selection yet",
    },
    comparison: {
      emptyDescription:
        "None of the selected slots could be loaded from the catalogue right now. The selection stays in the address bar, so you can retry in a moment or remove the slots above.",
      emptySummary: "Nothing to compare yet.",
      heading: "Scientific comparison",
      identityAriaLabel: "Identity comparison",
      identityHeading: "Identity",
      identitySummary: "Canonical identities from the reviewed catalogue.",
      quantityHeading: "Quantity",
      quantityListAriaLabel: "Quantity comparisons",
      scienceSummary:
        "Values keep their exact units and sources; competing measurements stay visible through the recorded count. Nothing here is scored or ranked.",
      tableCaption: "Side-by-side comparison of measured quantities; every value shows its source.",
    },
    empty: {
      addHeading: "Add an object",
      description:
        "Add two or three objects to see their reviewed measurements side by side, each with its own source. Lumina compares published values honestly — it never scores or ranks them.",
      title: "Nothing selected yet",
    },
    footerBackToExplore: "← Back to Explore",
    header: {
      eyebrow: "The catalogue",
      intro:
        "Put up to three catalogue objects side by side. Every value keeps its exact units and its source — Lumina compares published measurements honestly and never scores them.",
      title: "Compare",
    },
    metadata: {
      description:
        "Compare reviewed astronomical measurements side by side, with every value's source attached.",
      genericTitle: "Compare catalogue objects",
      threeObjectTitle: "{first} vs {second} vs {third}",
      twoObjectTitle: "{first} vs {second}",
    },
    removeAction: "Remove {displayName} from the comparison",
    selection: {
      ariaLabel: "Selected compare objects",
      full: "Comparison full — {count} objects maximum. Remove one to add another.",
      heading: "Selected objects",
      partial: "Add one more object to start the side-by-side comparison.",
    },
    slots: {
      unavailableDescription: "The catalogue service could not be reached for this object.",
      unavailableTitle: "Unavailable right now",
      unknownDescription: "“{slug}” is not in the catalogue",
      unknownTitle: "Unknown object",
    },
  },
  entityTypes: {
    asteroid: "Asteroid",
    black_hole: "Black hole",
    cluster: "Cluster",
    comet: "Comet",
    compact_object: "Compact object",
    concept: "Concept",
    constellation: "Constellation",
    dwarf_planet: "Dwarf planet",
    event: "Event",
    exoplanet: "Exoplanet",
    galaxy: "Galaxy",
    launch_vehicle: "Launch vehicle",
    mission: "Mission",
    moon: "Moon",
    nebula: "Nebula",
    observatory: "Observatory",
    person: "Person",
    planet: "Planet",
    sky_region: "Sky region",
    spacecraft: "Spacecraft",
    star: "Star",
    system: "System",
  },
  explore: {
    browse: {
      emptyDescription:
        "No reviewed objects are published yet. Lumina adds objects deliberately, with full provenance, rather than importing catalogues wholesale.",
      emptyTitle: "The catalogue is being curated",
      heading: "In the catalogue now",
      nextPage: "Next page",
      objectsAriaLabel: "Catalogue objects",
      paginationAriaLabel: "Catalogue pagination",
      showingFirst: {
        one: "Showing the first {count} object.",
        other: "Showing the first {count} objects.",
      },
      showingNext: {
        one: "Showing the next {count} object.",
        other: "Showing the next {count} objects.",
      },
      summary: "Reviewed objects only — the catalogue grows deliberately.",
    },
    header: {
      deepSkyAction: "Open the deep-sky atlas →",
      exoplanetSystemsAction: "Compare exoplanet systems →",
      eyebrow: "The catalogue",
      intro:
        "A small but honest slice of the universe: every value Lumina publishes is traceable to its source. Start with a name — or browse below.",
      solarSystemAction: "Compare Solar System distances →",
      systemCompareAction: "Compare system scales →",
      title: "Explore real objects, provenance included",
      voyagerAction: "Follow Voyager 1 mission →",
    },
    metadataDescription:
      "Search and browse Lumina's reviewed astronomical catalogue. Every published value keeps its source and provenance.",
    metadataTitle: "Explore the catalogue",
    search: {
      heading: "Search results",
      invalidQuery: "That search could not be validated. Try a shorter or simpler query.",
      matchedAlias: "Matched “{alias}”",
      minimumQuery: "Type at least two characters to search the catalogue.",
      noResultsDescription:
        "Try a shorter fragment, a different spelling, or a catalogue designation such as {example}.",
      noResultsTitle: "No objects matched “{query}”",
      resultsAriaLabel: "Search results",
      summary: {
        one: "{count} result for {query}, ranked by the catalogue search engine.",
        other: "{count} results for {query}, ranked by the catalogue search engine.",
      },
    },
    unavailable: {
      catalogueTitle: "The catalogue is unavailable right now",
      description:
        "Lumina could not reach the catalogue service within its bounded request window. Nothing is shown rather than showing something wrong — please retry in a moment.",
      searchTitle: "Search is unavailable right now",
    },
  },
  object: {
    footerBackToExplore: "← Back to Explore",
    header: {
      backToExplore: "← Explore",
      compare: "Compare this object",
      eyebrow: "Catalogue object",
      measuredQuantities: {
        one: "{entityType} · {count} measured quantity",
        other: "{entityType} · {count} measured quantities",
      },
      observe: "Observe",
    },
    metadata: {
      description:
        "{name} in the Lumina catalogue: {entityType} with published measurements and full source provenance.",
      notFoundTitle: "Object not found",
      unavailableTitle: "Object temporarily unavailable",
    },
    notFound: {
      browseCatalogue: "Browse the catalogue",
      description:
        "Lumina has no catalogue object at {path}. It may be added later as reviewed data grows — try searching instead.",
      title: "Object not found",
    },
    provenance: {
      covers: "Covers: {quantities}",
      empty: "No source records back this object yet.",
      heading: "Provenance",
      sourceRecord: "Source record {recordId}",
      summary: "Where every value above comes from.",
    },
    routeError: {
      description:
        "Something went wrong while opening this object. No diagnostic detail is exposed here.",
      retry: "Try again",
      title: "This page could not be loaded",
    },
    science: {
      empty:
        "No measurements are published through Lumina for this object yet. This page will grow as reviewed data is added — nothing is estimated or filled in on your behalf.",
      heading: "Scientific data",
      measurementDetails: {
        one: "{count} measurement recorded · original value {originalValue} {originalUnit}",
        other: "{count} measurements recorded · original value {originalValue} {originalUnit}",
      },
      summary: "Values are shown exactly as selected by Lumina's reviewed pipeline.",
      unselected: "Also tracked, awaiting a canonical selection: {quantities}.",
    },
    unavailable: {
      browseCatalogue: "Browse the catalogue",
      description:
        "Lumina could not reach the catalogue service within its bounded request window. Nothing is shown rather than showing something wrong — please retry in a moment.",
      title: "This object is temporarily unavailable",
    },
  },
  tonight: {
    analysis: {
      catalogueFailure:
        "Some saved objects could not be loaded from the current catalogue. Remaining objects stay usable; nothing was replaced with collection snapshot measurements.",
      emptyOrdering: "No target geometry was available to order for this selected night.",
      loading: {
        one: "Loading {count} saved object… {completed} of {count} catalogue details loaded.",
        other: "Loading {count} saved objects… {completed} of {count} catalogue details loaded.",
      },
      orderingExplanation:
        "Ordered by highest sampled altitude during astronomical darkness. This is not an observability score. Ties use peak instant, then canonical name.",
      prompt: "Choose a valid night and observer location to calculate Tonight's geometry.",
      retryCatalogue: "Retry catalogue loading",
    },
    collection: {
      emptyDescription:
        "Save objects to a Collection first, then Tonight can compare their observing geometry for one location and night.",
      emptyTitle: "Save objects to use Tonight",
      exploreObjects: "Explore objects",
      heading: "Collection scope",
      manageCollections: "Manage Collections",
      noNonEmptyDescription:
        "The selected collection was deleted and no other saved objects remain available for this comparison.",
      noNonEmptyTitle: "No non-empty collection is available",
      openCollections: "Open Collections",
      optionSaved: {
        one: "{name} · {count} saved",
        other: "{name} · {count} saved",
      },
      selectLabel: "Collection to analyze",
      summary: "One collection at a time",
      usageNote:
        "Tonight reads this browser-local collection. It does not combine every collection or change saved data.",
    },
    emptyCollection: {
      description:
        "Save objects in Collections first, then return here to compare their selected-night geometry.",
      manageAction: "Manage collection",
      title: "This collection has no saved objects",
    },
    events: {
      detailsSummary: "Rise, transit, set, and source",
      meridianTransit: "Meridian transit",
      rise: "Rise",
      set: "Set",
      sourceLine: "{provider} · {dataset} ({release}) · source record {recordId}. {disclosure}",
      statusCircumpolar: "Circumpolar from this latitude",
      statusNeverRises: "Never rises from this latitude",
      statusNotDuringNight: "No event during this observing night",
      statusUnavailable: "Unavailable",
    },
    header: {
      eyebrow: "Selected-night comparison",
      intro:
        "Compare the saved objects in one Collection for one observer location and selected night. Lumina exposes the geometry behind the order; it does not calculate a composite observing score or choose a target for you.",
      title: "Tonight",
    },
    invalidNight: {
      description: "Use the date control above to select the local evening to analyze.",
      title: "Choose a valid night",
    },
    location: {
      calculateAction: "Calculate with these coordinates",
      coordinateHelp: "Latitude −90° to 90° · longitude −180° to 180°. No city lookup is used.",
      currentLocation: "Current location {latitude}°, {longitude}°",
      geolocationDenied: "Location permission was denied. You can enter coordinates manually.",
      geolocationGeneric: "Location lookup was unavailable. Enter coordinates manually instead.",
      geolocationTimeout: "Location lookup timed out. Try again or enter coordinates manually.",
      geolocationUnavailable:
        "Your browser could not determine a location. Try manual coordinates.",
      heading: "Observer location",
      invalidCoordinates: "Enter a latitude from −90 to 90 and a longitude from −180 to 180.",
      latitudeLabel: "Latitude",
      longitudeLabel: "Longitude",
      lookingUp: "Looking up location…",
      manualLegend: "Enter coordinates manually",
      privacyNote:
        "Your precise location stays in this browser. It is not sent to Lumina's catalogue API.",
      summary: "Used locally for astronomy",
      unsupported: "This browser does not support location access. Enter coordinates manually.",
      useMyLocation: "Use my location",
    },
    locationRequired: {
      description:
        "Choose Use my location or enter latitude and longitude. No astronomical calculation begins until a valid observer location is available.",
      title: "Add a location to calculate Tonight's geometry",
    },
    metadataDescription:
      "Compare the observing geometry of saved catalogue objects for one location and selected night.",
    metadataTitle: "Tonight",
    night: {
      dateHelp: "The evening beginning on this local date, continuing into the next morning.",
      heading: "Night settings",
      nightOf: "Night of",
      selectedNight: "Selected night: {date}",
      timesShown: "Times shown in {timeZone}",
    },
    lists: {
      aboveDescription:
        "A target is in this section when its sampled maximum during astronomical darkness is above 0° geometric altitude.",
      aboveTitle: "Above the geometric horizon during astronomical darkness",
      acceptedPairs: {
        one: "({count} accepted pair)",
        other: "({count} accepted pairs)",
      },
      authoritativeNote:
        "Current catalogue detail is authoritative; the saved collection snapshot is used only to identify an object while it loads or when the current object is unavailable.",
      belowDescription:
        "These targets have a sampled darkness maximum at or below 0°. Signed altitude is preserved.",
      belowTitle: "Below the geometric horizon throughout the sampled astronomical-darkness window",
      inspectPlanner: "Inspect in planner",
      noDarknessDescription:
        "These objects have current catalogue details, but no sampled astronomical-darkness maximum exists for this selected night. Open the detailed planner to inspect the night boundaries.",
      noDarknessTitle: "Saved targets",
      openPlanner: "Open planner",
      unresolvedReasons: {
        catalogueNotFound: "Current catalogue object unavailable.",
        catalogueUnavailable: "Catalogue detail unavailable.",
        geometryUnavailable: "Night geometry unavailable.",
        missingCoordinate: "Planning coordinates unavailable.",
        multipleCoordinateSources: "Multiple accepted coordinate sources.",
      },
      unresolvedSummary: {
        one: "{count} saved object is not in the factual order. The reason is shown for each object.",
        other:
          "{count} saved objects are not in the factual order. The reason is shown for each object.",
      },
      unresolvedTitle: "Not included in the ordering",
    },
    resultsHeader: {
      heading: "Night geometry",
      orderBy: "Order by",
      sortHighestAltitude: "Highest altitude",
      sortName: "Name",
      sortPeakTime: "Peak time",
      summary:
        "Current catalogue details are loaded by saved object slug; collection snapshots are not scientific data.",
    },
    summary: {
      aboveHorizon: "Above horizon",
      astronomicalDawn: "Astronomical dawn",
      astronomicalDusk: "Astronomical dusk",
      calculating: "Calculating",
      darkness: "Darkness",
      heading: "Night summary",
      nightAndCollection: "Night of {date} · collection {collectionName}",
      noDarkness:
        "No astronomical darkness for this selected night. Tonight does not rank targets using a different twilight definition.",
      savedTargets: "Saved targets",
      scientificallyAnalyzed: "Scientifically analyzed",
      sunBelowEighteen: "Sun below −18°",
      unavailable: "Unavailable",
      unavailableForNight: "Unavailable for this night",
      unavailableUnresolved: "Unavailable / unresolved",
      waiting: "Waiting",
    },
    target: {
      altitude: "{value}°",
      azimuth: "{value}° · {compass}",
      azimuthAtPeak: "Azimuth at peak: {azimuth}",
      highestAltitude: "Highest sampled altitude during astronomical darkness {altitude} at {time}",
      moonAbove: "above",
      moonBelow: "below",
      moonLine:
        "Moon at peak: {illumination}% illuminated · {altitude} {horizon} the geometric horizon · {separation}° target–Moon separation",
      moonUnavailable: "Moon context unavailable for this peak instant.",
    },
    weather: {
      consentDisclosure:
        "Weather requests use coordinates rounded to {digits} decimal places and are sent directly from your browser to {provider}. Lumina does not store observer location.",
      consentPrompt:
        "Loading weather sends one forecast request with a location rounded to {digits} decimal places directly to {provider}. You choose whether to make this separate provider request.",
      contextUnavailable: "Forecast context unavailable for this peak.",
      dateUnavailable:
        "Weather forecast unavailable for this date. Past dates and dates beyond the provider's forecast horizon are not replaced with historical data.",
      failure:
        "Could not load the weather forecast. Geometry, Moon context, and factual ordering remain available.",
      heading: "Optional weather context",
      humidityLabel: "Relative humidity",
      intro:
        "Weather is a separate hourly forecast for this observer location. It provides factual context at each primary target's peak time; it does not change the geometric order and is not a measure of sky quality.",
      licenceLink: "CC BY 4.0 licence",
      loadAction: "Load weather forecast",
      loaded:
        "Forecast context loaded for the selected night. Primary target rows show the nearest UTC forecast hour at each sampled peak; the default geometric order is unchanged.",
      loading: "Loading weather forecast…",
      moreFacts: "More forecast facts",
      peakSummary:
        "Forecast near peak ({time}): {cloudCover} total cloud cover · {precipitation} precipitation probability",
      percentValue: "{value}%",
      providerLink: "Weather data by {provider}",
      providerSummary: "Forecast provider: {provider}. Data are forecasts, not measurements.",
      providerSummaryWithRetrieved:
        "Forecast provider: {provider}. Retrieved {retrievedAt}. Data are forecasts, not measurements.",
      retry: "Retry forecast",
      unavailableValue: "Unavailable",
      visibilityKilometres: "{value} km",
      visibilityLabel: "Meteorological visibility",
      windKmh: "{value} km/h",
      windLabel: "Wind at 10 m",
    },
  },
  identify: {
    captureChecks: {
      actions: {
        retry: "Retry local capture checks",
        run: "Run local capture checks",
      },
      analyzing: "Analyzing a bounded local pixel sample…",
      boundedSample:
        "The browser decodes the selected JPEG/PNG to display RGB and samples at most {count} pixels with nearest-neighbour scaling.",
      description:
        "Run a bounded diagnostic sample of the image already held in this browser. This action makes no additional upload and does not contact {provider} or another survey service.",
      endpointDisclosure:
        "Minimum/maximum-code proxies count opaque sample pixels where at least one RGB channel is exactly 0 or 255 after browser decoding. Endpoint occupancy can be consistent with clipping, but it can also come from legitimate image content or processing; Lumina does not diagnose exposure from these percentages.",
      eyebrow: "Browser-local diagnostics",
      failures: {
        decodeFailed:
          "This browser could not decode the selected image for local capture checks. The solved result remains available.",
        invalidPixels: "The decoded pixel sample failed Lumina's bounded validation checks.",
        noOpaquePixels:
          "The bounded sample contains no fully opaque pixels, so these RGB diagnostics are not meaningful.",
        unknown:
          "The browser could not complete the local capture check. No additional upload occurred.",
      },
      histogram: {
        ariaLabel: "Display-RGB luma histogram",
        description:
          "Distribution across opaque sampled pixels only. This is not isolated sky-background measurement and is not calibrated luminance.",
        title: "Display-RGB luma histogram",
      },
      metrics: {
        diagnosticSample: "Diagnostic sample",
        diagnosticSampleValue: "{width} × {height}",
        maximumCode: "Maximum-code proxy",
        minimumCode: "Minimum-code proxy",
        sourceDimensions: "Source dimensions",
        sourceDimensionsValue: "{width} × {height} pixels",
      },
      nonOpaque: {
        one: "{count} non-opaque sampled pixel was excluded from the histogram and endpoint percentages.",
        other:
          "{count} non-opaque sampled pixels were excluded from the histogram and endpoint percentages.",
      },
      proxyCaveat:
        "These are code-value proxies, not sensor/raw measurements or universal photography advice. Compression, transparency, black borders, processing, colour management, and intentional saturation can all affect the numbers.",
      title: "Capture checks",
    },
    header: {
      localDescription:
        "This phase validates Lumina's private upload, job, retention, and deletion workflow. The solver is a deterministic fake fixture: it does not identify the sky and does not return astrometric coordinates.",
      localEyebrow: "Identify · Phase 6A infrastructure",
      remoteDescription:
        "Lumina can send one explicitly consented image to {service} for private plate solving, then normalize the returned astrometric calibration, WCS, and annotations.",
      remoteEyebrow: "Identify · Phase 6B remote plate solving",
      title: "Identify an astronomical image",
    },
    journalPanel: {
      actions: {
        openJournal: "Open Journal",
        save: "Save to local journal",
        saving: "Saving locally…",
      },
      attachment: {
        description:
          "Off by default. If enabled, Lumina stores a filename-free JPEG/PNG Blob in local IndexedDB; it is not uploaded again.",
        title: "Keep a local copy of this image in the browser journal.",
      },
      description:
        "Journal data stays in this browser. Lumina does not read EXIF time or location into the journal: date, place, equipment, conditions, and notes below are saved only from what you explicitly enter.",
      entryIdLabel: "Entry ID:",
      eyebrow: "Browser-local journal",
      failures: {
        attachment: "The journal entry could not retain that local image attachment.",
        entryLimit:
          "The local journal has reached its entry limit. Remove entries before saving another.",
        generic:
          "The local journal save failed. Nothing was intentionally uploaded or changed remotely.",
        invalidFields:
          "The journal fields could not be validated. Check the entered values and try again.",
        rollbackFailed:
          "The image attachment failed and Lumina could not fully roll back the local journal operation. Review the Journal before retrying.",
        storageUnavailable: "This browser is not allowing IndexedDB journal storage right now.",
        writeRejected:
          "The browser rejected the journal write. Nothing was changed on the remote solver.",
      },
      fields: {
        camera: "Camera (optional)",
        conditions: "Conditions (optional)",
        latitude: "Latitude (optional)",
        location: "Location label (optional)",
        locationPlaceholder: "Example: Back garden",
        longitude: "Longitude (optional)",
        notes: "Notes (optional)",
        observationTime: "Observation date and time (optional)",
        observationTimeHelp:
          "Interpreted in this browser's current time zone and stored as UTC. Leave blank if you do not know it.",
        telescope: "Telescope / optics (optional)",
        title: "Journal title",
        titlePlaceholder: "Example: Andromeda wide-field test",
      },
      savedStatus: "Saved to this browser's local journal.",
      snapshotDisclosure:
        "The journal keeps a bounded local snapshot of at most {count} unique loaded annotation labels, plus the normalized plate-solve calibration and WCS fingerprint. It never stores {service} provider job or submission identifiers.",
      title: "Save this solved observation",
      validation: {
        coordinatePairRequired:
          "Enter both latitude and longitude, or leave both coordinates blank.",
        coordinatesInvalid: "Latitude must be −90…90 and longitude −180…180.",
        locationLabelRequired: "Add a location label or clear the location fields.",
        solvedTimestampUnavailable:
          "The solved-result timestamp is unavailable, so the journal save was refused.",
        timeInvalid: "Enter a valid observation date and time, or leave it blank.",
        titleRequired: "Give this journal entry a title.",
      },
    },
    metadata: {
      description:
        "Upload an astronomical image for Lumina's private identification workflow. Remote plate solving is used only when explicitly enabled and consented to.",
      title: "Identify an astronomical image",
    },
    privacy: {
      local: {
        deletion:
          "Deletion removes the private object and scrubs filename/hash metadata from the temporary record.",
        fakeSolver:
          "The fake solver verifies workflow integrity only; a success state is not a sky identification.",
        noRemote: "No remote plate-solving service is contacted; remote processing is disabled.",
        title: "Private by design in this phase",
      },
      remote: {
        deletion:
          "Deleting here removes Lumina's local temporary object and scrubs identifying local metadata. {provider} controls any provider-side retention or deletion limitations.",
        privateMode:
          "Lumina requests {service}'s private visibility mode and disallows provider-side modification and commercial use for the submitted image.",
        sentToProvider:
          "The image is sent to {service} only after explicit consent. Lumina keeps the provider API key and provider-side identifiers server-private.",
        title: "Remote processing requires your consent",
        unsolved:
          "A remote solve can finish without finding an astrometric solution; Lumina reports that separately from processing failure.",
      },
      retentionLocal:
        "The configured retention period is {hours} hours. Terminal jobs are eligible for cleanup after the retention policy; abandoned uploads are also bounded.",
      retentionRemote:
        "The configured local retention period is {hours} hours. Terminal jobs are eligible for cleanup after the retention policy; abandoned uploads are also bounded.",
    },
    solutionOverlay: {
      annotations: {
        allLoaded: "All available annotation pages are loaded.",
        categoriesLegend: "Annotation categories",
        empty: "No named annotations were returned.",
        loadMore: "Load more annotations",
        loadedCount: "Annotations loaded: {count}",
        loadingMore: "Loading annotations…",
        warning:
          "More annotations are temporarily unavailable. The loaded solution remains usable.",
        visibleCount: "Visible with current filters: {count}",
      },
      comparison: {
        annotated: "Annotated",
        legend: "Image comparison",
        original: "Original",
        originalDescription: "The original browser-local image is shown without annotations.",
        scrollRegionLabel: "Scrollable solved astronomical image",
        solvedImageLabel: "Solved astronomical image",
        visibleAnnotations: {
          one: "{count} WCS-derived annotation is visible over the local image.",
          other: "{count} WCS-derived annotations are visible over the local image.",
        },
        zoomHelp:
          "At zoom levels above 1×, pan across the solved image by scrolling the image region.",
        zoomLabel: "Zoom: {zoom}×",
      },
      description:
        "Annotation positions below are the stored image-pixel coordinates produced from the validated WCS solution. The browser does not estimate positions from percentages or contact {provider} directly.",
      eyebrow: "Normalized astrometric result",
      metrics: {
        centerDec: "Center Dec",
        centerRa: "Center RA",
        coordinateFrame: "Coordinate frame",
        fieldRadius: "Field radius",
        orientation: "Orientation",
        parity: "Parity",
        pixelScale: "Pixel scale",
        pixelScaleValue: "{value} arcsec/pixel",
        solutionTimestamp: "Solution timestamp",
        solvedImage: "Solved image",
        solvedImageValue: "{width} × {height}px",
      },
      provenance: {
        annotationDescription:
          "Annotation names are provider-derived labels associated with the solved WCS; they are not object-recognition or generative-AI detections and may not enumerate every object in the field.",
        fingerprintLabel: "WCS source fingerprint:",
        solverDescription:
          "Lumina validates and normalizes the returned calibration and WCS before storing it.",
        solverLabel: "Solver:",
        title: "Solution provenance and limitations",
      },
      table: {
        caption: "Loaded WCS-derived annotations",
        category: "Category",
        dec: "Dec",
        label: "Label",
        pixelX: "Pixel x",
        pixelY: "Pixel y",
        ra: "RA",
      },
      title: "Solved field and WCS-backed annotations",
    },
    surveyComparison: {
      action: "Open survey comparison",
      creditLabel: "Credit:",
      description:
        "Compare your solved image with a reviewed {service} survey layer centered on the same astrometric field. The two views are not pixel-registered and are not photometrically equivalent; orientation, projection, epoch, resolution, bandpass, and processing may differ.",
      eyebrow: "Opt-in survey context",
      fieldDescription:
        "Lumina requests a {fieldOfView}° atlas field from the solved center, derived as twice the normalized solution radius.",
      fieldDescriptionClamped:
        "Lumina requests a {fieldOfView}° atlas field from the solved center, derived as twice the normalized solution radius and clamped to the certified atlas range.",
      figures: {
        localAlt: "Original solved astronomical image for survey comparison",
        localCaption: "Your local solved image",
        surveyCaption: "{layer} survey context",
        surveyRegionLabel: "{service} survey comparison",
      },
      layerLabel: "Survey layer",
      privacy:
        "Opening this comparison contacts approved {serviceShort}/survey hosts, which may observe the sky region being requested. Your uploaded image bytes, filename, journal data, and observer location are not sent to those hosts by this panel.",
      sourceDetails: "Source details",
      states: {
        checking: "Checking {layer} availability…",
        comparisonReady: "Survey comparison ready.",
        contextLost: "The survey graphics context was lost. The local image remains available.",
        contextRestored: "Graphics context restored.",
        layerApplyFailed:
          "The selected survey layer could not be applied. The previous view remains available.",
        layerUnavailable: "{layer} imagery is unavailable right now.",
        loading: "Starting the survey renderer…",
        rendererFailed:
          "The survey renderer could not start. Your local solved image remains available.",
        showingLayer: "Showing {layer}.",
      },
      title: "Compare with survey context",
    },
    status: {
      deleted: {
        description: "The private object was removed and identifying metadata was scrubbed.",
        title: "Temporary submission deleted",
      },
      deletion: {
        confirmDelete: "Confirm delete",
        confirmGroupLabel: "Confirm temporary submission deletion",
        deleteUpload: "Delete temporary upload",
        keepSubmission: "Keep submission",
        localDescription: "Deletion is available before or after the fake job finishes.",
        remoteDescription:
          "Local deletion is available before or after the remote solve finishes; it does not promise deletion from {provider}.",
      },
      errorTitle: "Upload not started",
      eyebrow: "Temporary job",
      heading: "Identification infrastructure status",
      initialLocal: "Queued. Waiting for the first private status update…",
      initialRemote: "Submitting. Waiting for the first private remote-solve status update…",
      jobIdLabel: "Job ID:",
      labels: {
        fakeSucceeded: "Fake solver completed",
        progressLabel: "Progress:",
        remoteSucceeded: "Remote solver completed",
        stateCreated: "Created",
        stateDeadLetter: "Stopped after bounded retries",
        stateDeleted: "Deleted",
        stateExpired: "Remote solve expired",
        stateFailed: "Failed",
        stateFetchingResults: "Fetching normalized results",
        stateQueued: "Queued",
        stateRemoteRunning: "Remote solver running",
        stateRunningFake: "Running fake solver",
        stateSubmittingRemote: "Submitting to remote solver",
        stateUnsolved: "No astrometric solution",
        stateWaitingRemote: "Waiting for remote solver",
        statusLabel: "Status:",
      },
      pollingWarning:
        "The latest status or deletion request was temporarily unavailable. No private data was shown.",
      providerIdentifiersPrivate:
        "Remote provider identifiers are kept private and are not exposed in this interface.",
      remoteConditions: {
        busyFailed:
          "{provider} returned a capacity response after Lumina's single upload attempt. Lumina did not automatically resubmit because the remote outcome cannot be safely assumed; try again later if you want another solve.",
        busyRetry:
          "{provider} is currently at capacity. Lumina will retry within this solve's bounded timeout; no new upload or consent is required.",
        unavailable:
          "{provider} is temporarily unavailable. Lumina will retry within this solve's bounded timeout; no new upload or consent is required.",
      },
      results: {
        expired: "The remote solve did not finish within Lumina's configured timeout.",
        fakeFailure: "The fake identification job could not complete safely.",
        fakeSuccessDescription:
          "The deterministic fake solver completed the private workflow. This is not an astrometric solution and contains no RA/Dec, WCS, orientation, scale, or detected objects.",
        fakeSuccessTitle: "Infrastructure check completed.",
        remoteFailure: "The remote plate-solving workflow could not complete safely.",
        remoteSuccessDescription:
          "Lumina stored a normalized plate calibration, WCS, and bounded annotations. The WCS-backed result and browser-local image overlay load below; provider credentials and provider identifiers remain private.",
        remoteSuccessTitle: "Astrometric solution available.",
        unsolved:
          "{provider} completed processing without finding a plate solution. This is not the same as a processing failure.",
      },
      solution: {
        loadingDescription: "Loading Lumina's stored calibration, WCS, and annotations.",
        loadingTitle: "Loading normalized solution",
        unavailableDescription:
          "The solve completed, but the normalized solution could not be loaded safely.",
        unavailableTitle: "Solution temporarily unavailable",
      },
      uploading: {
        localDescription: "Validating and storing the bounded image before the fake job is queued.",
        localTitle: "Uploading privately",
        remoteDescription:
          "Validating the bounded image and creating a consented remote solve before provider processing begins.",
        remoteTitle: "Preparing remote plate solve",
      },
    },
    unavailable: {
      description:
        "Upload infrastructure is private and optional. Core Lumina remains available when this feature is offline.",
      eyebrow: "Identify · Private image processing",
      heading: "Identification unavailable",
      reasons: {
        apiOrigin: "No safe API origin is configured for private uploads.",
        policy: "Identification policy is temporarily unavailable.",
      },
      title: "Identify an astronomical image",
    },
    upload: {
      actions: {
        startLocal: "Start private infrastructure check",
        startRemote: "Start remote plate solve",
        uploadingLocal: "Uploading privately…",
        uploadingRemote: "Uploading for remote solve…",
      },
      bound:
        "Current bound: {maxBytes} and {maxPixels} pixels; each dimension must be at least {minDimension}px.",
      consentLocal:
        "I understand that Lumina will temporarily store and process this image on the server for this identification job. No remote {provider} service is contacted in this mode, and I can delete the temporary submission below.",
      consentRemote:
        "I explicitly consent to Lumina temporarily storing this image and sending its bytes to the third-party {service} service for private plate solving. Deleting the submission below removes Lumina's local temporary copy and identifying metadata; remote deletion and retention remain subject to {provider}'s service limitations.",
      description:
        "Filename and original bytes are temporary server-private data. They are never published in the status response.",
      errors: {
        consentRequired: "Confirm the temporary private processing notice first.",
        fileRequired: "Choose one JPEG or PNG image first.",
        serverMediaOnly: "The server accepted only a verified JPEG or PNG image.",
        sizeLimit: "That image exceeds the current private-upload size limit.",
        timeout: "The private upload timed out before Lumina could confirm it.",
        unavailable:
          "Image identification is temporarily unavailable. No successful upload was confirmed.",
        unsupportedMedia: "Choose a JPEG or PNG image.",
        validationFailed: "The image could not pass the private upload validation checks.",
      },
      fileLabel: "JPEG or PNG image",
      heading: "Upload one private image",
      noScript:
        "JavaScript is required to upload, poll this temporary job, and request deletion. The privacy and retention policy above remains authoritative.",
    },
  },
  journal: {
    entry: {
      addAction: "Add to journal",
      cancelAction: "Cancel",
      description:
        "Create a browser-local observation entry for {objectName}. Time and location are saved only from fields you explicitly confirm here.",
      dialogTitle: "Create journal entry",
      doneAction: "Done",
      failures: {
        entryLimit:
          "The local journal has reached its entry limit. Remove an entry before saving another.",
        generic: "The local journal save failed. Nothing was uploaded or changed remotely.",
        invalidEntry: "The journal fields could not be validated. Check them and try again.",
        storageUnavailable: "This browser is not allowing IndexedDB journal storage right now.",
        writeRejected:
          "The browser rejected the local journal write. Nothing was uploaded remotely.",
      },
      form: {
        intro:
          "The catalogue object is recorded as a local reference. Lumina does not infer when or where you observed it.",
        latitudeLabel: "Latitude",
        locationLabel: "Location label",
        locationLegend: "Location (optional)",
        locationPlaceholder: "Example: Back garden",
        longitudeLabel: "Longitude",
        notesLabel: "Notes (optional)",
        observationTimeLabel: "Observation date and time (optional)",
        plannerCoordinatesHelp:
          "Exact planner coordinates are not copied into the journal unless you choose this action and then save the form.",
        plannerLocationLabel: "Planner coordinates",
        saveAction: "Save to local journal",
        savingAction: "Saving locally…",
        timeHelp:
          "Stored as UTC only after you save this form. Leave blank if the observation time is unknown.",
        titleLabel: "Journal title",
        titlePlaceholder: "{objectName} observation",
        usePlannerCoordinates: "Use planner coordinates",
        usePlannerTime: "Use selected planner time",
      },
      openJournal: "Open Journal",
      savedStatus: "Saved to this browser's local journal.",
      validation: {
        coordinatePairRequired: "Enter both latitude and longitude, or leave both blank.",
        coordinatesInvalid: "Latitude must be −90…90 and longitude −180…180.",
        locationLabelRequired: "Add a location label or clear the location fields.",
        timeInvalid: "Enter a valid observation date and time, or leave it blank.",
        titleRequired: "Give this journal entry a title.",
      },
    },
    entries: {
      conditionsTitle: "Conditions",
      coordinateFrameLabel: "Coordinate frame",
      deleteGroupLabel: "Delete {title}",
      deleteLocalEntry: "Delete local journal entry",
      entryIdLabel: "Entry ID:",
      equipmentLabel: "Equipment",
      followUpLabel: "Follow-up",
      followUpMarked: "Marked",
      followUpNotMarked: "Not marked",
      keepEntry: "Keep entry",
      localImageLabel: "Local image",
      localImageNotRetained: "Not retained",
      localImageRetained: "Retained in this browser",
      locationLabel: "Location",
      locationWithCoordinates: "{label} · {latitude}°, {longitude}°",
      moreSavedObjects: {
        one: "+ {count} more saved object",
        other: "+ {count} more saved objects",
      },
      noPlateSolve: "No plate solve",
      notRecorded: "Not recorded",
      notesTitle: "Notes",
      observationTimeLabel: "Observation time",
      pixelScaleLabel: "Pixel scale",
      pixelScaleValue: "{value} arcsec/pixel",
      plateSolveProvenance: "Plate-solve provenance",
      savedAt: "Saved {timestamp}",
      savedObjectsLabel: "Saved objects",
      savedObjectsTitle: "Saved objects",
      snapshotIdLabel: "Solution snapshot ID:",
      solvedCenterLabel: "Solved center",
      solvedCenterValue: "{ra}° RA, {dec}° Dec",
      solverVersionLabel: "Solver version:",
      confirmLocalDelete: "Confirm local delete",
      wcsFingerprintLabel: "WCS fingerprint:",
    },
    eyebrow: "Browser-local observations",
    failures: {
      storageCorrupted:
        "Saved journal data failed validation. Lumina left the local bytes untouched rather than guessing.",
      storageUnavailable:
        "This browser is not allowing Lumina to read the local journal right now.",
    },
    identifyAnotherImage: "Identify another image",
    intro:
      "These entries live only in this browser's local IndexedDB. Lumina does not send journal notes, confirmed locations, equipment, or locally retained image attachments to the API.",
    loading: "Loading the local journal…",
    metadataDescription: "Review observations saved locally in this browser.",
    metadataTitle: "Journal · Lumina",
    privacyDetail:
      "Plate-solve snapshots come from Lumina's normalized WCS result. Observation time and location appear only when you explicitly confirmed them while saving.",
    states: {
      emptyDescription:
        "Add an observation from a catalogue object or observation plan, or solve an image in Identify and save its normalized astrometric result.",
      emptyTitle: "No journal entries yet",
      entriesTitle: "Saved observations",
      unavailableTitle: "Local journal unavailable",
    },
    title: "Observation Journal",
    transfer: {
      applyReviewedImport: "Apply reviewed import",
      conflictSummary:
        "Local updated {localUpdated} · imported updated {importedUpdated}. Lumina's timestamp-based suggestion is {recommendation}, but you must choose.",
      conflictTitle: "Conflict {id}",
      description:
        "Journal exports are portable personal-data files. They can contain your notes, explicitly confirmed location/time, equipment, normalized plate-solve snapshots, and any image Blobs you chose to retain. Store exports accordingly.",
      exportAction: "Export local journal",
      exportFailure: "The browser could not prepare a validated journal export.",
      failures: {
        generic: "The journal import could not be completed safely; local data was left unchanged.",
        invalid: "The journal file could not be validated, so local data was left unchanged.",
        previewStale:
          "The local journal changed after the preview. Review the import again before applying it.",
        unresolved: "Resolve every journal conflict before importing.",
      },
      importActionWorking: "Importing…",
      importComplete:
        "Import complete: {added} added, {replaced} replaced, {keptLocal} kept local.",
      importDescription:
        "Lumina validates the version, entry schema, attachment hashes, and whole-journal checksum before previewing any import. Existing entries are never silently overwritten.",
      importFileLabel: "Import a Lumina journal file",
      importFileSizeInvalid: "That journal file is empty or exceeds Lumina's bounded import limit.",
      importInvalid: "That journal file could not be validated. Nothing was imported.",
      importPreviewConflicts: {
        one: "{count} conflict requiring a decision",
        other: "{count} conflicts requiring a decision",
      },
      importPreviewNewEntries: {
        one: "{count} new entry",
        other: "{count} new entries",
      },
      importPreviewTitle: "Import preview",
      keepLocal: "Keep local",
      preparingExport: "Preparing export…",
      recommendationKeepLocal: "keep local",
      recommendationUseImported: "use imported",
      title: "Export or import journal data",
      useImported: "Use imported",
    },
  },
  observationPlanner: {
    chart: {
      accessibleHighest: "Highest altitude during astronomical darkness is {altitude} at {time}.",
      accessibleNoDarkness: "Astronomical darkness is not available for this night.",
      description:
        "The dashed line is the geometric horizon; the shaded interval is astronomical darkness.",
      descriptionWithSelectedTime:
        "The dashed line is the geometric horizon; the shaded interval is astronomical darkness. The gold marker is the selected time.",
      title: "Altitude through the night.",
    },
    conditions: {
      lunar: {
        closest: {
          description:
            "Minimum angular distance found among the planner’s bounded samples in astronomical darkness.",
          notApplicable: "Not applicable",
          unavailableDescription:
            "No astronomical-darkness interval or valid sample was available for this night.",
          title: "Closest target–Moon separation during astronomical darkness",
        },
        description:
          "Calculated for the same observer and selected instant as the target position. Illumination is the fraction of the Moon's visible disk lit by the Sun; it is not a sky-brightness estimate.",
        horizonPosition: {
          above: "above",
          below: "below",
        },
        metrics: {
          aboveHorizon: "Above geometric horizon",
          altitude: "Moon altitude",
          azimuth: "Moon azimuth",
          azimuthConvention: "0° north, eastward",
          belowHorizon: "Below geometric horizon",
          illumination: "Illumination",
          separation: "Target separation",
          separationDetail: "Angular distance from the target",
        },
        model:
          "Model: Astronomy Engine 2.1.19. Moon position is topocentric for this observer; altitude is geometric with no atmospheric refraction.",
        phases: {
          firstQuarter: "First quarter",
          full: "Full",
          new: "New",
          thirdQuarter: "Third quarter",
          waningCrescent: "Waning crescent",
          waningGibbous: "Waning gibbous",
          waxingCrescent: "Waxing crescent",
          waxingGibbous: "Waxing gibbous",
        },
        selectedSummary:
          "At {time}, the Moon is {altitude} {horizonPosition} the geometric horizon and {separation} from the target.",
        selectedTitle: "Moon at selected time",
        title: "Lunar conditions",
        unavailable:
          "Lunar calculation unavailable for this selected instant. The target geometry remains available.",
      },
      overview: {
        description:
          "Astronomy and weather are shown as separate evidence layers. There is no combined observability score.",
        title: "Observing conditions",
      },
      unavailableValue: "Unavailable",
      weather: {
        attribution: {
          dataLink: "Weather data by {provider}",
          licenceLink: "CC BY 4.0 licence",
          privacy:
            "Weather requests use coordinates rounded to {digits} decimal places and are sent directly from your browser to {provider}. Lumina does not store observer location.",
          provider: "Forecast provider: {provider}. Data are forecasts, not measurements.",
          providerRetrieved:
            "Forecast provider: {provider}. Retrieved {time}. Data are forecasts, not measurements.",
        },
        cloudLayers: {
          high: "High cloud",
          low: "Low cloud",
          mid: "Mid cloud",
          title: "Cloud layer detail",
        },
        conditions: {
          clearSky: "Clear sky",
          denseDrizzle: "Dense drizzle",
          denseFreezingDrizzle: "Dense freezing drizzle",
          depositingRimeFog: "Depositing rime fog",
          fog: "Fog",
          heavyFreezingRain: "Heavy freezing rain",
          heavyRain: "Heavy rain",
          heavySnowFall: "Heavy snow fall",
          heavySnowShowers: "Heavy snow showers",
          lightDrizzle: "Light drizzle",
          lightFreezingDrizzle: "Light freezing drizzle",
          lightFreezingRain: "Light freezing rain",
          mainlyClear: "Mainly clear",
          moderateDrizzle: "Moderate drizzle",
          moderateRain: "Moderate rain",
          moderateRainShowers: "Moderate rain showers",
          moderateSnowFall: "Moderate snow fall",
          overcast: "Overcast",
          partlyCloudy: "Partly cloudy",
          slightRain: "Slight rain",
          slightRainShowers: "Slight rain showers",
          slightSnowFall: "Slight snow fall",
          slightSnowShowers: "Slight snow showers",
          snowGrains: "Snow grains",
          thunderstorm: "Thunderstorm",
          thunderstormHeavyHail: "Thunderstorm with heavy hail",
          thunderstormSlightHail: "Thunderstorm with slight hail",
          unavailable: "Unavailable",
          unknown: "Unknown forecast condition",
          violentRainShowers: "Violent rain showers",
        },
        dateUnavailable:
          "Weather forecast unavailable for this date. Past dates and dates beyond the provider's forecast horizon are not replaced with historical data.",
        description:
          "Weather is optional context around the astronomical calculation. Values come from an hourly forecast and are not a measurement of the sky or a guarantee of observing quality.",
        errorUnavailable:
          "Could not load the weather forecast. The target geometry and lunar conditions remain available.",
        loadAction: "Load weather forecast",
        loading: "Loading weather forecast…",
        metrics: {
          cloudCover: "Cloud cover",
          cloudCoverDetail: "Total",
          humidity: "Relative humidity",
          humidityDetail: "At {height}",
          precipitation: "Precipitation probability",
          precipitationDetail: "Forecast chance",
          visibility: "Meteorological visibility",
          visibilityDetail: "Viewing distance",
          wind: "Wind speed",
          windDetail: "At {height}",
        },
        optInDescription:
          "Loading weather sends a rounded location directly to {provider}. Lumina does not store it. You choose whether to make this separate provider request.",
        retryAction: "Retry forecast",
        selectedDescription: "{condition} · hourly forecast point",
        selectedTitle: "Forecast nearest {time}",
        selectedUnavailable: "Forecast not available for this selected date and time.",
        summary: {
          cloudCoverDetail: "Total cloud cover",
          cloudCoverRange: "Cloud cover range",
          cloudCoverRangeValue: "{minimum}–{maximum}%",
          empty: "No forecast points were available in this observing window.",
          precipitationDetail: "Forecast probability",
          precipitationMaximum: "Maximum precipitation probability",
          points: {
            one: "Based on {count} hourly forecast point(s).",
            other: "Based on {count} hourly forecast point(s).",
          },
          title: "Night forecast summary",
          visibilityDetail: "Viewing distance, not astronomical transparency",
          visibilityMinimum: "Minimum meteorological visibility",
          windDetail: "Forecast surface wind",
          windMaximum: "Maximum wind speed at {height}",
        },
        timeline: {
          description:
            "Each bar is one forecast hour; taller bars represent a higher total cloud-cover percentage.",
          point: "{time}: {cloudCover} total cloud cover",
          title: "Cloud cover through the observing window.",
        },
        title: "Weather forecast conditions",
      },
    },
    coordinateSource: {
      description:
        "Multiple accepted positions are available; choose which paired source to calculate.",
      heading: "Coordinate source",
      option: "{datasetName} · source record {sourceRecordId}",
    },
    coordinatesUnavailable: {
      description:
        "This object does not currently have a usable accepted Gaia ICRS position. Lumina has not estimated or substituted coordinates.",
      title: "Observation planning unavailable",
    },
    header: {
      chooseObject: "Choose an object",
      description:
        "Find when this catalogue object is highest and where to look from your location. These are geometric sky calculations, not a weather or visibility forecast.",
      eyebrow: "Observation planner",
      openObject: "Open object",
      targetSummary: "{entityType} · select a different target below",
    },
    location: {
      calculateAction: "Calculate with these coordinates",
      coordinateHelp: "Latitude −90° to 90° · longitude −180° to 180°. No city lookup is used.",
      currentLocation: "Current location {latitude}°, {longitude}°",
      deviceNote: "Used on this device for the calculation",
      geolocationFailures: {
        denied: "Location permission was denied. You can enter coordinates manually.",
        timeout: "Location lookup timed out. Try again or enter coordinates manually.",
        unavailable: "Your browser could not determine a location. Try manual coordinates.",
        unknown: "Location lookup was unavailable. Enter coordinates manually instead.",
      },
      geolocationUnsupported:
        "This browser does not support location access. Enter coordinates manually.",
      invalidCoordinates: "Enter a latitude from −90 to 90 and a longitude from −180 to 180.",
      latitudeLabel: "Latitude",
      longitudeLabel: "Longitude",
      lookupBusy: "Looking up location…",
      manualLegend: "Enter coordinates manually",
      privacyDescription:
        "Your precise location stays in this browser. It is not sent to Lumina's catalogue API.",
      title: "Observer location",
      useMyLocation: "Use my location",
    },
    metadata: {
      description:
        "Plan when and where to observe a Lumina catalogue object using deterministic astronomical calculations.",
      title: "Observation planner",
    },
    night: {
      dateHelp: "The evening beginning on this local date, continuing into the next morning.",
      dateLabel: "Night of",
      nowAction: "Now",
      selectedTimeHelp:
        "Inspect altitude and azimuth at one instant; this does not change the night window.",
      selectedTimeLabel: "Selected local time",
      summary: "Night of {date}",
      timeZoneSummary: "Times shown in {timeZone}",
      title: "Observing night",
    },
    results: {
      altitudeGeometric: "Altitude · geometric",
      azimuthConvention: "Azimuth · 0° north, eastward",
      belowHorizonHeading: "The target stays below the horizon during astronomical darkness",
      darknessUnavailable: "No astronomical darkness on this night.",
      eyebrow: "Observation geometry",
      highestAltitude: "Altitude {altitude} at the sampled maximum.",
      highestHeading: "Highest during astronomical darkness: {time}",
      nightBoundaries: "Night boundaries",
      solarBoundaryDescription:
        "Solar boundaries use geometric center crossings; astronomical darkness means the Sun is below −18°.",
      selectedTime: "Selected time",
      events: {
        astronomicalDawn: "Astronomical dawn",
        astronomicalDusk: "Astronomical dusk",
        circumpolar: "Circumpolar from this latitude",
        meridianTransit: "Meridian transit",
        neverRises: "Never rises from this latitude",
        notDuringNight: "No event during this observing night",
        rise: "Rise",
        set: "Set",
        sunriseGeometric: "Sunrise · geometric",
        sunsetGeometric: "Sunset · geometric",
        unavailable: "Unavailable",
      },
      targetEvents: {
        description: "Times are calculated for the selected night and shown in {timeZone}.",
        title: "Rise, transit, set",
      },
      source: {
        sourceRecordLabel: "Source record",
        title: "Position source",
      },
    },
    savePlan: {
      description:
        "Saving this plan stores the exact observer coordinates, selected time, target, calculated geometry, and source context only in this browser. Lumina does not send this saved plan to the server or put the coordinates in its URL.",
      failures: {
        generic: "Lumina could not save this plan locally. Nothing was sent to the server.",
        identifierUnavailable:
          "This browser cannot create a safe local identifier for the saved plan.",
        planLimit:
          "This browser already has {count} saved plans. Delete one before saving another.",
        quotaExceeded:
          "This browser does not have enough local storage space to save another plan.",
        storageCorrupted:
          "Saved-plan storage could not be read safely. Existing local data was not changed.",
        storageUnavailable: "This browser is not allowing Lumina to store saved plans right now.",
      },
      openSavedPlan: "Open saved plan",
      saveAction: "Save plan",
      savedStatus:
        "Saved locally in this browser. The saved view is a snapshot, not a future recomputation.",
      savingAction: "Saving plan…",
      title: "Keep this plan on this device",
    },
    skyFinder: {
      brightStars: {
        markerDescription:
          "Marker size is derived from Gaia G magnitude; it is a visual encoding, not stellar physical size or a guarantee of visibility.",
        positionsDescription:
          "Positions: Gaia DR3 catalogue epoch J2016.0. Proper motion not propagated.",
        sourceDescription:
          "Source: ESA Gaia Archive · processed by Gaia DPAC. Context rows are not searchable Lumina catalogue entities.",
        states: {
          hidden: "Bright-star context is hidden.",
          loading: "Loading pinned bright-star context…",
          shown: {
            one: "{count} context stars above the geometric horizon.",
            other: "{count} context stars above the geometric horizon.",
          },
          shownCapped:
            "Showing the {cap} brightest context stars above the horizon from the pinned Gaia DR3 G ≤ 5.5 slice. {count} context stars are above the geometric horizon.",
          unavailable: "Bright-star context unavailable.",
        },
        title: "Bright-star context",
      },
      compass: {
        e: "E",
        ene: "ENE",
        ese: "ESE",
        n: "N",
        ne: "NE",
        nne: "NNE",
        nnw: "NNW",
        nw: "NW",
        s: "S",
        se: "SE",
        sse: "SSE",
        ssw: "SSW",
        sw: "SW",
        w: "W",
        wnw: "WNW",
        wsw: "WSW",
      },
      constellation: {
        abbreviation: "Official abbreviation {abbreviation}",
        boundaryDescription:
          "Constellations are official IAU sky regions; the boundary shown is not a stick-figure drawing. The pinned boundary coordinates are J2000.0 equatorial regions transformed to the selected observer and instant.",
        name: "Constellation {name}",
        officialRegion: "Official IAU region",
        sourceDescription:
          "Source: International Astronomical Union. This context uses region geometry only; it does not describe physical proximity or guarantee visibility.",
        states: {
          hidden: "Constellation boundary is hidden.",
          loading: "Loading constellation context…",
          noVisibleBoundary:
            "No boundary segment is above the geometric horizon at this selected time.",
          shown: "Target constellation boundary shown for the selected observer and instant.",
          unavailable: "Constellation context unavailable.",
        },
        title: "Constellation region",
      },
      guidance: {
        aboveHorizonValue: "{altitude} above the geometric horizon",
        altitude: "Altitude",
        belowDescription:
          "The direction shows where {targetName} would rise or set from this location. It is not currently in the visible sky.",
        belowHeading: "Target is below the horizon",
        direction: "Direction",
        directionValue: "{azimuth} true azimuth",
        face: "Face",
        heading: "How to find {targetName}",
        localObstructions:
          "The finder does not model local obstructions such as trees, buildings, or terrain.",
        lookUp: "Look up",
        reference:
          "Reference: geometric horizon. Azimuth is measured clockwise from true north. Phone or magnetic compass readings can differ by location.",
        spokenAbove:
          "The target is {altitude} above the geometric horizon at azimuth {azimuth} {compass}.",
        spokenBelow:
          "The target is {altitude} below the geometric horizon at azimuth {azimuth} {compass}.",
        spokenDegrees: "{value} degrees",
        trueAzimuth: "True azimuth",
      },
      map: {
        caption:
          "North is at the top, east is right, south is bottom, and west is left. The horizon is the outer circle; altitude increases toward the zenith at the center. Rings mark 30° and 60°.",
        horizon: "Horizon · 0°",
        zenith: "Zenith · 90°",
      },
      namedAnchors: {
        altitudeGeometric: "Altitude · geometric",
        angularSeparation: "Angular separation from target · {separation}",
        listAriaLabel: "Named sky anchors at selected time",
        nearest: "Nearest named sky anchor by angular separation: {name} · {separation}.",
        objectiveContext: "Objective geometric context",
        rowAriaLabel:
          "{name}: altitude {altitude}; azimuth {azimuth}; angular separation {separation} from target",
        sourceDescription:
          "Proper names: IAU Working Group on Star Names. Positions: ESA Gaia DR3 / Gaia DPAC. Above the geometric horizon is not a naked-eye visibility claim; proper motion is not propagated.",
        states: {
          hidden: "Named star anchor markers and labels are hidden.",
          loading: "Loading named sky anchors…",
          ready: {
            one: "{count} named anchors reuse the pinned Gaia star positions.",
            other: "{count} named anchors reuse the pinned Gaia star positions.",
          },
          unavailable: "Named star anchors unavailable.",
        },
        title: "Named sky anchors",
      },
      overview: {
        description:
          "Use the direction card and circular map to orient yourself at the selected local time. The target marker is primary; named sky anchors, the Moon, solar-system markers, the target constellation region, and pinned Gaia bright stars are context.",
        eyebrow: "Selected-time finder",
        noSensors: "No device sensors used",
        title: "Sky Finder",
      },
      references: {
        altitudeGeometric: "Altitude · geometric",
        bodies: {
          jupiter: "Jupiter",
          mars: "Mars",
          mercury: "Mercury",
          saturn: "Saturn",
          sun: "Sun",
          venus: "Venus",
        },
        geometricOnly: "Geometric positions only",
        hidden:
          "Solar-system reference markers are hidden. Turn on the toggle to list bodies above the geometric horizon.",
        moon: "Moon",
        moonUnavailable: "The Moon position is unavailable for this selected instant.",
        noneAboveHorizon:
          "No supported solar-system reference body is above the geometric horizon at this time.",
        rowAriaLabel: "{label}: altitude {altitude}; azimuth {azimuth}",
        targetTag: "target",
        title: "Reference objects at selected time",
      },
      toggles: {
        brightStars: {
          help: "Neutral markers come only from the pinned Gaia DR3 G ≤ 5.5 context artifact and are shown above the geometric horizon.",
          label: "Show bright-star context",
        },
        constellation: {
          help: "Shows the selected target's official IAU sky-region boundary, not an artistic constellation drawing.",
          label: "Show constellation boundary",
        },
        namedAnchors: {
          help: "Official IAU proper names are layered onto their matching Gaia DR3 context stars. The underlying bright-star dots are controlled separately.",
          label: "Show named star anchors",
        },
        solarSystem: {
          help: "{bodies} are shown only when above the geometric horizon. Above the horizon does not mean visible.",
          label: "Show solar-system markers",
        },
      },
    },
    states: {
      invalidTime: {
        description: "Choose a valid night and local time to try again.",
        title: "This time could not be calculated",
      },
      locationRequired: {
        description:
          "Choose Use my location or enter latitude and longitude. No calculation begins until a valid observer location is available.",
        title: "Add a location to calculate the sky position",
      },
    },
    target: {
      emptyDescription:
        "Select an object to begin. Observation calculations use only an accepted catalogue position.",
      heading: "Target",
      reviewedSuggestions: "Uses the reviewed catalogue suggestions",
      unavailable: "That target could not be loaded. Choose another catalogue object.",
    },
  },
  savedObservationPlan: {
    actions: {
      cancelDelete: "Cancel",
      confirmDelete: "Confirm delete",
      deletePlan: "Delete saved plan",
      openPlanner: "Open observation planner",
      planAgain: "Plan this target again",
    },
    delete: {
      description:
        "This removes only this saved plan from this browser. It does not clear journal entries, other saved plans, or offline page copies.",
      failure: "Lumina could not delete this saved plan. The local record may still exist.",
      title: "Delete this local snapshot?",
    },
    events: {
      astronomicalDawn: "Astronomical dawn",
      astronomicalDusk: "Astronomical dusk",
      circumpolar: "Circumpolar from the saved latitude",
      neverRises: "Never rises from the saved latitude",
      notDuringNight: "No event during the saved observing night",
      rise: "Rise",
      set: "Set",
      sunriseGeometric: "Sunrise · geometric",
      sunsetGeometric: "Sunset · geometric",
      transit: "Transit",
      unavailable: "Unavailable in the saved calculation",
    },
    eyebrow: "Saved observation plan",
    loading: {
      description: "Reading this browser's local IndexedDB snapshot.",
      title: "Loading saved plan…",
    },
    night: {
      darknessUnavailable: "Astronomical darkness was unavailable in this saved calculation.",
      highestAltitude:
        "Highest sampled altitude during astronomical darkness: {altitude}° at {instant}.",
      title: "Saved night geometry",
    },
    observer: {
      altitudeValue: "Altitude {altitude}°",
      azimuthValue: "Azimuth {azimuth}° · {compass}",
      locationLabel: "Location",
      locationValue: "{latitude}°, {longitude}°",
      selectedTimeLabel: "Selected time",
      skyPositionLabel: "Sky position",
      storedLocal: "Stored only in this browser.",
      title: "Saved observer and selected instant",
    },
    samples: {
      altitudeGeometric: "Altitude · geometric",
      label: "Saved altitude samples",
      savedInstant: "Saved instant",
      title: "Saved altitude samples",
    },
    snapshotDescription:
      "This is a saved snapshot, not a current recomputation. It preserves the exact local inputs, source context, and deterministic result from when you chose Save plan.",
    snapshotSummary: "Saved {savedAt} · night of {nightDate} · {timeZone}",
    source: {
      calculationDescription:
        "geometric topocentric calculation · no refraction · astronomical darkness at solar altitude {solarAltitude}°.",
      datasetSummary:
        "{providerName} · {datasetName} ({releaseVersion}) · {sourceRecordLabel} {sourceRecordId} · {referenceEpochLabel} J{referenceEpoch}.",
      referenceEpochLabel: "reference epoch",
      sourceRecordLabel: "source record",
      title: "Source and calculation snapshot",
    },
    states: {
      corrupted: {
        body: "The stored record failed validation. Lumina left the local data untouched instead of guessing or repairing it silently.",
        heading: "Saved plan storage could not be trusted",
      },
      deleted: {
        body: "This local snapshot was removed from this browser. Other Lumina personal data was not cleared.",
        heading: "Saved plan deleted",
      },
      error: {
        body: "Lumina could not read this local snapshot. No replacement calculation was created.",
        heading: "Saved plan could not be read",
      },
      invalid: {
        body: "The local saved-plan identifier is malformed, so Lumina did not query IndexedDB for another record.",
        heading: "Saved plan address is invalid",
      },
      missing: {
        body: "This browser does not have a saved plan with that local identifier. Lumina did not substitute another plan.",
        heading: "Saved plan not found",
      },
      unavailable: {
        body: "This browser is not allowing Lumina to read its local IndexedDB storage right now.",
        heading: "Saved plans are unavailable",
      },
    },
  },
  labIndex: {
    eyebrow: "Space Lab",
    intro:
      "Open a reviewed Lumina laboratory. Each lab keeps its model, assumptions, and accessible text result visible alongside its interaction.",
    metadataDescription: "Lumina's implemented interactive astronomy laboratories.",
    metadataTitle: "Lab",
    navigationLabel: "Implemented laboratories",
    openLab: "Open lab →",
    title: "Lab",
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
    routeState: {
      error: {
        description:
          "The authored learning content is temporarily unavailable. Nothing was changed in your local progress.",
        retry: "Try again",
        title: "The learning path could not load",
      },
      loading: "The learning path is loading…",
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
  status: {
    contract: {
      apiVersionLabel: "API version",
      applicationVersionLabel: "Application version",
      heading: "Reported contract",
    },
    eyebrow: "Foundation status",
    provider: {
      acknowledgmentAndUsage: "Acknowledgment and usage",
      cache: {
        expired: "Expired",
        fresh: "Fresh",
        historicalOnlyWhileDisabled: "{cacheLabel}; historical only while disabled",
        missing: "No accepted cache",
        stale: "Stale",
      },
      circuit: {
        closed: "Closed",
        halfOpen: "Half-open",
        open: "Open",
      },
      counters: {
        cyclesStarted: "Cycles started",
        heading: "Durable counters",
        httpRequests: "HTTP requests",
        httpRetries: "HTTP retries",
        quarantines: "Quarantines",
        schemaFailures: "Schema failures",
        staleFallbacks: "Stale fallbacks",
        successfulCycles: "Successful cycles",
        upstreamFailures: "Upstream failures",
      },
      heading: "Provider status",
      labels: {
        acceptedSnapshotFetched: "Accepted snapshot fetched",
        cacheState: "Cache state",
        circuit: "Circuit",
        freshUntil: "Fresh until",
        lastRefreshFailure: "Last refresh failure",
        lastSuccessfulRefresh: "Last successful refresh",
        nextCircuitProbe: "Next circuit probe",
        nextPlannedAttempt: "Next planned attempt",
        providerCode: "Provider code",
        providerState: "Provider state",
        staleUntil: "Stale until",
        syncLease: "Sync lease",
      },
      lease: {
        active: "Active",
        notActive: "Not active",
      },
      noneRecorded: "None recorded",
      notRecorded: "Not recorded",
      officialDocumentation: "Official documentation",
      state: {
        disabled: "Disabled",
        enabled: "Enabled",
      },
      unavailable: "Provider status unavailable.",
    },
    returnHome: "Return to the Lumina foundation home page",
    states: {
      availableUnconfirmed: {
        detail:
          "The API answered at least one request, but this page could not confirm both process and dependency readiness.",
        heading: "API available, readiness unconfirmed",
      },
      notReady: {
        detail:
          "The API returned a not-ready response. The foundation remains usable, but its required dependency is not ready.",
        heading: "API available, dependency not ready",
      },
      ready: {
        detail: "The API process and its required database dependency both report ready.",
        heading: "API available and ready",
      },
      unavailable: {
        detail:
          "This page could not reach the API within its bounded requests. The Lumina foundation page remains available.",
        heading: "API unavailable",
      },
    },
    title: "Lumina API status",
  },
  routeBoundaries: {
    globalError: {
      description: "Lumina could not load. Try again, or return to the foundation home page later.",
      retry: "Try again",
      title: "Something went wrong",
    },
    lab: {
      scaleExplorer: {
        description:
          "The curated model was not available for this request. Try again; no scientific fallback data was substituted.",
        retry: "Try again",
        title: "Scale Explorer could not load",
      },
      telescopeBuilder: {
        description:
          "The reviewed model was not available for this request. Try again; no scientific fallback data was substituted.",
        retry: "Try again",
        title: "Telescope Builder could not load",
      },
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
  spaceNow: {
    dailyVisual: {
      aboutTitle: "About this APOD",
      actions: {
        image: "View today's APOD image",
        video: "Watch today's APOD video",
      },
      contentDateLabel: "APOD content date",
      copyrightLabel: "Copyright / credit:",
      eyebrow: "Daily Visual",
      externalMediaNotice:
        "Lumina does not automatically load or redistribute the external media. The official APOD page is opened only when you choose the action above.",
      freshSnapshot: "Fresh Daily Visual snapshot",
      freshnessDescription:
        "Freshness describes when Lumina last retrieved and validated this snapshot; it does not describe when the underlying image or video was created.",
      invalidOfficialLink:
        "The official APOD page link is unavailable because the date-derived destination did not pass Lumina's fixed-origin check.",
      mediaTypeLabel: "Media type",
      mediaTypes: {
        image: "Image",
        video: "Video",
      },
      staleSnapshot: "Stale Daily Visual snapshot",
    },
    eyebrow: "Space Now",
    intro:
      "One carefully sourced Daily Visual from NASA Astronomy Picture of the Day, with its content date, credit, and Lumina retrieval state kept distinct.",
    launches: {
      common: {
        backToLaunchCenter: "Back to Launch Center",
        cacheStates: {
          expired: "expired",
          fresh: "fresh",
          missing: "missing",
          stale: "stale",
        },
        noneRecorded: "None recorded",
        notProvided: "Not provided",
        notProvidedBySource: "Not provided by source",
        notRecorded: "Not recorded",
        spaceNowLaunchCenter: "Space Now · Launch Center",
        unavailableReasons: {
          cachedContentExpired: "The last validated launch snapshot has expired.",
          noValidatedSnapshot: "No validated launch snapshot is available yet.",
          providerDisabled: "The launch provider is disabled.",
        },
      },
      countdown: {
        label: "Exact countdown:",
        loading: "loading…",
        reachedOrPassed: "Launch time reached or passed",
        units: {
          day: "{value}d",
          hour: "{value}h",
          minute: "{value}m",
          second: "{value}s",
        },
      },
      detail: {
        addToCalendar: "Add to calendar",
        calendarWithheld:
          "Calendar export is withheld because the provider schedule is coarser than hour precision.",
        factsTitle: "Launch facts",
        labels: {
          cacheState: "Cache state",
          country: "Country",
          destinationBody: "Destination / body",
          lastRefreshFailure: "Last refresh failure",
          launchPad: "Launch pad",
          launchProvider: "Launch provider",
          ll2RecordUpdated: "LL2 record updated",
          location: "Location",
          luminaRetrieved: "Lumina retrieved",
          missionAgencies: "Mission agencies",
          missionType: "Mission type",
          orbit: "Orbit",
          vehicle: "Vehicle",
          vehicleVariant: "Vehicle variant",
        },
        metadataDescription:
          "{name}: source status, schedule precision, mission, vehicle, site, freshness, and official launch links.",
        metadataNotFoundTitle: "Launch not found",
        metadataUnavailableTitle: "Launch temporarily unavailable",
        notFoundDescription:
          "Lumina keeps a bounded upcoming-launch snapshot. This identifier is not present in that current validated cache.",
        notFoundTitle: "Launch not found in the current snapshot",
        officialLaunchPage: "Official launch page",
        officialLiveWebcast: "Official live webcast",
        officialWebcast: "Official webcast",
        provenanceTitle: "Freshness and provenance",
        sourceActionsTitle: "Source actions",
        sourceDocumentation: "Launch Library 2 source",
        transportDescription:
          "Lumina could not read its API safely, so it is showing no launch claims.",
        transportTitle: "Launch detail is temporarily unavailable",
        unavailableTitle: "Launch detail is currently unavailable",
      },
      list: {
        backToSpaceNow: "Back to Space Now",
        currentSnapshotTitle: "Current bounded snapshot",
        eyebrow: "Space Now · Launch Center",
        facts: {
          launchProvider: "Launch provider",
          mission: "Mission",
          site: "Site",
          vehicle: "Vehicle",
        },
        freshSnapshot: "Fresh launch snapshot",
        intro:
          "A bounded Launch Library 2 snapshot. Status, NET precision, launch window, source update time, and Lumina retrieval freshness stay separate so placeholder schedules never look more exact than the source says they are.",
        lastSafeRefreshFailure: "Last safe refresh failure: {code}",
        latestRecordUpdate: "The newest LL2 record update represented is {updatedAt}.",
        metadataDescription:
          "Upcoming space launches from Launch Library 2 with explicit source status, schedule precision, windows, freshness, and official links.",
        metadataTitle: "Launch Center",
        noBrowserProviderRequest: "No live provider request is made from this page.",
        providerInformation: "Provider information",
        providerRecordUpdatedLabel: "Provider record updated",
        retrievedCache: "Lumina retrieved this cache at {retrievedAt}.",
        snapshotCount: {
          one: "Showing {count} of {total} normalized launch record retained by this Lumina projection.",
          other:
            "Showing {count} of {total} normalized launch records retained by this Lumina projection.",
        },
        sourceDocumentation: "Launch Library 2",
        sourceTitle: "Source and limitations",
        staleSnapshot: "Stale launch snapshot",
        title: "Upcoming launches",
        transportDescription:
          "Lumina could not read its API within the bounded request window, so it is showing no launch claims.",
        transportTitle: "Launch Center is temporarily unavailable",
        unavailableTitle: "Launch Center is currently unavailable",
        latestRecordNotRecorded: "not recorded",
        unrecordedTime: "an unrecorded time",
      },
      schedule: {
        countdownEligibleDetail:
          "The source currently marks this Go timing precise enough for Lumina's exact countdown.",
        countdownEligibleList: "This Go record is precise enough for an exact countdown.",
        countdownIneligibleDetail:
          "No exact countdown is shown for this status/precision combination.",
        countdownIneligibleList:
          "Lumina does not show an exact countdown for this status/precision combination.",
        launchWindow: "Launch window: {start} → {end}",
        providerPrecision: "Provider precision: {precision} ({abbreviation}). {countdown}",
        scheduleReference: "Schedule reference",
        scheduledNet: "Scheduled NET",
        sourcePrecision: "Source precision: {precision} ({abbreviation}). {countdown}",
        window: "Window: {start} → {end}",
      },
    },
    nearEarth: {
      eyebrow: "Space Now",
      intro:
        "A bounded view of predicted Earth close approaches from {provider}. A close approach is a distance-and-time prediction, not an impact warning.",
      metadataDescription:
        "A source-backed {provider} view of predicted Earth close approaches, with nominal distances, speeds, estimated diameter ranges, and classification context.",
      metadataTitle: "Near-Earth Objects",
      prediction: {
        classification:
          "Potentially hazardous is a technical {authority} classification based on orbital proximity and brightness that identifies objects with potential for close approaches. It does not mean an impact is predicted.",
        title: "Prediction context",
        uncertainty:
          "Close-approach uncertainty is not provided by the {provider} feed used in this version.",
        updates:
          "{authority} updates orbit solutions as new observations become available, so predicted approach statistics can change.",
      },
      snapshot: {
        freshDescription:
          "This page shows the current seven-day {provider} feed window; its retrieval time is listed below.",
        freshTitle: "Fresh near-Earth approach snapshot",
        staleDescription:
          "This page is showing the last successfully retrieved {provider} feed window; its retrieval time is listed below.",
        staleTitle: "Stale near-Earth approach snapshot",
      },
      source: {
        officialDocumentation: "{sourceName} official documentation",
        title: "Source and attribution",
      },
      table: {
        absoluteMagnitude: "Absolute magnitude H",
        approachTime: "{provider} close-approach time",
        caption: "{provider} Earth close approaches, ordered by provider approach epoch",
        classification: "Classification",
        context:
          "Nominal distance is the source-published close-approach distance. Relative velocity is relative to Earth at the predicted approach; it is not an impact velocity.",
        diameterRange: "Estimated diameter range (m)",
        hazardousLabel: "Potentially hazardous asteroid: {value}",
        heading: "Predicted closest approaches",
        nominalLunarDistance: "Nominal distance (lunar distances)",
        nominalMissDistance: "Nominal miss distance (km)",
        no: "No",
        object: "Object",
        objectReference: "NEO {id}",
        relativeVelocity: "Relative velocity (km/s)",
        yes: "Yes",
      },
      title: "Near-Earth Objects",
      unavailable: {
        cachedContentExpired: "The cached Near-Earth Objects snapshot has expired.",
        generic: "Near-Earth approach data could not be loaded from Lumina right now.",
        noCachedContent: "No validated Near-Earth Objects snapshot is available yet.",
        providerDisabled: "The Near-Earth Objects provider is disabled.",
        returnToSpaceNow: "Return to Space Now",
        title: "Near-Earth approach data is currently unavailable.",
      },
      window: {
        capped: "Showing the next {returned} of {total} approaches in this feed window.",
        empty: "No Earth close approaches are listed in the current {provider} feed window.",
        listed: {
          one: "{count} approach listed in this feed window.",
          other: "{count} approaches listed in this feed window.",
        },
        range: "Earth close approaches from {startDate} through {endDate}.",
        title: "Feed window",
      },
    },
    metadataDescription:
      "A source-backed Daily Visual from NASA Astronomy Picture of the Day, with clear dates, credit, and retrieval state.",
    metadataTitle: "Space Now",
    navigation: {
      launches: {
        action: "Open Launch Center",
        description:
          "See source status, NET precision, launch windows, mission, vehicle, site, official links, and provider update times. Exact countdowns appear only when the source marks a Go launch precise to the second or minute.",
        eyebrow: "Launch Center",
        title: "Follow upcoming launches without fake precision",
      },
      nearEarth: {
        action: "View near-Earth approaches",
        description:
          "Review predicted Earth close-approach times, nominal distances, relative speeds, estimated diameter ranges, and source classifications in a separate current-feed view.",
        eyebrow: "Near-Earth approaches",
        title: "See the next NASA NeoWs close approaches",
      },
      satellites: {
        action: "Open Satellite Passes",
        description:
          "Browse selected CelesTrak STATIONS and VISUAL records, inspect element freshness, and run a local SGP4 pass calculation for a location you explicitly provide. Illumination and sky state are shown separately; Lumina does not claim optical visibility.",
        eyebrow: "Satellite passes",
        title: "Predict selected satellite passes from cached elements",
      },
      spaceWeather: {
        action: "View Space Weather",
        description:
          "Review current R/S/G scale values, observed and predicted planetary Kp, source-timestamped solar-wind measurements, and recent SWPC notifications in an educational snapshot.",
        eyebrow: "NOAA Space Weather",
        title: "See separate NOAA scales, Kp, solar wind, and notifications",
      },
    },
    retrieval: {
      cacheStateLabel: "Cache state",
      cacheStates: {
        expired: "expired",
        fresh: "fresh",
        missing: "missing",
        stale: "stale",
      },
      freshUntilLabel: "Fresh until (UTC)",
      lastFailureLabel: "Last safe refresh failure",
      noneRecorded: "None recorded",
      notRecorded: "Not recorded",
      retrievedAtLabel: "Retrieved at (UTC)",
      staleUntilLabel: "Stale grace ends (UTC)",
      title: "Lumina retrieval state",
    },
    source: {
      apiDocumentation: "NASA Open APIs",
      mediaGuidance: "NASA media guidance",
      officialPage: "Official APOD page",
      title: "Source and credit",
    },
    title: "Space Now",
    unavailable: {
      cachedContentExpired: "The cached Daily Visual snapshot has expired.",
      generic: "The Daily Visual could not be loaded from Lumina right now.",
      noCachedContent: "No validated Daily Visual snapshot is available yet.",
      providerDisabled: "The Daily Visual provider is disabled.",
      title: "Daily Visual is currently unavailable.",
    },
  },
} as const satisfies LuminaMessages;
