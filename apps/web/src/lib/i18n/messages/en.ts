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
    exoplanetSystems: {
      backToExplore: "← Explore catalogue",
      continue: {
        action: "Open Solar System distance reference →",
        description:
          "The Solar System explorer uses a different reviewed source and a wider 0–30.05 {unit} range. Comparing the two makes the chosen display scale explicit instead of visually mixing the data sets.",
        title: "Compare the reference system",
      },
      eyebrow: "System explorer · Phase 5B",
      explorer: {
        dataAlternative: {
          description:
            "All ten pinned planets remain available as numbers independent of the visual track.",
          headers: {
            discovery: "Discovery",
            host: "Host",
            orbitalPeriod: "Orbital period",
            planet: "Planet",
            semimajorAxis: "Semi-major axis",
          },
          title: "Data alternative",
        },
        description:
          "Each marker is placed by a cited orbit semi-major axis from {provider} {table}. It is not the planet's current distance, orbital phase, or sky position.",
        host: {
          ariaLabel: "{name}, {countLabel}",
          confirmedPlanets: {
            one: "{count} confirmed planet",
            other: "{count} confirmed planets",
          },
          groupAriaLabel: "Host system",
          hostname: "Archive hostname: {hostname}",
          openCanonical: "Open canonical host star →",
          originDisclosure:
            "Host star is the 0 {unit} origin conceptually; it is not plotted on the logarithmic transform. Planet markers are uniform-size interface controls, not radius encodings.",
        },
        linearDescription:
          "Linear view uses the same shared 0–{maximum} {unit} reference, exposing how compressed close-in systems are.",
        logDescription:
          "Log view normalizes the shared {minimum}–{maximum} {unit} domain so close-in and wider planets remain comparable.",
        modelEyebrow: "Reviewed reference model · {modelVersion}",
        parameter: {
          noUncertainty: "Archive composite value has no reported uncertainty in this field.",
          orbitalPeriodLabel: "Orbital period",
          reference: "Parameter reference: {reference} ↗",
          semimajorAxisLabel: "Orbit semi-major axis",
          uncertainty: "Archive uncertainty: +{plus} / {minus} {unit}.",
          valueWithUnit: "{value} {unit}",
        },
        planet: {
          discoverySummary: "Host: {host} · discovered {year} · {method}",
          disclosure:
            "These two parameters may come from different publications because {table} is a composite table. Lumina therefore keeps each parameter's reference attached to that value.",
          eyebrow: "Selected confirmed planet",
        },
        scaleAriaLabel: "Orbital reference scale",
        scaleModes: {
          linearAction: "Linear semi-major axis",
          linearTrackName: "linear",
          logAction: "Log semi-major axis",
          logTrackName: "log",
        },
        systemLayoutAriaLabel: "{system} orbital reference layout",
        title: "Five known host systems on one shared {unit} scale",
        trackSummary: "{distance} {unit} · {position}% of shared {mode} track",
      },
      intro:
        "Compare confirmed planets around the five host stars already reviewed by Lumina. The layout uses cited orbit semi-major axes—not current positions, not generated orbits, and not an artist's impression.",
      metadataDescription:
        "Compare pinned {provider} semi-major-axis layouts for Lumina's five reviewed host-star systems without implying current planet positions.",
      metadataTitle: "Exoplanet System Layouts",
      model: {
        assumptionsTitle: "Assumptions",
        description:
          "The Python astronomy domain validates the pinned archive snapshot and computes both display coordinates. The browser selects among those reviewed outputs; it does not estimate missing planets, orbit phases, or orbital elements.",
        limitationsTitle: "Limitations",
        title: "Model and limitations",
      },
      provenance: {
        archiveTableLabel: "Archive table",
        bytesLabel: "Raw snapshot bytes",
        columnDocumentation: "{columnSet} column definitions ↗",
        description:
          "Lumina does not query {provider} when you open this page. It uses this checksum-pinned, reviewed snapshot so the visual remains reproducible.",
        providerLabel: "Provider",
        querySummary: "Exact pinned {tap} query",
        retrievedLabel: "Retrieved",
        shaLabel: "SHA-256",
        tapDocumentation: "{provider} {tap} documentation ↗",
        title: "Snapshot provenance",
      },
      title: "Exoplanet System Layouts",
    },
    voyager: {
      backToExplore: "← Explore catalogue",
      centerBodyName: "Sun",
      eyebrow: "Mission timeline · Phase 5B",
      intro:
        "Follow documented {mission} mission milestones and a checksum-pinned {trajectoryProvider} trajectory. Mission history and trajectory samples remain separate source contracts: {historyProvider} records the launch on {launchDate}, while the pinned {trajectoryProvider} vector series begins {vectorStartDate}.",
      metadataDescription:
        "Explore a source-labelled {mission} mission timeline and a pinned {provider} heliocentric trajectory without implying interpolated or live spacecraft positions.",
      metadataTitle: "{mission} Mission Timeline and Trajectory",
      model: {
        assumptionsTitle: "Assumptions",
        description:
          "Lumina does not propagate a spacecraft orbit in the browser. It renders a reviewed static artifact whose annual XYZ vectors were parsed and validated by the Python astronomy domain.",
        limitationsTitle: "Limitations",
        title: "Model and limitations",
      },
      provenance: {
        bytesLabel: "Raw response bytes",
        centerLabel: "Center",
        description:
          "This route makes no live {provider} request. The pinned text response is validated by SHA-256 before the reviewed JSON artifact can be regenerated.",
        documentation: "{provider} API documentation ↗",
        firstEpochLabel: "First vector epoch",
        lastSampleLabel: "Last pinned sample",
        outputLabel: "Output",
        outputValue: "{outputType} · {outputUnits}",
        providerLabel: "Provider",
        referenceFrameLabel: "Reference frame",
        samplingLabel: "Sampling",
        shaLabel: "SHA-256",
        targetLabel: "Target",
        targetValue: "{mission} ({targetId})",
        timeScaleValue: "{value} {timeScale}",
        title: "{provider} snapshot provenance",
      },
      sourcesTitle: "Sources",
      table: {
        axisHeader: "{axis} ({unit})",
        description:
          "The table is the accessible numeric alternative to both charts. {xAxis}, {yAxis}, and {zAxis} are {center}-centered {frame}-ecliptic coordinates in {unit}; distance is derived from all three axes.",
        distanceHeader: "Heliocentric distance ({unit})",
        epochHeader: "Epoch ({timeScale})",
        title: "Complete annual vector table",
        yearHeader: "Year",
      },
      timeline: {
        description:
          "These dates come from {historyProvider} mission history. They are not inferred from the annual {trajectoryProvider} vector samples.",
        source: "Source: {source} ↗",
        title: "Mission milestones",
      },
      title: "{mission} Mission Timeline and Trajectory",
      trajectory: {
        description:
          "The path below is an {xyAxes} projection of {center}-centered geometric positions in the {frame} ecliptic frame. {zAxis} is not drawn in the projection and remains visible numerically. Annual points are connected only as a visual guide; Lumina does not interpolate a continuous flight solution.",
        distanceHistory: {
          ariaLabel: "{mission} heliocentric distance by annual sample",
          description:
            "Distance is the reviewed Python-derived {formula} value for each annual {provider} sample.",
          title: "Heliocentric distance history",
        },
        eyebrow: "{provider} · pinned annual vectors",
        projection: {
          ariaLabel: "{mission} heliocentric ecliptic {xyAxes} trajectory projection",
          description:
            "Equal {xAxis}/{yAxis} scale in {unit}. This is a projection, not a full 3D path; {zAxis} is omitted here.",
          title: "{frame} ecliptic {xyAxes} projection",
        },
        sampleLabel: "Selected annual sample: {year} · {distance} {unit} from the {center}",
        selectedVectorTitle: "Selected {provider} vector · {year}",
        sliderAriaLabel: "{mission} annual trajectory sample",
        title: "{mission} trajectory reference",
        valueWithUnit: "{value} {unit}",
        vectorLabels: {
          distance: "Distance",
          epoch: "Epoch ({timeScale})",
        },
      },
    },
    solarSystemDistance: {
      backToExplore: "← Explore catalogue",
      continue: {
        action: "Open characteristic-size Scale Explorer →",
        description:
          "Distance from the Sun and physical body size answer different questions. Keep them separate, then compare them intentionally.",
        title: "Continue across scales",
      },
      eyebrow: "Cosmic Zoom · Phase 5B",
      explorer: {
        dataAlternative: {
          description:
            "The numeric table is authoritative when visual spacing is difficult to compare.",
          headers: {
            body: "Body",
            lightTime: "Light-time context",
            linearTrack: "Linear track",
            logTrack: "Log track",
            meanDistance: "Mean Sun distance",
          },
          logUndefined: "not defined at 0 {unit}",
          title: "Data alternative",
        },
        description:
          "This is a distance comparison, not a live Solar System snapshot. Each planet uses the cited {provider} mean distance from the Sun. Marker sizes are uniform and do not represent body diameter.",
        linearDescription:
          "Linear view places each planet by its reviewed mean Sun distance relative to Neptune. Inner-planet bars therefore become very short.",
        logDescription:
          "Log view uses log10 of the reviewed mean Sun distance, normalized from Mercury to Neptune. The Sun is kept separately at 0 {unit} because log10(0) is undefined.",
        modelEyebrow: "Reviewed reference model · {modelVersion}",
        scaleAriaLabel: "Distance scale",
        scaleModes: {
          linearAction: "Linear distance",
          linearTrackName: "linear",
          logAction: "Log distance",
          logTrackName: "log",
        },
        selected: {
          compareSizeAction: "Compare {body}'s characteristic size →",
          disclosure:
            "Distance and body size are different quantities. Lumina intentionally keeps them in separate reviewed models rather than drawing planet marker diameters on the distance track.",
          earthRatioLabel: "Relative to Earth's mean distance",
          eyebrow: "Selected reference body",
          lightTimeLabel: "Light-time context",
          meanDistanceLabel: "Mean Sun distance",
        },
        sunOrigin: "0 {unit} · origin; excluded from log transform",
        trackSummary: "{distance} {unit} · {position}% of this {mode} track",
        title: "Mean distance from the Sun",
        valueWithUnit: "{value} {unit}",
      },
      intro:
        "See why one scale cannot show the inner and outer planets equally well. This reviewed model compares {provider} mean distances from the Sun; it does not pretend to show where the planets are right now.",
      metadataDescription:
        "Compare reviewed mean Sun distances across the eight planets in linear and logarithmic views without implying current planetary positions.",
      metadataTitle: "Solar System Distance Explorer",
      model: {
        assumptionsTitle: "Assumptions",
        description:
          "The browser consumes a checked-in artifact produced by Lumina's Python astronomy domain. It switches only between precomputed linear and logarithmic positions; it does not recalculate orbital science in the renderer.",
        limitationsTitle: "Limitations",
        linearMappingLabel: "Linear mapping",
        logMappingLabel: "Log mapping",
        title: "Model and limitations",
      },
      sources: {
        description:
          "Source scope is kept beside the model so a reference value is never mistaken for live ephemeris data.",
        title: "Sources",
      },
      title: "Solar System Distance Explorer",
    },
    systemScaleCompare: {
      backToExplore: "← Explore catalogue",
      defaultComparison: {
        description:
          "This table is the no-JavaScript numeric baseline for {solar}, {exoplanet}, and {voyager}. Each row keeps its reviewed scientific quantity attached to the value.",
        headers: {
          earthMultiple: "1 {unit} arithmetic multiple",
          reference: "Reference",
          scientificQuantity: "Scientific quantity",
          value: "Value",
        },
        title: "Default comparison data",
      },
      eyebrow: "Advanced compare · Phase 5B",
      explorer: {
        card: {
          openSourceExplorer: "Open source explorer →",
          quantityLabel: "Quantity",
          reviewedValueLabel: "Reviewed numeric value",
          sampleEpochLabel: "Sample epoch",
          source: "Source ↗",
        },
        description:
          "A shared unit makes numeric scale comparison possible. It does not make mean Sun distance, orbit semi-major axis, and heliocentric vector magnitude interchangeable. Lumina keeps each definition and source attached.",
        laneAriaLabel: "{name} shared scale reference",
        laneSummary:
          "{value} {unit} · {position}% of shared {mode} display · numeric length is {ratio}× the {unit} arithmetic reference",
        modelEyebrow: "Cross-model comparison · {modelVersion}",
        referenceSelect: {
          exoplanetLabel: "Exoplanet orbital reference",
          optionValue: "{name} · {value} {unit}",
          solarLabel: "Solar System reference",
          voyagerLabel: "Voyager annual reference",
        },
        scaleAriaLabel: "Shared comparison scale",
        scaleModes: {
          linearAction: "Linear {unit} scale",
          linearDescription:
            "Linear display maps every numeric length against the same {maximum} {unit} maximum. Small orbital references will cluster near zero by design.",
          linearName: "linear",
          logAction: "Log {unit} scale",
          logDescription:
            "Log display maps the complete reviewed {minimum}–{maximum} {unit} domain. Spacing is a visualization transform, not physical placement between systems.",
          logName: "log",
        },
        selectedDefinitionsTitle: "Selected reference definitions",
        title: "Three {unit}-valued references, three different scientific meanings",
      },
      intro:
        "Put three reviewed AU-valued references on one scale without erasing what each number means. Shared units support arithmetic comparison; they do not turn different scientific quantities into the same measurement.",
      inventory: {
        description:
          "All {count} selectable references are listed here so the interactive controls never become the only way to inspect the underlying values.",
        headers: {
          group: "Group",
          quantity: "Quantity",
          reference: "Reference",
          source: "Source",
          value: "{unit} value",
        },
        summary: "Show all {count} {unit} references",
        title: "Complete reviewed reference inventory",
      },
      metadataDescription:
        "Compare reviewed Solar System mean distances, exoplanet semi-major axes, and Voyager heliocentric vector magnitudes on a labelled shared AU scale.",
      metadataTitle: "System Scale Compare",
      model: {
        assumptionsTitle: "Assumptions",
        description:
          "Python composes only positive AU-valued outputs from the three already-reviewed Phase 5B artifacts. React selects among those precomputed outputs; it does not reinterpret source science or derive cross-model similarity.",
        limitationsTitle: "Limitations",
        title: "Composition model and limits",
      },
      title: "System Scale Compare",
    },
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
  simulationLabs: {
    blackHoleRelativity: {
      actions: {
        calculate: "Calculate Schwarzschild model",
        calculating: "Calculating…",
        reset: "Reset synthetic preset",
      },
      controls: {
        description:
          "The mass control is the IAU nominal-solar gravitational-parameter ratio, not a measured mass in kilograms. The radius control selects a hypothetical accelerated observer held static outside the horizon; it is not a free-fall or orbital state.",
        massAriaLabel: "Black-hole nominal solar mass scale",
        massLabel: "Nominal-solar GM scale",
        radiusAriaLabel: "Static observer radius in Schwarzschild radii",
        radiusLabel: "Static observer radius Rₛ",
        title: "Schwarzschild teaching controls",
      },
      failures: {
        emptyInput: "One or more controls are empty or outside the reviewed v1 domain.",
        outOfDomain:
          "The requested values are outside the reviewed Schwarzschild v1 domain. Lumina does not clamp or reinterpret them.",
        rejected:
          "The canonical Black-Hole / Relativity Lab rejected this state. The last valid result remains visible.",
        resultMismatch:
          "The returned result did not match the requested versioned relativity state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      header: {
        eyebrow: "Phase 7 · Schwarzschild landmark + static-clock teaching model",
        intro:
          "Explore an ideal non-rotating, uncharged Schwarzschild black hole through source-backed landmark radii and a hypothetical static clock. This is not ray tracing, an observed black-hole reconstruction, an orbit simulator, or an accretion model.",
        title: "Black-Hole / Relativity Lab",
      },
      invalidState: {
        description: "The reviewed synthetic Schwarzschild preset is shown instead.",
        inline:
          "Shared relativity state rejected. The reviewed synthetic Schwarzschild preset is shown instead.",
        title: "Shared relativity state rejected",
      },
      landmarks: {
        caption: "Canonical landmark radii returned by Python.",
        description:
          "Horizon, photon sphere, and ISCO are distinct returned geometric/geodesic landmarks. The selected static observer is not following those geodesics.",
        headers: {
          interpretation: "Interpretation",
          landmark: "Landmark",
          radiusM: "Areal radius m",
          radiusRs: "Radius Rₛ",
        },
        schematicAriaLabel: "Returned Schwarzschild landmark areal-radius schematic",
        schematicCaption:
          "Presentation-only scaling of API-returned Schwarzschild areal radii. This is not proper radial distance, ray tracing, a black-hole shadow, an accretion image, or a direct observation. The browser does not calculate relativity results.",
        selectedStaticObserver: "Selected static observer",
        tableAriaLabel: "Scrollable Schwarzschild landmark table",
        title: "Schwarzschild landmarks",
      },
      metadataDescription:
        "Explore a deterministic Schwarzschild teaching model with Python-owned event-horizon, photon-sphere, ISCO, static-clock, and gravitational-redshift calculations.",
      metadataTitle: "Black-Hole / Relativity Lab",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed browser state: nominal-solar GM scale {mass}; static observer at {radius} Rₛ.",
        equations: "Reviewed model equations",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        clock: {
          farAwayInterval: "Far-away interval per local interval",
          frequencyRatio: "Frequency at infinity / local emitted frequency",
          properTimeRate: "Local proper-time rate / asymptotic time",
          redshift: "Gravitational redshift z",
          title: "Static clock and redshift",
        },
        controlDisclosure:
          "The mass control is the IAU nominal-solar gravitational-parameter ratio, not a measured mass in kilograms. The selected observer is an accelerated hoverer, not a freely falling or orbiting observer.",
        eyebrow: "Phase 7 / Black-Hole / Relativity Lab",
        intro:
          "Explore a source-backed Schwarzschild landmark and static-clock teaching model. Lumina's Python astronomy domain owns all horizon, photon-sphere, ISCO, clock-rate, and gravitational-redshift calculations.",
        requestedStateTitle: "Requested teaching state",
        result: {
          gravitationalParameter: "Gravitational parameter",
          modelVersion: "Model version",
          schwarzschildRadius: "Schwarzschild/event-horizon areal radius",
          selectedObserverRadius: "Selected static-observer areal radius",
          title: "Canonical Schwarzschild result",
        },
        stateLabels: {
          mass: "Nominal-solar GM scale",
          massUnit: "nominal solar masses",
          staticObserverRadius: "Static observer areal radius",
        },
        tableCaption: "Python-returned Schwarzschild landmarks.",
        tableHeaders: {
          landmark: "Landmark",
          meaning: "Meaning",
          radiusM: "Radius m",
          radiusRs: "Radius Rₛ",
        },
        unavailableDescription:
          "No browser-generated horizon, photon-sphere, ISCO, clock-rate, or redshift value is substituted.",
        unavailableTitle: "No canonical result available",
      },
      result: {
        clock: {
          farAwayInterval: "Far-away interval per local interval",
          frequencyRatio: "Frequency at infinity / local frequency",
          redshift: "Gravitational redshift z",
          selectedRadius: "Selected areal radius",
          title: "Static clock and infinity-referenced redshift",
        },
        description:
          "Model {modelVersion}. All physical values below were returned by the canonical Python model.",
        metrics: {
          clockRate: "Static clock rate / infinity",
          eventHorizonRadius: "Event-horizon areal radius",
          gravitationalParameter: "Gravitational parameter",
          redshift: "Gravitational redshift z",
        },
        title: "Canonical Schwarzschild result",
        unavailableDescription:
          "No browser-generated horizon, photon-sphere, ISCO, clock-rate, or gravitational-redshift value is substituted.",
        unavailableTitle: "No canonical result available",
      },
    },
    eclipseSimulator: {
      actions: {
        calculate: "Calculate eclipse geometry",
        calculating: "Calculating…",
        reset: "Reset Dallas 2024 reference",
      },
      controls: {
        description:
          "Offline v1 supports {minimumUtc} through {maximumUtc}. The date bound prevents silent Earth-orientation extrapolation.",
        fields: {
          elevation: "Elevation",
          latitude: "Latitude",
          longitude: "Longitude",
          utc: "UTC date and time",
        },
        fieldAriaLabels: {
          elevation: "Elevation m",
          latitude: "Latitude deg",
          longitude: "Longitude deg",
          utc: "UTC date and time",
        },
        title: "UTC instant and observer",
      },
      event: {
        centralBegin: "Central phase begins",
        centralEnd: "Central phase ends",
        maximum: "Maximum alignment",
        noEvent:
          "No local eclipse event is returned because the requested instant is outside a local geometric eclipse.",
        partialBegin: "Partial begins",
        partialEnd: "Partial ends",
        title: "Approximate local {classification} event",
      },
      failures: {
        invalidInput:
          "UTC time or observer location is empty, non-finite, or outside the reviewed v1 range.",
        rejected:
          "The canonical Eclipse Simulator rejected this state. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned eclipse state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      figure: {
        caption:
          "Presentation-only apparent-disk sketch normalized from the returned angular radii and center separation. The canonical classification and obscuration are computed by Python, not this SVG.",
      },
      header: {
        eyebrow: "Phase 7 · offline topocentric solar geometry",
        intro:
          "Explore the apparent Sun–Moon geometry for one UTC instant and observer. V1 is an educational offline solar-eclipse model, not a precision eclipse-navigation service.",
        title: "Eclipse Simulator",
      },
      horizon: {
        above: "Sun above horizon",
        below: "Sun below horizon",
      },
      invalidState: {
        description: "The reviewed Dallas 2024 reference preset is shown instead.",
        inline:
          "Shared eclipse state rejected. The reviewed Dallas 2024 reference preset is shown instead.",
        title: "Shared eclipse state rejected",
      },
      metadataDescription:
        "Explore source-backed offline topocentric solar-eclipse geometry, approximate local contacts, and NASA viewing-safety guidance.",
      metadataTitle: "Eclipse Simulator",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed browser state: {utc}; latitude {latitude}°, longitude {longitude}°.",
        limitations: "Limitations",
        monthlyQuestion: "Why is there not a solar eclipse every month?",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
      },
      noScript: {
        eventLabels: {
          centralBegin: "Central phase begins",
          centralEnd: "Central phase ends",
          maximum: "Maximum",
          partialBegin: "Partial begins",
          partialEnd: "Partial ends",
        },
        eventTitle: "Approximate local contacts",
        eyebrow: "Phase 7 / Eclipse Simulator",
        intro:
          "Explore offline topocentric solar-eclipse geometry. Lumina's Python astronomy domain owns the ephemeris, apparent disk sizes, overlap, classification, and approximate contact search.",
        modelLimitations: "Model limitations",
        modelVersion: "Model version",
        monthlyQuestion: "Why eclipses are not monthly",
        noEvent: "No local eclipse event is returned for this instant.",
        observerLocation: "Latitude {latitude}°, longitude {longitude}°, elevation {elevation} m.",
        observerTitle: "Observer state",
        resultCaption: "Canonical Eclipse Simulator result from Lumina's astronomy API.",
        resultLabels: {
          centerSeparation: "Center separation",
          moonRadius: "Moon angular radius",
          obscuration: "Geometric Solar-disk obscuration",
          phase: "Local phase",
          shadow: "Shadow interpretation",
          sunAltitude: "Geometric Sun altitude",
          sunRadius: "Sun angular radius",
        },
        resultTitle: "Topocentric apparent geometry",
        unavailableDescription: "No browser-generated eclipse geometry is substituted.",
        unavailableTitle: "No canonical result available",
        utcInstant: "UTC instant",
      },
      result: {
        description:
          "Model {modelVersion}. Geometric obscuration is apparent Solar-disk area overlap; it is not irradiance, perceived brightness, or a safety state.",
        labels: {
          centerSeparation: "Center separation",
          horizon: "Geometric horizon",
          moonRadius: "Moon angular radius",
          obscuration: "Geometric obscuration",
          phase: "Local phase",
          shadow: "Shadow interpretation",
          sunAltitude: "Geometric Sun altitude",
          sunRadius: "Sun angular radius",
        },
        title: "Topocentric apparent geometry",
        unavailableDescription: "No browser-generated eclipse geometry or timing is substituted.",
        unavailableTitle: "No canonical result available",
      },
      safety: {
        link: "Read NASA's eclipse viewing safety guidance.",
        title: "Solar-viewing safety",
      },
    },
    impactSimulator: {
      actions: {
        calculate: "Calculate teaching model",
        calculating: "Calculating…",
        reset: "Reset synthetic preset",
      },
      controls: {
        description:
          "V1 deliberately starts at a 1.5 km diameter and covers only solid sedimentary or crystalline rock. Smaller atmospheric-entry and airburst cases are outside this model.",
        fields: {
          angle: "Angle degrees",
          density: "Density kg/m³",
          diameter: "Diameter m",
          speed: "Speed km/s",
          target: "Solid-rock target",
        },
        fieldAriaLabels: {
          angle: "Impact angle degrees above local horizontal",
          density: "Impactor density kg per cubic metre",
          diameter: "Impactor diameter m",
          speed: "Impact speed km per second",
          target: "Target material",
        },
        title: "Synthetic impact controls",
      },
      ejecta: {
        description:
          "These returned radii are location-free lower-bound deposit estimates. They are not casualty, debris-lethality, infrastructure, evacuation, or property-damage zones.",
        table: {
          caption: "Returned location-free lower-bound deposit radii.",
          headers: {
            radius: "Radius m",
            thickness: "Deposit thickness m",
          },
          scrollAriaLabel: "Scrollable ejecta thickness table",
        },
        title: "Lower-bound ejecta deposit radii",
      },
      failures: {
        invalidInput: "One or more controls are empty or outside the reviewed v1 domain.",
        outOfDomain:
          "The requested values are outside the reviewed large solid-rock v1 domain. Lumina does not clamp or reinterpret them.",
        rejected:
          "The canonical Impact Simulator rejected this state. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned impact state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      figure: {
        ariaLabel: "Returned crater and ejecta relative scale",
        caption:
          "Presentation-only relative scaling of returned radii. The browser does not calculate impact energy, crater dimensions, coefficient sensitivity, or ejecta thickness.",
        depositRadius: "{thickness} m lower-bound deposit radius",
        finalCraterRadius: "Final crater radius",
      },
      header: {
        eyebrow: "Phase 7 · large solid-rock Earth-impact teaching model",
        intro:
          "Explore how a synthetic large impactor maps to source-backed kinetic energy, crater-size sensitivity, and lower-bound ejecta deposit radii. This lab has no map, target location, casualty model, emergency-planning output, or optimization.",
        title: "Impact Simulator",
      },
      invalidState: {
        description: "The reviewed synthetic large-impactor preset is shown instead.",
        inline: "Shared impact state rejected. The reviewed synthetic preset is shown instead.",
        title: "Shared impact state rejected",
      },
      metadataDescription:
        "Explore a deterministic large solid-rock Earth-impact teaching model with Python-owned kinetic energy, crater scaling sensitivity, and lower-bound ejecta thickness radii.",
      metadataTitle: "Impact Simulator",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed browser state: {diameter} m diameter, {density} kg/m³, {speed} km/s, {angle}°, {target}.",
        equations: "Reviewed model equations",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        angleUnit: "degrees",
        ejectaCaption: "Location-free Python-returned lower-bound deposit radii.",
        ejectaTitle: "Lower-bound ejecta thickness radii",
        eyebrow: "Phase 7 / Impact Simulator",
        intro:
          "Explore a source-backed large solid-rock Earth-impact teaching model. Lumina's Python astronomy domain owns all energy, crater-scaling, coefficient-sensitivity, and ejecta-thickness calculations.",
        requestedTitle: "Requested synthetic impact",
        result: {
          bestFinalCrater: "Best final crater",
          bestTransientCrater: "Best transient crater",
          impactorMass: "Impactor mass",
          kineticEnergy: "Kinetic energy",
          modelVersion: "Model version",
          title: "Canonical educational result",
          tntContext: "TNT-equivalent energy context",
          tntDescription:
            "TNT equivalence is descriptive unit context only, not an equivalent blast-damage footprint.",
        },
        sensitivityCaption: "Python-returned low, best, and high coefficient sensitivity.",
        sensitivityTitle: "Crater coefficient sensitivity",
        stateLabels: {
          angle: "Angle above local horizontal",
          density: "Impactor density",
          diameter: "Diameter",
          speed: "Speed",
          target: "Target material",
        },
        unavailableDescription:
          "No browser-generated energy, crater diameter, coefficient sensitivity, or ejecta range is substituted.",
        unavailableTitle: "No canonical result available",
      },
      result: {
        description:
          "Model {modelVersion}. Target density: {targetDensity} kg/m³. All scientific values below were returned by the canonical Python model.",
        labels: {
          bestFinalCrater: "Best final crater diameter",
          impactorMass: "Impactor mass",
          kineticEnergy: "Kinetic energy",
          tntContext: "TNT-equivalent energy context",
        },
        title: "Canonical educational result",
        tntDescription:
          "TNT equivalence is descriptive unit context only. It is not a blast-damage equivalence or a location-specific effect prediction.",
        unavailableDescription:
          "No browser-generated energy, crater dimensions, coefficient sensitivity, or ejecta ranges are substituted.",
        unavailableTitle: "No canonical result available",
      },
      sensitivity: {
        caption:
          "Canonical low, best, and high scaling-coefficient sensitivity returned by Python.",
        headers: {
          classification: "Class",
          finalDiameter: "Final diameter m",
          scalingCoefficient: "Scaling coefficient",
          transientDiameter: "Transient diameter m",
        },
        scrollAriaLabel: "Scrollable crater coefficient-sensitivity table",
        title: "Crater scaling-coefficient sensitivity",
      },
      targets: {
        crystallineRock: "Crystalline rock",
        sedimentaryRock: "Sedimentary rock",
      },
    },
    planetarySystemBuilder: {
      actions: {
        addPlanet: "Add planet",
        calculate: "Calculate system",
        calculating: "Calculating…",
        remove: "Remove",
        reset: "Reset illustrative preset",
      },
      classifications: {
        exteriorReferenceHz: "Exterior to reference HZ",
        insideReferenceHz: "Inside modeled reference HZ",
        interiorReferenceHz: "Interior to reference HZ",
        noPairwiseHillWarning: "No pairwise Hill warning",
        pairwiseCloseWarning: "Pairwise close warning",
      },
      controls: {
        description:
          "Stellar mass, luminosity, and effective temperature are independent educational controls. V1 does not claim every allowed combination is a self-consistent stellar evolution model. Planet order is explicit; Lumina does not silently sort it.",
        fields: {
          effectiveTemperature: "Effective temperature",
          planetAxis: "Semimajor axis AU",
          planetMass: "Mass M⊕",
          stellarLuminosity: "Stellar luminosity",
          stellarMass: "Stellar mass",
        },
        fieldAriaLabels: {
          effectiveTemperature: "Stellar effective temperature K",
          planetAxis: "Planet {index} semimajor axis AU",
          planetMass: "Planet {index} mass Mearth",
          removePlanet: "Remove planet {index}",
          stellarLuminosity: "Stellar luminosity Lsun",
          stellarMass: "Stellar mass Msun",
        },
        orderedPlanetsDescription:
          "Enter planets from smallest to largest semimajor axis. Equal or descending axes are rejected rather than reordered.",
        orderedPlanetsLegend: "Ordered planets",
        planetLegend: "Planet {index}",
        title: "Synthetic system controls",
      },
      failures: {
        invalidInput: "One or more controls are empty or outside the reviewed v1 domain.",
        outOfDomain:
          "The requested star or ordered planet inputs are outside the reviewed v1 domain. Semimajor axes must already be strictly increasing.",
        rejected:
          "The canonical Planetary System Builder rejected this state. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned builder state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      figure: {
        ariaLabel:
          "Returned planetary-system placement diagram with modeled reference habitable-zone band",
        caption:
          "Presentation-only placement of returned semimajor axes and returned HZ edges on a shared screen axis. The browser does not calculate Keplerian periods, HZ boundaries, mutual-Hill radii, separations, or pairwise assessments.",
        displayExtent: "{extent} AU display extent",
        hzLabel: "modeled reference HZ",
        scrollAriaLabel: "Scrollable returned planetary-system placement diagram",
        starLabel: "star",
      },
      header: {
        eyebrow: "Phase 7 · deterministic multi-planet teaching model",
        intro:
          "Build one synthetic star with one to eight circular, coplanar, non-interacting planets. Compare Python-owned Keplerian periods, a published conservative reference HZ band, and limited adjacent-pair mutual-Hill context without making a long-term stability claim.",
        title: "Planetary System Builder",
      },
      invalidState: {
        description: "The reviewed illustrative three-planet preset is shown instead.",
        inline:
          "Shared planetary-system state rejected. The reviewed illustrative three-planet preset is shown instead.",
        title: "Shared planetary-system state rejected",
      },
      metadataDescription:
        "Build a deterministic circular non-interacting planetary system and inspect source-backed Keplerian periods, a conservative reference habitable-zone band, and limited pairwise mutual-Hill spacing diagnostics.",
      metadataTitle: "Planetary System Builder",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentStateMany:
          "Current committed browser state: {count} planets; stellar controls {mass} M☉, {luminosity} L☉, {temperature} K.",
        currentStateOne:
          "Current committed browser state: {count} planet; stellar controls {mass} M☉, {luminosity} L☉, {temperature} K.",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        hzRange: "Modeled reference HZ: {inner} AU to {outer} AU.",
        intro:
          "Build a circular, coplanar, non-interacting teaching system. Lumina's Python astronomy domain owns every Keplerian period, reference habitable-zone boundary, and pairwise mutual-Hill diagnostic.",
        eyebrow: "Phase 7 / Planetary System Builder",
        modelVersion: "Model version",
        pairwiseCaption: "Returned adjacent-pair mutual-Hill spacing diagnostics.",
        pairwiseHeaders: {
          assessment: "Assessment",
          interpretation: "Interpretation",
          pair: "Pair",
          separation: "Separation Δ",
        },
        planetLine: "Planet {index}: {mass} M⊕ at {axis} AU",
        planetsCaption: "Returned planet periods and reference-HZ placement.",
        requestedTitle: "Requested teaching system",
        resultTitle: "Canonical system result",
        singlePlanet: "A single-planet system has no adjacent-pair mutual-Hill diagnostic.",
        stateLabels: {
          effectiveTemperature: "Effective temperature",
          stellarLuminosity: "Stellar luminosity",
          stellarMass: "Stellar mass",
        },
        unavailableDescription:
          "No browser-generated periods, HZ boundaries, or Hill diagnostics are substituted.",
        unavailableTitle: "No canonical result available",
      },
      pairwise: {
        caption:
          "Pairwise mutual-Hill spacing diagnostic only; not a whole-system stability result.",
        headers: {
          assessment: "Assessment",
          mutualHillRadius: "Mutual Hill radius AU",
          pair: "Pair",
          referenceThreshold: "Reference threshold",
          separation: "Separation Δ",
        },
        interpretation: "Pair {inner}–{outer}: {interpretation}",
        scrollAriaLabel: "Scrollable pairwise mutual-Hill table",
        singlePlanet: "This single-planet system has no adjacent-pair mutual-Hill diagnostic.",
      },
      planets: {
        caption: "Canonical Python-owned planet periods and reference-HZ placement.",
        headers: {
          axis: "Semimajor axis AU",
          hzPlacement: "Reference-HZ placement",
          mass: "Mass M⊕",
          period: "Period days",
          planet: "Planet",
        },
        scrollAriaLabel: "Scrollable returned planet table",
      },
      result: {
        description:
          "Model {modelVersion}. V1 returns one deterministic record per planet and one pairwise diagnostic per adjacent pair; it performs no n-body integration.",
        furtherStabilityAnalysis:
          "Further dynamical analysis is required for long-term multi-planet behavior.",
        labels: {
          hzInner: "Reference HZ inner edge",
          hzOuter: "Reference HZ outer edge",
          pairwiseDiagnostics: "Pairwise diagnostics",
          returnedPlanets: "Returned planets",
        },
        title: "Canonical system result",
        unavailableDescription:
          "No browser-generated fallback periods, HZ boundaries, or Hill diagnostics are substituted.",
        unavailableTitle: "No canonical result available",
      },
    },
    rocketMissionDesigner: {
      actions: {
        addStage: "Add stage",
        calculate: "Calculate ideal model",
        calculating: "Calculating…",
        remove: "Remove",
        reset: "Reset synthetic preset",
      },
      controls: {
        description:
          "Stages are entered in ignition order, bottom/first through top/final. The selected body changes only the returned surface-gravity TWR teaching reference. It does not change the specific-impulse convention or turn this into a trajectory simulation.",
        fields: {
          gravityReference: "Surface-gravity reference",
          payloadMass: "Payload mass",
          reference: "Velocity reference",
          stageDryMass: "Dry mass kg",
          stagePropellantMass: "Propellant kg",
          stageSpecificImpulse: "Specific impulse s",
          stageThrust: "Thrust N",
        },
        fieldAriaLabels: {
          gravityReference: "Surface-gravity reference body",
          payloadMass: "Payload mass kg",
          reference: "Educational velocity reference",
          removeStage: "Remove stage {index}",
          stageDryMass: "Stage {index} dry mass kg",
          stagePropellantMass: "Stage {index} propellant mass kg",
          stageSpecificImpulse: "Stage {index} specific impulse s",
          stageThrust: "Stage {index} thrust N",
        },
        stagesDescription:
          "Each stage has positive dry mass, propellant mass, thrust, and specific impulse. Stages are never silently reordered, merged, or optimized.",
        stagesLegend: "Stages in ignition order",
        stageLegend: "Stage {index}",
        title: "Teaching vehicle controls",
      },
      failures: {
        invalidInput: "One or more controls are empty or outside the reviewed v1 domain.",
        outOfDomain:
          "The requested payload or stage values are outside the reviewed v1 input bounds. Lumina does not clamp, reorder, or optimize them.",
        rejected:
          "The canonical Rocket / Mission Designer rejected this state. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned rocket state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      figure: {
        ariaLabel: "Returned payload sensitivity plot",
        caption:
          "Presentation-only plot of the five returned payload-sensitivity points. The browser does not calculate payload delta-v, stage delta-v, TWR, mass ratios, or reference differences.",
        payloadMultiplierAxis: "submitted payload multiplier",
        scrollAriaLabel: "Scrollable returned payload-sensitivity plot",
      },
      gravityBodies: {
        earth: "Earth",
        mars: "Mars",
        moon: "Moon",
      },
      header: {
        eyebrow: "Phase 7 · deterministic ideal staged-rocket teaching model",
        intro:
          "Explore how stage masses, specific impulse, thrust, payload, and a selected surface-gravity reference relate inside one deliberately idealized model. This lab does not determine mission feasibility, real launch capability, or operational flight plans.",
        title: "Rocket / Mission Designer",
      },
      invalidState: {
        description: "The reviewed synthetic two-stage teaching preset is shown instead.",
        inline:
          "Shared rocket state rejected. The reviewed synthetic two-stage preset is shown instead.",
        title: "Shared rocket state rejected",
      },
      metadataDescription:
        "Explore a deterministic ideal staged-rocket teaching model with Python-owned delta-v, surface-gravity TWR references, payload sensitivity, mass fractions, and carefully bounded velocity-reference comparisons.",
      metadataTitle: "Rocket / Mission Designer",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentStateMany:
          "Current committed browser state: {count} stages, {payload} kg payload, {gravity} surface-gravity reference.",
        currentStateOne:
          "Current committed browser state: {count} stage, {payload} kg payload, {gravity} surface-gravity reference.",
        description:
          "V1 is an educational ideal staged-rocket model, not an engineering design, trajectory solver, mission planner, launch-capability assessment, or hazardous construction guide.",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        inputCaption: "Submitted stages in ignition order.",
        inputHeaders: {
          dryMass: "Dry mass kg",
          isp: "Isp s",
          propellant: "Propellant kg",
          stage: "Stage",
          thrust: "Thrust N",
        },
        intro:
          "Explore a source-backed ideal staged-rocket teaching model. Lumina's Python astronomy domain owns stage bookkeeping, ideal delta-v, surface-gravity TWR references, payload sensitivity, and velocity-reference comparisons.",
        eyebrow: "Phase 7 / Rocket / Mission Designer",
        modelVersion: "Model version",
        payloadCaption: "Python-returned payload trade-off points.",
        payloadDescription:
          "These returned points keep the submitted stages fixed. They are not an optimizer or design recommendation.",
        payloadTitle: "Fixed payload sensitivity",
        referenceDifference: "Ideal delta-v difference",
        referenceTitle: "Educational velocity reference",
        requestedTitle: "Requested teaching vehicle",
        resultStageHeaders: {
          burnoutMass: "Burnout mass kg",
          idealDeltaV: "Ideal Δv m/s",
          ignitionMass: "Ignition mass kg",
          stage: "Stage",
          twr: "Surface-reference TWR",
        },
        resultTitle: "Canonical ideal staged result",
        resultLabels: {
          launchMass: "Launch mass",
          payloadFraction: "payload fraction",
          propellantFraction: "propellant fraction",
          selectedGravity: "Selected surface gravity",
          totalIdealDeltaV: "Total ideal delta-v",
        },
        stageCaption: "Python-returned stage results.",
        stateLabels: {
          gravityBody: "Surface-gravity reference body",
          payload: "Payload",
          reference: "Velocity reference",
        },
        unavailableDescription:
          "No browser-generated delta-v, staging, TWR, payload trade-off, or mission comparison is substituted.",
        unavailableTitle: "No canonical result available",
      },
      payload: {
        caption: "Fixed returned payload multipliers with the submitted stages unchanged.",
        description:
          "The five returned points keep the submitted stages unchanged. They are an educational sensitivity view, not an optimizer or recommendation.",
        headers: {
          payload: "Payload kg",
          multiplier: "Payload multiplier",
          totalDeltaV: "Total ideal Δv m/s",
        },
        scrollAriaLabel: "Scrollable returned payload-sensitivity table",
        title: "Fixed payload sensitivity",
      },
      references: {
        earthOrbit: "NASA Glenn approximate 200-mile circular-orbit example",
        earthEscape: "JPL Earth equatorial escape-speed reference",
        marsEscape: "JPL Mars equatorial escape-speed reference",
      },
      referenceResult: {
        labels: {
          difference: "Ideal Δv difference",
          ratio: "Ideal Δv/reference ratio",
          value: "Reference value",
        },
        title: "Educational velocity reference",
      },
      result: {
        description:
          "Model {modelVersion}. The selected surface-gravity reference is {gravity} m/s². All values below are returned by the canonical Python model.",
        labels: {
          launchMass: "Launch mass",
          payloadFraction: "Payload fraction",
          propellantFraction: "Propellant fraction",
          totalIdealDeltaV: "Total ideal delta-v",
        },
        title: "Canonical ideal staged result",
        unavailableDescription:
          "No browser-generated fallback delta-v, staging, TWR, payload sensitivity, or mission comparison is substituted.",
        unavailableTitle: "No canonical result available",
      },
      stages: {
        caption: "Canonical Python-owned ideal staged-rocket outputs in ignition order.",
        headers: {
          burnoutMass: "Burnout kg",
          dryMass: "Dry kg",
          idealDeltaV: "Ideal Δv m/s",
          ignitionMass: "Ignition kg",
          massRatio: "Mass ratio",
          propellantMass: "Propellant kg",
          stage: "Stage",
          twr: "Surface-reference TWR",
        },
        scrollAriaLabel: "Scrollable returned stage table",
      },
    },
    orbitSandbox: {
      actions: {
        calculate: "Calculate orbit",
        calculating: "Calculating…",
        reset: "Reset Earth-like circular preset",
      },
      classification: {
        bound: "Bound",
        collision: "Collision",
        escape: "Escape",
        parabolicNear: "Near-parabolic",
      },
      controls: {
        description:
          "Units are SI. Browser checks cover only finite field ranges; derived physical and numerical-domain constraints are enforced by the canonical API and are never silently clamped.",
        title: "Initial state and integration window",
      },
      failures: {
        invalidInput:
          "One or more inputs are empty, non-finite, or outside the published coarse range.",
        rejected:
          "The canonical Orbit Sandbox rejected this configuration. Check the speed, central-body compactness, secondary mass, time step, and trajectory-point budget. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned orbit state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      fields: {
        centralMass: "Central mass",
        centralRadius: "Central collision radius",
        duration: "Simulation duration",
        positionX: "Initial x position",
        positionY: "Initial y position",
        secondaryMass: "Secondary mass",
        timeStep: "Integration time step",
        velocityX: "Initial x velocity",
        velocityY: "Initial y velocity",
      },
      header: {
        eyebrow: "Phase 7 · deterministic simulation",
        intro:
          "Explore planar Newtonian relative two-body motion from an explicit initial position and velocity. Analytic initial elements and the velocity-Verlet trajectory are calculated only by Lumina's canonical Python astronomy domain.",
        title: "Orbit Sandbox",
      },
      invalidState: {
        description:
          "The malformed or unsupported shared state was replaced with the reviewed default.",
        inline: "Shared state rejected. The reviewed Earth-like default is shown instead.",
        title: "Shared orbit state rejected",
      },
      metadataDescription:
        "Explore a reviewed deterministic Newtonian two-body model with explicit orbital elements, collision handling, and numerical drift diagnostics.",
      metadataTitle: "Orbit Sandbox",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed state: {xPosition} m x-position, {yVelocity} m/s y-velocity, {duration} s duration.",
        equations: "Equations",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        collisionTimeLabel: "Collision time in requested window",
        currentStateTitle: "Current input state",
        eyebrow: "Phase 7 / Orbit Sandbox",
        intro:
          "Explore a deterministic planar Newtonian two-body model. The canonical orbital elements and trajectory are calculated by Lumina's server-side astronomy domain, not by this page.",
        modelTitle: "Model, assumptions, limitations, and provenance",
        stateLabels: {
          centralMass: "Central mass",
          centralRadius: "Central collision radius",
          duration: "Duration",
          initialPosition: "Initial position",
          initialVelocity: "Initial velocity",
          secondaryMass: "Secondary mass",
          timeStep: "Time step",
        },
      },
      notApplicable: "Not applicable",
      preview: {
        description:
          "Showing {shown} of {total} returned samples at a fixed display stride, always including the final sample. This table does not interpolate or recalculate the orbit.",
        headers: {
          distance: "Distance (m)",
          speed: "Speed (m/s)",
          time: "Time (s)",
          x: "x (m)",
          y: "y (m)",
        },
        summary: "Trajectory data preview",
      },
      result: {
        description:
          "Model {modelVersion}. The conic elements describe the initial idealized state; the plotted forward trajectory is a separate finite-step numerical result with its own drift diagnostics.",
        labels: {
          apoapsis: "Apoapsis",
          classification: "Classification",
          collisionTime: "Collision time",
          eccentricity: "Eccentricity",
          maxAngularMomentumDrift: "Max angular-momentum drift",
          maxSpecificEnergyDrift: "Max specific-energy drift",
          periapsis: "Periapsis",
          period: "Period",
          semiMajorAxis: "Semi-major axis",
          specificAngularMomentum: "Specific angular momentum",
          specificOrbitalEnergy: "Specific orbital energy",
          trajectorySamples: "Trajectory samples",
        },
        model: "Model {modelVersion}",
        noScriptCaption: "Canonical Newtonian two-body result from Lumina's astronomy API.",
        noScriptTitle: "Canonical result",
        notReached: "Not reached in requested window",
        title: "Canonical orbit result",
        unavailableDescription: "No browser-generated fallback orbit is substituted.",
        unavailableNoScriptDescription: "No substitute or browser-generated orbit was fabricated.",
        unavailableNoScriptTitle: "Calculation unavailable",
        unavailableTitle: "No canonical result available",
      },
      trajectory: {
        caption:
          "Coordinates are uniformly normalized from the returned relative positions. Filled point = start; outlined point = final returned sample. Central-body marker is deliberately enlarged and not to physical scale. Plot half-span: {halfSpan} m.",
        description:
          "A display-normalized plot of {count} API-returned trajectory samples. The central body marker is enlarged for legibility and is not to physical scale.",
        title: "Returned relative trajectory",
      },
    },
    radialVelocity: {
      actions: {
        calculate: "Calculate radial velocity",
        calculating: "Calculating…",
        reset: "Reset synthetic circular preset",
      },
      controls: {
        description:
          "Inputs define a forward model. Real RV observations do not generally reveal inclination or true companion mass by themselves.",
        title: "Model inputs",
      },
      curve: {
        caption:
          "Horizontal position uses returned time; vertical position uses returned stellar reflex velocity. Returned range: {minimum} to {maximum} m/s. A flat line is the valid face-on result.",
        description:
          "Display-normalized plot of {count} API-returned stellar reflex-velocity samples over one orbital period. The browser does not solve the orbit.",
        title: "Returned stellar radial-velocity curve",
      },
      failures: {
        invalidInput:
          "One or more inputs are empty, non-finite, outside the reviewed range, or violate the companion-to-star mass-ratio boundary.",
        rejected:
          "The canonical Radial Velocity model rejected this configuration. Check masses, period, eccentricity, inclination, and phase angles. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned RV state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      fields: {
        argumentOfPeriastron: "Star's argument of periastron",
        companionMass: "Companion mass",
        eccentricity: "Eccentricity",
        inclination: "Inclination",
        meanAnomalyAtEpoch: "Mean anomaly at epoch",
        orbitalPeriod: "Orbital period",
        stellarMass: "Stellar mass",
      },
      header: {
        eyebrow: "Phase 7 / Radial Velocity Lab",
        intro:
          "Explore the star's deterministic Keplerian reflex signal, how inclination suppresses the observed velocity, and why radial velocity constrains a minimum mass rather than a unique true companion mass.",
        title: "Radial Velocity Lab",
      },
      invalidState: {
        description:
          "The malformed or unsupported shared state was replaced with the reviewed synthetic default.",
        title: "Shared radial-velocity state rejected",
      },
      metadataDescription:
        "Explore deterministic Keplerian stellar reflex velocity, inclination degeneracy, and exact spectroscopic mass-function limits.",
      metadataTitle: "Radial Velocity Lab",
      minimumMass: {
        description:
          "The conventional projected quantity Mp sin(i) is useful shorthand. Lumina also reports the exact edge-on minimum companion mass obtained from the spectroscopic mass function, which retains the companion mass in the denominator. They converge in the small-companion limit but are not treated as the same algebraic quantity in this model.",
        noScriptDescription:
          "Lumina reports both the conventional projected quantity Mp sin(i) and the exact edge-on minimum mass implied by the spectroscopic mass function. They are not treated as algebraically identical when the companion mass matters in the denominator.",
        noScriptTitle: "Minimum-mass interpretation",
        title: "Mp sin(i) and the exact minimum mass are related, not identical",
      },
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed state: stellar mass {stellarMass} kg, companion mass {companionMass} kg, period {period} s, eccentricity {eccentricity}, inclination {inclination}°.",
        equations: "Equations",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        currentStateTitle: "Current input state",
        intro:
          "Explore deterministic Keplerian stellar reflex velocity and the inclination–mass degeneracy. Lumina's Python astronomy domain solves the orbit and mass function; this page does not recreate those equations in the browser.",
        modelTitle: "Model, assumptions, limitations, and provenance",
        stateLabels: {
          argumentOfPeriastron: "Star's argument of periastron",
          companionMass: "Companion mass",
          eccentricity: "Eccentricity",
          inclination: "Inclination",
          meanAnomalyAtEpoch: "Mean anomaly at epoch",
          orbitalPeriod: "Orbital period",
          stellarMass: "Stellar mass",
        },
      },
      preview: {
        description:
          "Showing {shown} of {total} returned samples at a fixed display stride. This table does not interpolate or resynthesize radial velocity.",
        headers: {
          orbitalPhase: "Orbital phase",
          stellarRv: "Stellar RV (m/s)",
          time: "Time (s)",
        },
        summary: "RV data preview",
      },
      result: {
        labels: {
          edgeOnMinimumMass: "Exact edge-on minimum mass",
          inclinationProjection: "Inclination projection",
          massFunction: "Spectroscopic mass function",
          projectedMass: "Projected mass Mp sin(i)",
          samples: "Returned RV samples",
          semiAmplitude: "RV semi-amplitude K",
        },
        model: "Model {modelVersion}",
        noScriptCaption: "Canonical Radial Velocity result from Lumina's astronomy API.",
        noScriptLabels: {
          edgeOnMinimumMass: "Exact edge-on minimum companion mass",
          inclinationProjection: "Inclination projection",
          massFunction: "Spectroscopic mass function",
          projectedMass: "Projected companion mass Mp sin(i)",
          samples: "RV samples",
          semiAmplitude: "RV semi-amplitude",
        },
        title: "Canonical result",
        unavailableDescription:
          "Lumina does not fabricate an RV curve in the browser when the canonical service is unavailable.",
        unavailableNoScriptDescription:
          "No substitute or browser-generated RV curve was fabricated.",
        unavailableNoScriptTitle: "Calculation unavailable",
        unavailableTitle: "No canonical result available",
      },
    },
    relativityVisualizations: {
      actions: {
        calculate: "Calculate special relativity",
        calculating: "Calculating…",
        reset: "Reset synthetic preset",
      },
      controls: {
        description:
          "Frame S' moves in the +x direction relative to S. Proper time belongs to a clock at rest in its defining frame; proper length belongs to an object at rest in its defining frame. The event pair is simultaneous in S before it is compared with S'.",
        fieldAriaLabels: {
          properLength: "Proper length in meters",
          properTime: "Proper time in seconds",
          relativeSpeed: "Relative speed as fraction of c",
          separation: "Simultaneous event separation in meters",
        },
        fields: {
          properLength: "Proper length (m)",
          properTime: "Proper time (s)",
          relativeSpeed: "Relative speed β = v/c",
          separation: "Simultaneous-event +x separation (m)",
        },
        title: "Inertial-frame teaching controls",
      },
      failures: {
        emptyInput: "One or more controls are empty or outside the reviewed v1 domain.",
        outOfDomain:
          "The requested values are outside the reviewed special-relativity v1 domain. Lumina does not clamp or reinterpret them.",
        rejected:
          "The canonical Relativity Visualizations model rejected this state. The last valid result remains visible.",
        resultMismatch:
          "The returned result did not match the requested versioned relativity state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      gravity: {
        description:
          "This lab is special relativity only. For a static clock outside an ideal Schwarzschild black hole, use the already-certified gravitational-redshift model.",
        link: "Open Black-Hole / Relativity Lab →",
        noScriptLink: "Open the certified Schwarzschild Black-Hole / Relativity Lab",
        noScriptSuffix: "for the static-clock gravitational-redshift lesson.",
        noScriptTitle: "Gravitational redshift is a separate model",
        title: "Gravitational redshift uses a different model",
      },
      header: {
        eyebrow: "Phase 7 · One-dimensional inertial special relativity",
        intro:
          "Compare measurements made by two inertial frames moving at constant relative speed along one shared axis. This model teaches frame-dependent time, length, and simultaneity; it does not model acceleration or gravity.",
        title: "Relativity Visualizations",
      },
      invalidState: {
        description: "The reviewed synthetic inertial-frame preset is shown instead.",
        inline:
          "Shared relativity state rejected. The reviewed synthetic inertial-frame preset is shown instead.",
        title: "Shared relativity state rejected",
      },
      lightCone: {
        ariaLabel: "Reviewed normalized special-relativity light-cone diagram",
        caption:
          "{note} Coordinate convention: {coordinateSystem}. The diagonal boundaries are reviewed static teaching geometry, not values calculated from the controls.",
        noScriptCoordinateConvention: "Coordinate convention: {coordinateSystem}",
        noScriptTitle: "Light cones",
        sectionDescription:
          "The reviewed normalized diagram shows the lightlike boundaries of one event. It is a conceptual causal-structure lesson, not a user-input calculation.",
        sectionTitle: "4. Light cones and causal boundaries",
        svgTitle: "Reviewed normalized light-cone diagram",
      },
      metadataDescription:
        "Explore Python-owned one-dimensional special-relativity time dilation, length contraction, simultaneity, and reviewed light-cone teaching geometry.",
      metadataTitle: "Relativity Visualizations",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed browser state: β={beta}; proper time {properTime} s; proper length {properLength} m; S event separation {separation} m.",
        equations: "Reviewed model equations",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        eyebrow: "Phase 7 / Special Relativity",
        intro:
          "Explore a one-dimensional inertial-frame special-relativity teaching model. Lumina's Python astronomy domain owns the Lorentz factor, time-dilation, length-contraction, and relativity-of-simultaneity calculations.",
        requestedStateTitle: "Requested teaching state",
        result: {
          dilatedInterval: "Dilated interval",
          lengthTitle: "Length contraction",
          lorentzFactor: "Lorentz factor γ",
          modelVersion: "Model version",
          movingLength: "Moving-frame length",
          relativeSpeed: "Relative speed",
          simultaneityOffset: "Signed B-minus-A time offset in S'",
          simultaneityTitle: "Relativity of simultaneity",
          timeTitle: "Time dilation",
          title: "Canonical special-relativity result",
        },
        stateLabels: {
          properLength: "Proper length",
          properTime: "Proper time",
          relativeSpeed: "Relative speed",
          separation: "Simultaneous-event +x separation in S",
        },
        unavailableDescription:
          "No browser-generated Lorentz factor, time-dilation, length-contraction, or simultaneity value is substituted.",
        unavailableTitle: "No canonical result available",
      },
      result: {
        description:
          "Model {modelVersion}. All user-dependent physical values below were returned by the canonical Python model.",
        lengthTitle: "2. Length contraction",
        lorentzFactor: "Lorentz factor γ",
        relativeSpeed: "Relative speed",
        simultaneityTitle: "3. Relativity of simultaneity",
        timeTitle: "1. Time dilation",
        title: "Canonical inertial-frame result",
        unavailableDescription:
          "No browser-generated Lorentz factor, time-dilation, length-contraction, or simultaneity value is substituted.",
        unavailableTitle: "No canonical result available",
      },
    },
    spectroscopyLab: {
      actions: {
        calculate: "Calculate spectrum",
        calculating: "Calculating…",
        reset: "Reset Solar-like absorption preset",
      },
      controls: {
        description:
          "All atomic coordinates are reviewed NIST ASD observed-vacuum wavelengths. Line amplitudes/depths are illustrative and are not abundance predictions.",
        fieldAriaLabels: {
          displayNoise: "Display noise sigma normalized flux",
          noiseSeed: "Noise seed uint32",
          radialVelocity: "Radial velocity km/s",
          resolvingPower: "Resolving power R",
          temperature: "Temperature K",
        },
        fields: {
          displayNoise: "Display noise sigma",
          mode: "Mode",
          noiseSeed: "Noise seed",
          radialVelocity: "Radial velocity",
          representativeSpecies: "Representative species",
          resolvingPower: "Resolving power",
          temperature: "Temperature",
        },
        title: "Teaching spectrum controls",
      },
      failures: {
        invalidInput: "One or more controls are empty or outside the reviewed v1 domain.",
        outOfDomain:
          "The requested mode, species, temperature, velocity, resolution, or noise settings are outside the reviewed v1 domain.",
        rejected:
          "The canonical Spectroscopy Lab rejected this state. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned spectrum state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      figure: {
        caption:
          "Presentation-only plot of the returned vacuum-wavelength and normalized-flux arrays. Dashed markers use returned shifted line centers. The browser does not calculate continuum, Doppler shift, line width, or noise.",
        normalizedFlux: "normalized flux",
        plotAriaLabel: "Returned normalized spectrum from 380 to 750 nanometres vacuum wavelength",
        scrollAriaLabel: "Scrollable normalized spectrum plot",
      },
      header: {
        eyebrow: "Phase 7 · normalized visible-spectrum teaching model",
        intro:
          "Explore an ideal normalized blackbody continuum, a small source-backed atomic fingerprint set, bounded radial-velocity shifts, illustrative resolving power, and deterministic display noise. V1 is not a stellar-atmosphere or abundance-analysis code.",
        title: "Spectroscopy Lab",
      },
      invalidState: {
        description: "The reviewed Solar-like absorption preset is shown instead.",
        inline:
          "Shared spectroscopy state rejected. The reviewed Solar-like absorption preset is shown instead.",
        title: "Shared spectroscopy state rejected",
      },
      metadataDescription:
        "Explore a source-backed normalized visible spectrum with blackbody continuum, representative atomic fingerprints, bounded Doppler shift, resolving power, and deterministic display noise.",
      metadataTitle: "Spectroscopy Lab",
      modes: {
        absorption: "Absorption lines",
        continuum: "Blackbody continuum",
        doppler: "Doppler shift",
        elementMatch: "Element matching",
        emission: "Emission lines",
      },
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed browser state: {mode}, {temperature} K, radial velocity {velocity} km/s.",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        displayNoiseTemplate: "Display noise σ {sigma}; seed {seed}.",
        eyebrow: "Phase 7 / Spectroscopy Lab",
        intro:
          "Explore a normalized visible teaching spectrum. Lumina's Python astronomy domain owns the continuum, Wien peak, wavelength shifts, representative line profiles, and deterministic noise.",
        lineCaption: "Returned representative source-backed line metadata.",
        requestedModelTitle: "Requested teaching model",
        stateLabels: {
          displayNoise: "Display noise σ",
          mode: "Mode",
          radialVelocity: "Radial velocity",
          resolvingPower: "Resolving power",
          selectedSpecies: "Selected species",
          temperature: "Temperature",
        },
        unavailableDescription: "No browser-generated spectrum or line positions are substituted.",
        unavailableTitle: "No canonical result available",
      },
      none: "none",
      result: {
        description:
          "Model {modelVersion}. The returned spectrum is normalized teaching data, not flux-calibrated physical radiance.",
        labels: {
          dopplerFactor: "Doppler factor",
          mode: "Mode",
          radialVelocity: "Radial velocity",
          resolvingPower: "Resolving power",
          returnedSamples: "Returned samples",
          selectedSpecies: "Selected species",
          temperature: "Temperature",
          wienPeak: "Wien peak",
        },
        lines: {
          caption: "Source-backed representative line metadata returned by the canonical model.",
          empty: "Continuum mode returns no atomic fingerprint lines.",
          headers: {
            feature: "Feature",
            fwhm: "Illustrative FWHM nm",
            rest: "Rest vacuum nm",
            shifted: "Shifted vacuum nm",
            species: "Species",
          },
          scrollAriaLabel: "Scrollable representative line table",
        },
        modelVersion: "Model version",
        noScriptReturnedSamples:
          "Returned samples: {count}; vacuum range {minimum} nm to {maximum} nm.",
        title: "Canonical normalized spectrum",
        unavailableDescription:
          "No browser-generated fallback continuum, line positions, or noise are substituted.",
        unavailableTitle: "No canonical result available",
        wienPeak: "Wien peak",
      },
    },
    stellarLaboratory: {
      actions: {
        calculate: "Calculate stellar model",
        calculating: "Calculating…",
        reset: "Reset one-Solar-mass preset",
      },
      controls: {
        description:
          "V1 accepts only {minimum}–{maximum} M☉. There is intentionally no metallicity slider because this model is not a metallicity-dependent evolution grid.",
        fieldLabel: "Initial stellar mass",
        title: "Initial mass",
      },
      failures: {
        invalidInput: "Mass is empty, non-finite, or outside the reviewed 0.4–29.669 M☉ v1 range.",
        rejected:
          "The canonical Stellar Laboratory model rejected this mass. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned stellar state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      header: {
        eyebrow: "Phase 7 · approximate source-backed model",
        intro:
          "Explore how initial mass maps to typical main-sequence luminosity, radius, effective temperature, an approximate lifetime, a nearest published colour anchor, and a broad expected remnant. This is not an age-resolved stellar-evolution grid.",
        title: "Stellar Laboratory",
      },
      invalidState: {
        description: "The reviewed one-Solar-mass preset is shown instead.",
        inline:
          "Shared stellar-laboratory state rejected. The reviewed one-Solar-mass preset is shown instead.",
        title: "Shared stellar-laboratory state rejected",
      },
      metadataDescription:
        "Explore a source-backed approximate main-sequence mapping from stellar mass to typical luminosity, radius, temperature, lifetime, colour anchor, and broad remnant outcome.",
      metadataTitle: "Stellar Laboratory",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState: "Current committed browser state: initial mass {mass} M☉.",
        equations: "Equations and mappings",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        eyebrow: "Phase 7 / Stellar Laboratory",
        intro:
          "Explore a source-backed approximate main-sequence mass mapping. Lumina's Python astronomy domain owns the empirical relations, lifetime interpolation, and broad remnant classification; this page does not recreate them in the browser.",
        lifecycleTitle: "Broad educational lifecycle",
        modelVersion: "Model version",
        requestedMassTitle: "Requested mass",
        resultCaption:
          "Canonical approximate Stellar Laboratory result from Lumina's astronomy API.",
        resultLabels: {
          approximateLifetime: "Approximate main-sequence lifetime",
          expectedRemnant: "Expected remnant",
          initialMass: "Initial mass",
          nearestColourAnchor: "Nearest source colour anchor",
          typicalLuminosity: "Typical main-sequence luminosity",
          typicalRadius: "Typical main-sequence radius",
          typicalTemperature: "Typical effective temperature",
          yearsUnit: "years",
        },
        resultTitle: "Approximate main-sequence result",
        unavailableDescription: "No browser-generated fallback stellar properties are substituted.",
        unavailableTitle: "No canonical result available",
      },
      result: {
        description:
          "Model {modelVersion}. Values are typical educational estimates within the reviewed source domain, not measurements or a prediction for an individual star.",
        labels: {
          approximateLifetime: "Approximate main-sequence lifetime",
          colourAnchorMass: "Colour-anchor mass",
          expectedRemnant: "Expected remnant",
          initialMass: "Initial mass",
          nearestColourAnchor: "Nearest source colour anchor",
          typicalLuminosity: "Typical luminosity",
          typicalRadius: "Typical radius",
          typicalTemperature: "Typical effective temperature",
        },
        lifecycleDescription:
          "These are returned categorical stages, not an age-resolved evolutionary track or H–R trajectory.",
        lifecycleTitle: "Broad educational lifecycle",
        sourceTableAnchor: "source table anchor",
        title: "Approximate main-sequence result",
        unavailableDescription:
          "No browser-generated fallback stellar properties or lifecycle are substituted.",
        unavailableTitle: "No canonical result available",
        yearsUnit: "years",
      },
    },
    transitMethod: {
      actions: {
        calculate: "Calculate transit",
        calculating: "Calculating…",
        reset: "Reset synthetic central-transit preset",
      },
      classification: {
        full: "Full transit",
        grazing: "Grazing transit",
        noTransit: "No transit",
      },
      controls: {
        description:
          "Browser checks cover only finite field ranges. Relational constraints—such as the planet being smaller than the star and the orbit clearing both disks—are enforced by the canonical API and are never silently clamped.",
        title: "Circular-orbit geometry inputs",
      },
      failures: {
        invalidInput:
          "One or more inputs are empty, non-finite, or outside the published coarse field range.",
        rejected:
          "The canonical Transit Method model rejected this configuration. Check the planet/star sizes, orbital radius, period, and inclination. The last valid result remains visible.",
        resultMismatch: "The returned result did not match the requested versioned transit state.",
        serviceUnavailable:
          "Calculation service is unavailable; the last valid result remains visible.",
      },
      fields: {
        inclination: "Inclination",
        orbitalPeriod: "Orbital period",
        planetRadius: "Planet radius",
        semiMajorAxis: "Semi-major axis",
        stellarRadius: "Stellar radius",
      },
      header: {
        eyebrow: "Phase 7 · deterministic simulation",
        intro:
          "Explore how circular orbital alignment and relative sizes shape an idealized exoplanet transit. Lumina's canonical Python astronomy domain returns the geometry, contact times, and uniform-source light curve; the browser only validates and displays that result.",
        title: "Transit Method Lab",
      },
      invalidState: {
        description:
          "The malformed or unsupported shared state was replaced with the reviewed default.",
        inline: "Shared state rejected. The reviewed synthetic default is shown instead.",
        title: "Shared transit state rejected",
      },
      lightCurve: {
        caption:
          "Horizontal position uses returned time from mid-transit; vertical position uses returned relative flux. Returned flux range: {minimum} to {maximum}. A flat line is a valid no-transit result.",
        description:
          "Display-normalized plot of {count} API-returned relative-flux samples around mid-transit. The browser does not recalculate transit flux.",
        title: "Returned relative-flux light curve",
      },
      metadataDescription:
        "Explore a deterministic circular-orbit exoplanet transit model with exact uniform-source overlap, contact durations, and explicit limitations.",
      metadataTitle: "Transit Method Lab",
      model: {
        assumptions: "Assumptions",
        assumptionsAndLimitations: "Assumptions and limitations",
        currentState:
          "Current committed state: stellar radius {stellarRadius} m, planet radius {planetRadius} m, period {period} s, inclination {inclination}°.",
        equations: "Equations",
        limitations: "Limitations",
        reviewedSources: "Reviewed sources",
        sourceUnavailable: "Unavailable source record: {sourceId}",
        title: "Model contract and provenance",
      },
      noScript: {
        currentStateTitle: "Current input state",
        eyebrow: "Phase 7 / Transit Method Lab",
        intro:
          "Explore a deterministic circular-orbit, uniformly bright stellar-disk transit model. Lumina's Python astronomy domain calculates the geometry and light curve; this page does not recreate the transit equations in the browser.",
        modelTitle: "Model, assumptions, limitations, and provenance",
        stateLabels: {
          inclination: "Inclination",
          orbitalPeriod: "Orbital period",
          planetRadius: "Planet radius",
          semiMajorAxis: "Semi-major axis",
          stellarRadius: "Stellar radius",
        },
      },
      notApplicable: "Not applicable",
      preview: {
        description:
          "Showing {shown} of {total} returned samples at a fixed display stride, always including the final sample. This table does not interpolate or resynthesize flux values.",
        headers: {
          orbitalPhase: "Orbital phase",
          projectedSeparation: "Projected separation (R⋆)",
          relativeFlux: "Relative flux",
          time: "Time from mid-transit (s)",
        },
        summary: "Light-curve data preview",
      },
      result: {
        description:
          "Model {modelVersion}. A no-transit classification is a valid geometric outcome. V1 intentionally provides no detectability score because real detectability depends on stellar variability, instrument noise, cadence, and analysis choices that this idealized model does not simulate.",
        labels: {
          alignment: "Alignment",
          centralDepthApproximation: "Central depth approximation",
          fullDuration: "Second-to-third contact duration",
          impactParameter: "Impact parameter",
          lightCurveSamples: "Light-curve samples",
          maximumDepth: "Maximum depth",
          maximumUniformSourceDepth: "Maximum uniform-source depth",
          radiusRatio: "Radius ratio Rp/R⋆",
          scaledSemiMajorAxis: "Scaled semi-major axis a/R⋆",
          totalDuration: "First-to-fourth contact duration",
        },
        model: "Model {modelVersion}",
        noScriptCaption: "Canonical Transit Method result from Lumina's astronomy API.",
        noScriptLabels: {
          alignment: "Alignment classification",
          centralDepthApproximation: "Central depth approximation",
          fullDuration: "Second-to-third contact duration",
          impactParameter: "Impact parameter",
          lightCurveSamples: "Light-curve samples",
          maximumDepth: "Maximum depth",
          maximumUniformSourceDepth: "Maximum uniform-source depth",
          radiusRatio: "Radius ratio",
          scaledSemiMajorAxis: "Scaled semi-major axis",
          totalDuration: "First-to-fourth contact duration",
        },
        noScriptTitle: "Canonical result",
        noTransit: "No transit",
        title: "Canonical transit result",
        unavailableDescription:
          "No browser-generated fallback transit or light curve is substituted.",
        unavailableNoScriptDescription:
          "No substitute or browser-generated light curve was fabricated.",
        unavailableNoScriptTitle: "Calculation unavailable",
        unavailableTitle: "No canonical result available",
      },
    },
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
    satellites: {
      backToSpaceNow: "Back to Space Now",
      eyebrow: "Space Now · Satellites",
      intro:
        "Selected {provider} {stationsGroup} and {visualGroup} general-perturbations elements, propagated locally with {propagationModel}. These are model predictions, not real-time tracking or guaranteed optical visibility.",
      metadataDescription:
        "Selected {provider} satellite elements and local {propagationModel} pass predictions with explicit freshness, element-age, daylight, and illumination context.",
      metadataTitle: "Satellite Passes",
      passFinder: {
        actions: {
          calculate: "Calculate next {hours} hours",
          calculating: "Calculating…",
          useLocation: "Use my location",
        },
        errors: {
          finiteValues: "Enter valid finite numeric values.",
          geolocationUnavailable: "Geolocation is not available in this browser.",
          locationPermission: "Location permission was unavailable or declined.",
          noLongerAvailable: "That satellite is no longer present in the current snapshot.",
          requestInvalid: "The pass request could not be validated.",
          responseInvalid: "Lumina returned an unexpected pass response.",
          temporarilyUnavailable: "Satellite data is temporarily unavailable.",
          unknown: "Pass calculation could not be completed.",
        },
        fields: {
          elevation: "Elevation (metres)",
          latitude: "Latitude (degrees)",
          longitude: "Longitude (degrees)",
          satellite: "Satellite",
        },
        heading: "Find passes for your location",
        idle: "Predictions start from the current UTC time when you submit.",
        loading: "Calculating from the cached element set…",
        option: "{name} · NORAD {catalogNumber}",
        privacy:
          "Coordinates are used only for this calculation. They are not placed in the URL, sent to {provider}, stored by Lumina, or echoed in the result. Browser geolocation runs only when you press the button below.",
        result: {
          algorithmSummary:
            "{propagationModel} · {gravityModel} · observer {observerEllipsoid} · element offset {hours} h",
          heading: "{satellite} predicted passes",
          illumination:
            "Satellite sunlit at peak: {sunlit}. Observer sky: {skyState} (Sun {sunAltitude}°).",
          limitation:
            "Sunlit status and observer sky state are model context only. Lumina has no optical-magnitude model here and does not claim that a pass will be visible.",
          no: "no",
          noPasses:
            "No complete passes above {altitudeThreshold}° were found in the next {windowHours} hours.",
          passPeakAfterTime: "· {altitude}° {direction}",
          passPeakLabel: "Peak",
          passRiseSet: "Rise {riseTime} ({riseDirection}) · Set {setTime} ({setDirection})",
          reasonLabel: "Reason:",
          refusedTitle: "Prediction safely refused",
          refusalCatalogUnsupported:
            "This catalog number is outside the runtime range supported by Lumina's current SGP4 implementation",
          refusalElementAge:
            "The requested prediction window extends beyond Lumina's supported element-age bound",
          refusalEventSequence:
            "The propagated event sequence could not be used safely for a complete pass",
          refusalFallback: "unsupported state",
          refusalSgp4State: "The element state is not supported safely by the current SGP4 runtime",
          skyAstronomicalTwilight: "astronomical twilight",
          skyCivilTwilight: "civil twilight",
          skyDaylight: "daylight",
          skyNauticalTwilight: "nautical twilight",
          skyNight: "night",
          skyUnknown: "unknown sky state",
          staleWarning:
            "Element-age warning: prediction uses elements beyond Lumina's {hours}-hour warning threshold.",
          yes: "yes",
        },
      },
      satellites: {
        count:
          "Showing {returned} of {total} normalized records from the fixed {stationsGroup} and {visualGroup} groups.",
        elementAgeValue: "{hours} h",
        heading: "Selected satellites",
        labels: {
          elementAge: "Element age",
          elementEpoch: "Element epoch",
          groups: "Groups",
          passRuntime: "Pass runtime",
        },
        noradReference: "NORAD {catalogNumber}",
        runtimeNotSupported: "Not supported",
        runtimeSupported: "Supported",
        staleWarning: "Element age exceeds Lumina's {hours}-hour warning threshold.",
      },
      snapshot: {
        freshTitle: "Fresh element snapshot",
        lastFailure: "Last safe refresh failure: {code}",
        latestEpochNotRecorded: "not recorded",
        summary:
          "Lumina retrieved this selected-group cache at {retrievedAt}. The newest element epoch represented is {latestEpoch}.",
        staleTitle: "Stale element snapshot",
        unrecordedTime: "an unrecorded time",
      },
      source: {
        documentation: "{provider} GP documentation",
        limitations:
          "Lumina warns when elements are more than {warningHours} hours from the requested start and refuses pass calculations when the {windowHours}-hour prediction window would extend more than {maximumOffsetHours} hours from the element epoch. These are conservative Lumina product limits, not universal {propagationModel} validity claims.",
        title: "Source, model, and limitations",
        usagePolicy: "{provider} usage policy",
      },
      title: "Satellite passes",
      transport: {
        description: "Lumina could not safely read its API, so it is showing no satellite claims.",
        title: "Satellite data is temporarily unavailable",
      },
      unavailable: {
        cachedContentExpired: "The last validated element snapshot has expired.",
        noBrowserProviderRequest: "This page never fetches {provider} from the browser.",
        noCachedContent: "No validated selected-group element snapshot is available yet.",
        providerDisabled: "The {provider} provider is disabled.",
        title: "Satellite data is currently unavailable",
      },
    },
    spaceWeather: {
      aurora: {
        title: "Aurora forecast context",
      },
      eyebrow: "Space Now",
      freshness: {
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
        retrievedAtLabel: "Snapshot retrieved at (UTC)",
        staleUntilLabel: "Stale grace ends (UTC)",
        title: "Lumina retrieval state",
      },
      impacts: {
        description:
          "{provider} describes different possible effects for each scale family. This context is educational and is not operational advice for aviation, power systems, spacecraft, or radiation safety.",
        familyHeading: "{family} family",
        title: "{provider} impact context",
      },
      intro:
        "A calm, educational view of separate {provider} space-weather measurements, communication scales, forecasts, and notifications. These facts are not an operational warning or a local aurora-visibility prediction.",
      kp: {
        description:
          "Kp is a dimensionless planetary geomagnetic index. Observed, estimated, and predicted rows remain separate; Kp is not a local aurora probability and does not replace the {provider} R/S/G scales.",
        forecast: {
          caption: "{provider} predicted planetary Kp rows",
          empty: "No predicted Kp rows are available in this snapshot.",
          heading: "Forecast Kp",
          headers: {
            kp: "Kp (dimensionless)",
            scale: "{provider} scale field",
            statusColumn: "Status",
            time: "{provider} product time",
          },
          statuses: {
            estimated: "Estimated",
            observed: "Observed",
            predicted: "Predicted",
          },
        },
        labels: {
          kp: "Kp",
          latestEstimated: "Latest estimated Kp",
          latestObserved: "Latest observed Kp",
          productTime: "{provider} product time",
          providerStatus: "Provider status",
          scaleField: "{provider} scale field",
        },
        notReported: "Not reported",
        notReportedInSnapshot: "Not reported in this snapshot.",
        statuses: {
          estimated: "estimated",
          observed: "observed",
          predicted: "predicted",
        },
        title: "Planetary Kp",
      },
      metadataDescription:
        "A source-backed {provider} view of separate R, S, and G scales, planetary Kp, solar-wind measurements, and provider notifications.",
      metadataTitle: "Space Weather",
      notifications: {
        description:
          "These are recent provider-issued notification records. Lumina does not infer an active alert, warning, watch, cancellation, or severity class from message prose.",
        empty: "No notification records are present in this snapshot.",
        issueTime: "Provider issue time: {time}",
        title: "Latest {provider} notifications",
      },
      scales: {
        description:
          "{provider} keeps radio blackouts (R), solar radiation storms (S), and geomagnetic storms (G) as separate source-defined categories. Lumina does not add their levels together.",
        families: {
          geomagnetic: "Geomagnetic storms",
          radioBlackout: "Radio blackouts",
          solarRadiation: "Solar radiation storms",
        },
        familyContext: "This is the {provider} {code} family level, not a Lumina severity score.",
        noSourceDescription: "No source description",
        sourceTime:
          "{provider} scale record time: {date} {time}. Lumina preserves this source time text without relabelling it as local time.",
        title: "Current {provider} scales",
        unavailable:
          "The current {provider} scale record is not available in this validated snapshot.",
      },
      snapshot: {
        description:
          "This state describes Lumina's atomic cache snapshot. The {provider} product timestamps below describe the underlying observations, estimates, forecasts, or notifications and are not all from the same instant.",
        freshTitle: "Fresh Space Weather snapshot",
        staleTitle: "Stale Space Weather snapshot",
      },
      solarWind: {
        description:
          "These are {provider} upstream or near-Earth spacecraft measurements, not ground measurements at a user's location. A single speed or magnetic-field value does not guarantee a geomagnetic storm or local aurora.",
        labels: {
          bt: "Interplanetary magnetic-field magnitude (Bt)",
          bz: "GSM north/south magnetic-field component (Bz)",
          protonSpeed: "Solar-wind proton speed",
        },
        notRecorded: "Not recorded",
        notReported: "Not reported",
        sourceObservationTime: "Source observation time: {time}",
        title: "Solar wind measurements",
        unavailable: "Solar-wind measurements are not available in this validated snapshot.",
      },
      source: {
        documentation: "{sourceName} official documentation",
        limitations:
          "Lumina is educational/informational. Consult {provider} directly for operational guidance; this page is not an emergency warning replacement or a safety system.",
        returnToSpaceNow: "Return to Space Now",
        title: "Source and limitations",
      },
      title: "Space Weather",
      unavailable: {
        cachedContentExpired: "The cached Space Weather snapshot has expired.",
        generic: "Space Weather data could not be loaded from Lumina right now.",
        noCachedContent: "No validated Space Weather snapshot is available yet.",
        providerDisabled: "The Space Weather provider is disabled.",
        title: "Space Weather data is currently unavailable.",
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
