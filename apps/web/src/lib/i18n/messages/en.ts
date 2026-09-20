import type { LuminaMessages } from "./types";

export const enMessages = {
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
  journal: {
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
        reviewedPosition: "Reviewed catalogue position. No epoch propagation is applied.",
        sourceRecordLabel: "Source record",
        title: "Position source",
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
