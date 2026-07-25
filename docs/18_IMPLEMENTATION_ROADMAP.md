# Implementation Roadmap

This is the mandatory build order. Each phase is a vertical slice with a gate. Do not start the next phase until the current gate passes or the user explicitly authorizes an exception.

## Phase 0 — Repository and engineering foundation

Phase 0B2 sequencing clarification: configure PostgreSQL, Alembic, the initial `job` table, and
`/health/ready` before the database-backed worker behavior. This resolves the queue prerequisite
without marking Phase 0 complete.

### Goal

A clean, reproducible monorepo with no false product claims.

### Tasks

1. Initialize Git metadata and record the current no-project-licence decision.
2. Configure root pnpm workspace.
3. Create Next.js App Router web app.
4. Create Python `uv` workspace/API package.
5. Create FastAPI app factory and composition root.
6. Create worker entry point using database-backed jobs.
7. Configure PostgreSQL and Docker Compose.
8. Configure Alembic.
9. Create `/health/live` and `/health/ready`.
10. Define API error envelope and request IDs.
11. Add structured logging.
12. Add environment validation.
13. Add Tailwind/design tokens and basic accessible shell.
14. Add generated OpenAPI client pipeline.
15. Add Ruff, mypy, pytest, ESLint, TypeScript, Vitest, Playwright.
16. Add GitHub Actions.
17. Add pre-commit hooks or equivalent documented checks.
18. Add contribution templates.
19. Add initial security headers.
20. Add source/data/asset manifest schemas.
21. Add provider adapter interface with a fake test provider only.
22. Add job table and worker claim tests.
23. Add architecture smoke test preventing forbidden imports where practical.
24. Document commands in README.

### Deliverable

Home page says Lumina is under construction and describes the vision. It does not display fake live cards or catalogs.

### Gate

- clean install from clone;
- one command starts required local services;
- web production build passes;
- API starts and health checks pass;
- migration up/down passes;
- worker processes a deterministic test job;
- generated client current;
- all lint/type/test checks green;
- no secrets;
- docs links valid.

## Phase 1A — Provenance-first curated catalog

### Goal

Create trustworthy canonical entities before visual breadth.

### Initial curated entities

Select approximately:

- Sun;
- eight planets;
- Moon;
- key dwarf planets;
- 20–40 notable moons;
- 50–100 notable stars;
- Messier objects and a small deep-sky subset;
- 20–50 notable exoplanets/systems;
- a small set of missions/spacecraft needed for linked stories;
- core concepts.

Exact records are selected by a reviewed seed manifest. Do not manually type uncited values into application code.

### Tasks

1. Implement provider/dataset/source-record/measurement schema.
2. Implement entity, alias, relationship, position, media schema.
3. Implement type-specific tables needed by initial records.
4. Define quantity codes and unit normalization.
5. Create seed manifest schema.
6. Add curated seed ingestion command.
7. Require source and credit validation.
8. Implement canonical measurement selection.
9. Implement source drawer API.
10. Add entity detail API.
11. Add entity/measurement repository tests.
12. Add data-quality CI.
13. Add source/measurement admin CLI output; no admin web UI required.

### Gate

- every public seed fact has provenance;
- no unknown represented as zero;
- conflicting-value fixture works;
- idempotent seed re-run;
- source drawer returns meaningful data;
- migrations and tests pass.

## Phase 1B — Search, browse, object pages, compare

### Goal

A user can discover, understand, and compare curated entities.

### Tasks

1. Alias normalization.
2. `pg_trgm` fuzzy indexes.
3. Search ranking and match reason.
4. Search suggestion endpoint.
5. Type filters and bounded browse.
6. Public entity DTOs.
7. Object page route and common sections.
8. Known/likely/unknown component.
9. Source drawer UI.
10. Credited media component.
11. Measurement table Deep Dive.
12. Compare API and UI.
13. Scale/distance translators.
14. Local collection IndexedDB schema.
15. Save/remove entity.
16. Export/import collection subset.
17. Search/object/compare E2E tests.
18. WebGL is optional; object page must work without it.

### Gate

- exact, alias, identifier, typo cases tested;
- result explains match;
- object page has no uncited scientific values;
- compare handles unknown/incompatible units;
- local collection survives reload/export/import;
- accessibility and production build pass.

## Phase 1C — Authored concepts and presentation modes

