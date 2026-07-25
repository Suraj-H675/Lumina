# Lumina Master Plan

## 1. Vision

Lumina will be the free visual home for space curiosity.

A user should be able to arrive with no astronomy knowledge, discover something compelling, explore it visually, understand the underlying science, experiment with the concept, connect it to the real sky, and preserve their progress.

The complete product is large by design. It must be built as a sequence of production-quality vertical slices rather than as a broad collection of unfinished pages.

## 2. Product pillars

### Explore

A connected atlas of the Solar System, planets and moons, stars, exoplanets, galaxies, deep-sky objects, compact objects, missions, spacecraft, telescopes, rockets, scientists, history, and cosmic scale.

### Observe

Location- and time-aware tools: Sky Tonight, visibility ranking, sky map, rise/transit/set, Moon and twilight effects, equipment profiles, star hopping, field-of-view preview, event calendar, observation planner, and journal.

### Identify

Image-based astronomy without generative AI: private upload, Astrometry.net plate solving, WCS, annotations, survey comparison, capture checks, and journal integration.

### Learn

Authored progressive learning: Explorer, Student, and Deep Dive modes; learning paths; visual lessons; misconceptions; quizzes; glossary; stories; and mastery.

### Space Lab

Deterministic experiments: orbits, planetary systems, exoplanet detection, stars, H-R diagrams, telescopes, rockets, eclipses, seasons, spectroscopy, impacts, black holes, and relativity.

### Space Now

Fresh structured data: launches, mission milestones, satellite/ISS passes, near-Earth objects, space weather, daily imagery, active missions, and reviewed discoveries.

### Personal journey

Local-first interests, equipment, locations, collections, progress, saved plans, journal, export/import, and dashboard preferences.

### Participate

Citizen-science opportunities, observation challenges, and safe physical activities without creating a public social network.

## 3. Defining user loop

> Discover → Explore visually → Understand → Simulate → Observe → Identify → Record → Continue learning

Each implemented release must strengthen this loop.

## 4. Major user journeys

### First curiosity

Mission Control question → object page → visual interaction → explanation → comparison → visibility tonight → save.

### Observe tonight

Location → equipment → ranked targets → plan → sky directions → journal.

### Learn stellar evolution

Learning path → mass simulation → H-R diagram → misconception check → real star example → observe.

### Identify a photograph

Private upload → validation → plate solving → annotations → survey comparison → journal.

### Follow a mission

Launch/event → mission objective → vehicle/spacecraft → destination → trajectory simulation → milestone tracking.

## 5. Release sequence

### Release 0 — Repository foundation

- monorepo;
- web/API/worker shells;
- PostgreSQL and migrations;
- health checks;
- CI;
- lint, types, tests;
- design tokens;
- error envelope;
- provider interfaces;
- documentation.

No product feature may be advertised as working.

### Release 1 — Discover and understand

- canonical object model;
- curated catalog;
- provenance;
- aliases and fuzzy search;
- object pages;
- source drawer;
- compare;
- known/likely/unknown;
- presentation modes;
- local collections.

### Release 2 — See your sky

- location/time;
- twilight;
- altitude/azimuth;
- rise/transit/set;
- Moon separation;
- visibility scoring;
- Sky Tonight;
- initial 2D sky;
- equipment profiles;
- planner;
- journal basics.

### Release 3 — Visual learning

- learning paths;
- lesson renderer;
- quizzes;
- glossary;
- mastery;
- H-R diagram;
- first simulations;
- scale/distance translators.

### Release 4 — Space Now

- launch center;
- active mission data;
- APOD/daily visual;
- satellite element synchronization;
- pass prediction;
- NOAA space weather;
- NEO approaches;
- event calendar;
- provider status.

### Release 5 — Advanced visual exploration

- WorldWide Telescope integration;
- cosmic zoom;
- deep-sky layers;
- planetary-system views;
- mission timelines;
- trajectory replay;
- wavelength views;
- advanced comparisons.

### Release 6 — Identify

- image upload;
- private object storage;
- async jobs;
- Astrometry.net adapter;
- WCS;
- annotations;
- survey comparison;
- image journal;
- retention/deletion.

### Release 7 — Complete Space Lab

- orbit sandbox;
- Solar System builder;
- transit and radial velocity;
- telescope builder;
- rocket/mission designer;
- eclipse/seasons;
- spectroscopy;
- impact;
- black-hole and relativity visual models.

### Release 8 — Participation and access maturity

- citizen-science directory;
- challenges;
- build-and-do activities;
- localization;
- reviewed translations;
- offline lesson bundles;
- PWA maturity;
- full accessibility audit.

## 6. Scope controls

Every release must:

- deliver a coherent outcome;
- work without future releases;
- include real error/offline/stale states;
- include tests;
- include source attribution;
- avoid paid core dependencies;
- avoid mock data in production;
- avoid dead navigation;
- pass its documented gate.

## 7. Required qualities

### Scientific

Provenance, explicit units, uncertainty, deterministic calculations, trusted validation, and no generated prose.

### Experience

Curiosity-first, progressive disclosure, no prerequisite knowledge, useful advanced evidence, and meaningful next actions.

### Accessibility

WCAG 2.2 AA target, keyboard, screen reader, reduced motion, high contrast, 2D fallback, captions, and touch support.

### Reliability

Provider isolation, visible freshness, cached stale data where appropriate, and no silent contradictory fallback.

### Privacy

Local-first, minimum collection, private uploads, no ads, no behavioral tracking, and no account requirement.

### Performance

Light initial route, lazy heavy visuals, bounded data, workers for intensive operations, and low-bandwidth modes.

## 8. Mature demonstration

A mature build should allow a user to:

1. see tonight's sky and a current mission event;
2. search Jupiter by name or alias;
3. explore Jupiter's structure, moons, scale, and missions;
4. compare it with Earth and Saturn;
5. calculate whether it is visible;
6. add it to an observation plan;
7. preview a telescope field of view;
8. finish a related learning activity;
9. upload and solve a sky image;
10. save the experience locally;
11. inspect sources, freshness, uncertainty, and model limitations.
