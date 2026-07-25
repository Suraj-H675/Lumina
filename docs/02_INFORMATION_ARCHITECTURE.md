# Information Architecture

## Canonical routes

```text
/
├── /explore
│   ├── /explore/solar-system
│   ├── /explore/stars
│   ├── /explore/exoplanets
│   ├── /explore/deep-sky
│   ├── /explore/missions
│   ├── /explore/spacecraft
│   ├── /explore/history
│   └── /explore/concepts
├── /objects/[slug]
├── /concepts/[slug]
├── /missions/[slug]
├── /spacecraft/[slug]
├── /people/[slug]
├── /observatories/[slug]
├── /compare
├── /observe
│   ├── /observe/tonight
│   ├── /observe/sky
│   ├── /observe/planner
│   ├── /observe/events
│   └── /observe/equipment
├── /identify
│   └── /identify/[jobId]
├── /learn
│   ├── /learn/[pathSlug]
│   └── /learn/[pathSlug]/[lessonSlug]
├── /lab
│   └── /lab/[simulationSlug]
├── /now
│   ├── /now/launches
│   ├── /now/missions
│   ├── /now/satellites
│   ├── /now/near-earth
│   ├── /now/space-weather
│   └── /now/discoveries
├── /participate
├── /me
│   ├── /me/dashboard
│   ├── /me/collections
│   ├── /me/progress
│   ├── /me/journal
│   └── /me/import-export
├── /settings
├── /sources
├── /about
├── /privacy
├── /terms
└── /status
```

Create routes only when their phase starts. No dead placeholder navigation.

## Entity linking

All catalog entities use a stable UUID and unique public slug.

Relations include:

- body to parent system;
- planet to host star;
- moon to planet;
- mission to destination and spacecraft;
- launch to mission and vehicle;
- object to concept;
- lesson/simulation to concepts;
- event to objects/missions;
- observation to objects;
- media to entity;
- measurement to source record.

Preserve navigation context where helpful.

## Search result groups

1. Exact entity
2. Alias match
3. Lessons
4. Simulations
5. Related entities
6. Current events

Results include type, title, one-line description, match reason, credited thumbnail when available, and freshness badge for live data.

## Progressive disclosure

### Immediate

Key visual, one-sentence meaning, essential facts, primary action.

### Understand

Explanations, comparisons, relationships, observation/mission context.

### Evidence

Measurements, assumptions, uncertainty, identifiers, citations, and update timestamps.

## Empty states

State whether:

- no data exists;
- filters removed all results;
- provider failed;
- cached data is stale;
- the feature does not apply.

Always offer a useful next step.

## Shareable state

URLs may include selected entities, comparisons, simulation parameters, filters, and approximate sky state after explicit share action.

Never put exact private location, journal text, secret values, or upload identifiers in a public URL.