### Goal

The same entity supports Explorer, Student, and Deep Dive without generated prose.

### Tasks

1. Content schema.
2. Concept content loader.
3. mode-specific authored fields.
4. content review metadata.
5. entity-content linking.
6. glossary popovers/pages.
7. citation list.
8. content integrity tests.
9. initial concepts for units, magnitude, light-year, spectrum, orbit, gravity, telescope, planet/star/galaxy.
10. mode preference stored locally.

### Gate

- each published concept has sources/review metadata;
- mode switching changes content only;
- no generated copy;
- internal links valid;
- accessible glossary.

## Phase 2A — Astronomy core

### Goal

Validated coordinate/time calculations independent of UI.

### Tasks

1. Astronomy value objects for location/time/coordinate.
2. Astropy/Skyfield integration.
3. ephemeris-kernel manifest/download/checksum.
4. fixed-object proper motion support.
5. Solar System apparent-position policy.
6. AltAz.
7. angular separation.
8. Sun/Moon position and Moon illumination.
9. twilight.
10. rise/transit/set.
11. polar/no-event handling.
12. batch limits.
13. algorithm version metadata.
14. reference validation suite.

### Gate

- all required validation cases pass;
- units and time scales documented;
- no network required for baseline calculations after assets installed;
- outputs include algorithm/kernel version;
- supported date range enforced.

## Phase 2B — Sky Tonight

### Goal

Useful target recommendations for a real location.

### Tasks

1. location UI and permission.
2. manual coordinates.
3. local named locations.
4. equipment baseline profiles.
5. visibility-window extraction.
6. type-specific policies.
7. transparent score.
8. Sky Tonight API.
9. Mission Control Tonight card.
10. target list and altitude chart.
11. stale/data quality warnings.
12. no-weather and manual-condition modes.
13. local saved settings.
14. E2E at known location/date fixture.

### Gate

- location never logged/persisted server-side by default;
- score breakdown visible;
- polar/DST cases handled;
- target recommendations reproducible;
- no guarantee language;
- offline curated limitations clear.

## Phase 2C — Sky view, planner, journal

### Goal

Guide a user from recommendation to action.

### Tasks

1. initial accessible 2D sky view;
2. time scrubber;
3. selected-object direction;
4. constellation/label layers;
5. field-of-view overlay;
6. planner algorithm;
7. schedule UI;
8. conflict/warning explanation;
9. equipment editor;
10. journal IndexedDB schema;
11. create entry from plan/object;
12. export/import journal;
13. route and accessibility tests.

Point-your-phone orientation is not required yet.

### Gate

- planner schedules no overlaps;
- planner deterministic;
- 2D map keyboard/text alternative;
- journal data local;
- export/import conflict handling;
- user can complete “Tonight → Plan → Journal.”

## Phase 3A — Learning framework

### Goal

Publish the first complete learning path.

### First path

“Your First Night Sky.”

### Tasks

1. path/lesson/quiz schemas;
2. content loader and validator;
3. lesson renderer;
4. prerequisites;
5. authored mode variants;
6. quiz evaluation;
7. authored feedback/hints;
8. local progress;
9. mastery policy;
10. continue-learning Mission Control card;
11. source and review UI;
12. first complete path;
13. content accessibility review.

### Gate

- path is complete, not sample-only;
- all questions have deterministic answers;
- progress survives export/import;
- no content without source/review;
- keyboard and screen reader pass.

## Phase 3B — First labs and visual learning

### Goal

Demonstrate understanding through interaction.

### Initial labs

1. Scale Explorer
2. Seasons Simulator
3. Telescope Builder
4. H-R Diagram Explorer

### Tasks

Follow `docs/13_SIMULATIONS.md` for each.

### Gate per lab

- calculation separated from rendering;
- model page visible;
- known-case tests;
- valid ranges;
- reduced-motion and non-canvas output;
- serializable state.

Do not start all four simultaneously. Complete one vertical lab at a time.

## Phase 4A — Provider framework in production

### Goal

Safely ingest changing data.

### Tasks

1. provider configuration and status;
2. HTTP timeout/retry/rate limit;
3. cache/freshness;
4. fixture contract tests;
5. scheduled jobs;
6. raw checksum/quarantine;
7. stale display;
8. circuit breaker/disable flag;
9. `/status` provider UI;
10. metrics.

### Gate

