# Product Specification

## 1. Product promise

Lumina helps users answer:

1. What is out there?
2. How does it work?
3. What can I see from here and now?
4. What can I do next?

Every major page should answer at least two of these.

## 2. Personas

### Curious Explorer

Approximately 10–14, visual and new to astronomy. Needs concise explanations, direct manipulation, safe defaults, and no public interaction.

### Student

Approximately 14–20. Wants proper vocabulary, diagrams, data, experiments, quizzes, and optional mathematics.

### Beginner Observer

Uses naked eye or binoculars. Needs realistic targets, timing, direction, and simple instructions.

### Amateur Astronomer

Uses telescope/camera. Wants coordinates, field of view, planning, source detail, and image solving.

### Educator or Parent

Needs reliable, cited visual material, learning objectives, activities, and child-safe design.

### Deep-Dive Learner

Wants equations, uncertainty, source tables, catalog IDs, and model assumptions.

## 3. Presentation modes

### Explorer

- short concept chunks;
- familiar comparisons;
- minimal formulae;
- guided controls;
- more prompts;
- no patronizing language.

### Student

- standard vocabulary;
- diagrams and graphs;
- definitions;
- simple calculations;
- misconception checks;
- citations.

### Deep Dive

- full units;
- equations;
- error ranges;
- catalog fields;
- assumptions;
- advanced plots;
- references.

Mode changes presentation, not measured facts.

## 4. Navigation

Desktop:

- Home
- Explore
- Observe
- Learn
- Lab
- Space Now
- Identify
- My Lumina

Participate starts as a secondary area. Mobile uses Home, Explore, Observe, Learn, and More.

## 5. Mission Control

Required:

- Tonight Above You;
- Continue Learning;
- Current Space Event;
- Random Discovery;
- Saved Observation/Collection;
- Daily Visual.

Rules:

- location-dependent cards must ask permission;
- fresh data shows update time;
- no live provider may block the page;
- first use shows guided onboarding;
- unavailable providers show a specific state.

## 6. Explore

### Universal search domains

Objects, concepts, missions, spacecraft, people, observatories, lessons, simulations, and events.

### Search matching

- exact canonical name;
- alias;
- normalized catalog identifier;
- prefix;
- trigram/fuzzy;
- full text;
- structured filters;
- carefully parsed natural filter phrases.

Each result displays why it matched.

### Browsing filters

Stars: spectral class, constellation, distance, apparent magnitude, temperature, luminosity class, tonight visibility.

Exoplanets: size, mass, period, discovery method/year, host type, equilibrium temperature, status, completeness.

Deep sky: type, constellation, distance, magnitude, angular size, equipment, season.

Missions: agency, destination, status, launch year, type.

### Object page

1. Identity and hero
2. Why it matters
3. Interactive visual
4. Quick facts
5. Known / likely / unknown
6. Formation/history
7. Scale/comparison
8. Observation
9. Related missions
10. Related objects/concepts
11. Learn next
12. Sources

## 7. Observe

### Location options

- browser permission;
- manual latitude/longitude;
- local saved location labels;
- later reviewed geocoding adapter.

### Time

- current local default;
- historical/future time within validated range;
- IANA zone;
- explicit UTC offset;
- DST-safe conversion.

### Sky Tonight output

- sunset/twilight;
- Moon phase/illumination and rise/set;
- visible planets;
- ranked targets;
- altitude charts;
- best window;
- direction;
- difficulty;
- equipment;
- transparent score;
- optional weather;
- timestamp/model version.

### Planner inputs

- session start/duration;
- equipment;
- categories;
- difficulty;
- priority;
- minimum altitude;
- Moon preference.

### Planner output

- ordered targets;
- time per target;
- transition estimate;
- selection reason;
- warnings;
- fallback targets.

Never promise guaranteed visibility.

### Journal

Title, objects, date/time, location label, optional coordinates, equipment, conditions, notes, sketches/images, rating, tags, follow-up, and plate-solve reference. Stored locally by default.

## 8. Identify

First-version support:

- star fields;
- wide-field astrophotography;
- telescope imagery with detectable sources;
- JPEG, PNG, and selected FITS.

Do not promise identification of arbitrary bright dots.

Results:

- job state;
- center RA/Dec;
- pixel scale;
- orientation;
- field radius;
- parity;
- WCS output;
- annotated objects;
- overlay;
- metadata summary;
- processing source;
- limitations.

## 9. Learn

Initial paths:

1. Your First Night Sky
2. The Solar System
3. Stars and Stellar Evolution
4. Galaxies and the Universe
5. Black Holes and Compact Objects
6. Exoplanets and the Search for Life
7. Rockets and Spaceflight
8. Telescopes and Light
9. Missions and Exploration
10. Introductory Orbital Mechanics

Lesson structure:

- hook;
- objectives;
- prerequisites;
- visual;
- authored mode variants;
- real examples;
- misconception;
- activity;
- knowledge check;
- sources;
- next actions.

Question banks are curated and deterministic.

## 10. Space Lab

Every lab includes:

- objective;
- controls and units;
- default case;
- deterministic model;
- equations;
- assumptions;
- valid input range;
- invalid handling;
- visual and numeric result;
- reset;
- share/export state;
- accessible alternative;
- regression tests.

## 11. Space Now

### Launches

Upcoming/recent, countdown, status, window, provider timestamp, rocket, payload, site, agency, destination, and verified stream.

### Satellites

Curated groups, current element epoch, pass predictions, and warnings about orbital-element age.

### Near-Earth objects

Approach time, nominal distance, uncertainty when available, speed, size range, classification, and source.

### Space weather

NOAA scales, Kp, solar wind, alerts, aurora view, impacts, and timestamp.

### Discoveries

No automatic publication. Every entry has source, dates, review state, related entities, and media credit.

## 12. My Lumina

No login required. Includes presentation mode, interests, equipment, locations, collections, progress, journal, saved comparisons/simulations, dashboard layout, export/import, and clear-all action.

## 13. Participate

- curated active citizen-science links;
- time/device/skill filters;
- external handoff;
- observation challenges;
- printable activities;
- strong Sun-safety instructions.

## 14. Notifications

Use browser notifications, `.ics` downloads, and in-app reminders. No paid notification provider is required.

## 15. Safety

- Never recommend direct solar viewing without certified protection.
- Eclipse glasses are not telescope/binocular filters.
- Provide outdoor/night safety reminders.
- Do not provide hazardous propellant or rocket-construction guidance.
- Avoid alarmism in asteroid and space-weather content.
- Simulations are educational, not operational planning tools.
