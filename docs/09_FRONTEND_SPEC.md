# Frontend Specification

## 1. Principles

- The interface should feel like entering a coherent universe, not a dashboard of unrelated cards.
- Visuals must teach, orient, compare, or enable action.
- The first useful content must load without a large WebGL bundle.
- Every route works with keyboard, touch, reduced motion, and unavailable WebGL.
- Core information remains readable without JavaScript where Next.js can render it server-side.
- The URL should represent safe, shareable state.

## 2. Rendering strategy

Use Server Components for:

- catalog and mission pages;
- authored content;
- source drawers;
- initial search results;
- static route shells;
- metadata/SEO.

Use Client Components for:

- interactive filters;
- IndexedDB;
- geolocation;
- device orientation;
- sky map;
- Three.js/WWT;
- simulations;
- journal editing;
- uploads;
- live job polling.

Do not mark an entire route `"use client"` because one child is interactive.

## 3. Feature organization

```text
features/
├── catalog/
├── search/
├── compare/
├── observe/
├── sky-map/
├── planner/
├── identify/
├── learning/
├── simulations/
├── missions/
├── space-now/
├── journal/
├── collections/
├── settings/
└── sources/
```

Each feature may contain components, hooks, schemas, local state, API queries, and tests. Shared UI stays in `packages/ui`.

## 4. State ownership

### Server state

TanStack Query only where client interaction requires refetch/caching. Server Components should fetch read-first content directly through the approved server API layer.

### URL state

Filters, sort, selected compare entities, safe simulation parameters, and shareable sky time.

### Ephemeral UI state

Zustand or component state: camera, selected visual layer, open panels, simulation playback.

### Local personal data

Dexie: profile preferences, equipment, locations, collections, progress, plans, journal.

### Secrets

Never stored in client state, URLs, or committed config.

## 5. Generated API client

- Generate TypeScript types from the FastAPI OpenAPI schema.
- CI fails if generated client is stale.
- A small wrapper adds base URL, request ID, timeout/abort, and normalized errors.
- Do not duplicate interfaces by hand.
- Unknown enum values render a safe fallback.

## 6. Route shell

Every route has:

- page title and metadata;
- skip link;
- breadcrumb where useful;
- loading state;
- route error boundary;
- not-found state;
- source/freshness access for scientific/live data;
- responsive layout;
- no horizontal overflow at 320 CSS pixels.

## 7. Mission Control

Layout adapts to available data, but must avoid a dense enterprise-dashboard feel.

Priority:

1. one primary curiosity/sky feature;
2. continue action;
3. current event;
4. discovery;
5. saved content.

Cards must not auto-reorder after initial render in a way that causes layout shift.

## 8. Search

- Command-style search available globally.
- Full results route supports keyboard navigation and filters.
- Suggestions debounce locally and use abortable requests.
- Show matched alias/identifier.
- Never claim “semantic search.”
- Remote provider lookup appears separately and only on explicit action when local catalog has no result.
- Preserve query on back navigation.

## 9. Object page components

- IdentityHeader
- MediaViewer
- WhyItMatters
- QuickFacts
- KnownLikelyUnknown
- InteractiveModel
- ScaleComparison
- MeasurementTable
- ObservationPanel
- MissionConnections
- RelatedContent
- SourceDrawer

Not every type shows every section. Do not render empty headings.

## 10. Visualizations

Every chart/visual must provide:

- title;
- description;
- units;
- legend;
- keyboard-readable data table or text alternative;
- source/model version;
- reset control;
- reduced-motion behavior;
- explicit loading/error state.

Scientific axes cannot be silently truncated or log-scaled. State the scale.

## 11. WebGL and 3D

- Dynamic import.
- Capability detection.
- Pause rendering when tab/visual is not visible.
- Cap device pixel ratio for performance.
- Respect reduced motion.
- Avoid continuous animation when a static scene works.
- Provide 2D image/diagram/table fallback.
- Dispose geometries, materials, textures, and listeners.
- No decorative particle field on every route.

## 12. Sky map

The sky map UI separates:

- time control;
- location;
- layers;
- selected object;
- field of view;
- observation details.

It must display coordinate/time context and must not imply phone orientation accuracy beyond sensor capability.

## 13. Simulations

- Model computation separated from rendering.
- Pure calculation functions where practical.
- Complex client computation in Web Worker.
- Deterministic state serializable to URL/export.
- Controls have labels and units.
- Invalid inputs are rejected, not coerced silently.
- Accessible table/text output.

## 14. Local-first data

Dexie migrations are versioned and tested.

User actions:

- export all;
- import preview;
- resolve conflicts;
- delete all;
- optionally export selected journal/collection.

If IndexedDB is unavailable, show a clear limited-mode state.

## 15. Offline

Phase-dependent:

- app shell;
- authored lessons;
- curated object pages;
- user data;
- saved observation plan.

Never present cached live data as current. Offline live cards show timestamp and offline badge.

## 16. Forms

- labels, descriptions, and field-level errors;
- preserve user input after errors;
- no placeholder-only labels;
- submit state visible;
- destructive actions require clear confirmation;
- file upload supports keyboard and standard input, not drag-only.

## 17. Performance budgets

Initial targets, reviewed after measurement:

- route shell JS kept minimal;
- WebGL excluded from initial home bundle;
- no single uncompressed custom asset above 1 MB without justification;
- images use responsive formats and dimensions;
- lists virtualized only when necessary;
- API responses bounded;
- simulation frame budget monitored;
- Core Web Vitals measured in CI or controlled test runs.

## 18. SEO and sharing

Public educational/catalog pages:

- stable title/description;
- canonical URL;
- Open Graph image with credited media or generated non-infringing graphic;
- structured data only when schema is accurate.

Private/local pages and identification jobs are not indexed.

## 19. Internationalization

- all interface strings go through localization layer once introduced;
- content language is explicit;
- no concatenated sentence fragments that break translation;
- units/numbers use locale formatting;
- scientific IDs remain unchanged;
- translations require review, not automatic generation.