A fake and one real low-risk provider demonstrate sync, schema failure, stale cache, and disable behavior.

## Phase 4B — Space Now: APOD, NEO, space weather

Implement one provider at a time:

1. NASA APOD/daily media
2. NASA NEO
3. NOAA SWPC

For each:

- official adapter;
- normalization;
- source/credit;
- cache schedule;
- page/card;
- stale state;
- tests.

### Gate

No browser-direct key calls, no `DEMO_KEY`, provider outage tested, timestamps visible.

## Phase 4C — Launches and missions

### Tasks

1. Launch Library 2 adapter;
2. mission/vehicle/site normalization;
3. time precision/status;
4. official links;
5. launch list/detail;
6. calendar export;
7. Mission Control event;
8. active mission board;
9. reviewed discovery-entry mechanism.

### Gate

TBD/tentative times are not false countdowns. Changes and last update are visible.

## Phase 4D — Satellites and passes

### Tasks

1. CelesTrak OMM adapter;
2. selected groups;
3. element storage/epoch;
4. SGP4;
5. observer pass computation;
6. daylight/illumination policy;
7. pass UI;
8. stale element warnings;
9. ISS/bright satellite tests.

### Gate

Predictions show element age and algorithm; stale test works; no unsupported brightness claims.

## Phase 5A — WWT integration and advanced atlas

### Goal

Add mature sky/deep-universe rendering without replacing canonical data.

### Tasks

1. isolated WWT client module;
2. lazy loading;
3. entity focus;
4. credited layers;
5. time/location sync;
6. non-WebGL fallback;
7. deep-sky browse link;
8. wavelength layer UI;
9. memory/performance tests.

### Gate

No initial-route bundle regression; layer credit visible; fallback useful.

## Phase 5B — Cosmic Zoom and system explorers

### Tasks

1. curated logarithmic scale nodes;
2. transitions and comparisons;
3. Solar System/system visual;
4. exoplanet system layout;
5. mission timelines;
6. trajectory visual based on documented data/models;
7. advanced compare.

### Gate

Scale does not imply false spatial placement; all models labelled; sources present.

## Phase 6A — Identification infrastructure

### Tasks

1. private object storage abstraction;
2. upload validation;
3. retention;
4. job states;
5. fake solver adapter;
6. security/resource tests;
7. consent UI;
8. deletion flow.

### Gate

Malicious/oversized file tests pass; no actual remote submission yet; cleanup verified.

## Phase 6B — Astrometry.net integration

Choose deployment mode explicitly.

Tasks:

1. self-hosted or remote adapter;
2. session/submission/job polling;
3. calibration normalization;
4. annotations;
5. WCS storage;
6. overlay;
7. unsolved versus failed;
8. journal integration;
9. provider outage/capacity state.

### Gate

End-to-end solve with permitted fixture; private settings verified; data deleted after policy; no API key exposed.

## Phase 6C — Capture checks and survey comparison

Only deterministic checks with validated limitations.

### Gate

No check is described as universal image-quality truth.

## Phase 7 — Remaining simulations

Order recommended:

1. Orbit Sandbox
2. Transit
3. Radial Velocity
4. Stellar Lab
5. Eclipse
6. Spectroscopy
7. Planetary System Builder
8. Rocket/Mission Designer
9. Impact
10. Black Hole
11. Relativity

Complete and gate one at a time.

## Phase 8A — Participate

- citizen-science directory;
- external status/freshness;
- filters;
- challenges;
- activities;
- safety review.

## Phase 8B — PWA and offline

- service worker;
- offline catalog/content;
- saved plan;
- update behavior;
- stale live data labels;
- storage management.

## Phase 8C — Localization

- i18n architecture;
- extract strings;
- locale formatting;
- reviewed translation workflow;
- one completed secondary language before advertising multilingual support.

## Phase 8D — Final accessibility and performance audit

- WCAG 2.2 AA review;
- screen-reader testing;
- low-end device;
- WebGL-disabled;
- reduced motion;
- 200% zoom;
- offline;
- performance budgets;
- documentation.

## Cross-phase rules

- No phase uses fixtures in production.
- No page claims a future feature.
- No external source without attribution.
- No scientific formula without tests/reference.
- No local schema change without migration/import test.
- No heavy dependency before the phase that needs it.
- Every phase updates README, decisions, and known limitations.
