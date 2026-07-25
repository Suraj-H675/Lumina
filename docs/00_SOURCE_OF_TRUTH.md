# Source of Truth

Last reviewed: 2026-07-25

This document resolves the central product and engineering decisions for Lumina. Coding agents must not reopen these decisions unless the user explicitly requests a change.

## Product statement

Lumina is a free, visual, scientifically grounded platform that connects five activities:

1. discovering space;
2. understanding space;
3. observing the real sky;
4. experimenting through deterministic simulations;
5. participating in astronomy and recording a personal journey.

Its defining user loop is:

> Discover → Explore visually → Understand → Simulate → Observe → Identify → Record → Continue learning

## Primary audience

- Curious children approximately 10+ with guided presentation
- Teenagers
- School and early university students
- Beginners
- Amateur observers
- Families and educators
- Advanced users who want source data and model details

Lumina must not describe itself as exclusively a children's product. It uses progressive disclosure so the same object can serve a new learner and an advanced learner.

## Product areas

The canonical top-level areas are:

1. Mission Control
2. Explore
3. Observe
4. Identify
5. Learn
6. Space Lab
7. Space Now
8. My Lumina
9. Participate

## Core differentiator

Lumina is not differentiated by having a 3D Solar System, a space encyclopedia, or a planetarium. Existing products already do those well.

Lumina is differentiated by connecting:

- visual exploration;
- authored education;
- live scientific data;
- deterministic sky calculations;
- observation planning;
- plate solving;
- simulations;
- personal progress and journals.

## Explicit non-goals

- No LLM.
- No generative content.
- No generic chatbot.
- No AI wrapper.
- No public social network.
- No unrestricted user-generated public content.
- No paid feature dependency.
- No requirement to create an account.
- No attempt to mirror every astronomical catalog.
- No 3D-only user experience.
- No unverified or automatically generated science news.
- No replacement for professional mission-planning, navigation, weather, or safety systems.

## Architecture decision

Use a modular monolith with:

- Next.js web application;
- FastAPI backend;
- PostgreSQL;
- one asynchronous worker process using the same backend codebase;
- provider adapters;
- local-first browser storage for personal data;
- optional object storage for image-identification jobs.

Do not use microservices during the planned roadmap.

## Data decision

Lumina maintains a curated canonical catalog and retrieves larger scientific catalogs through adapters. It does not download all Gaia or all external archive data.

Every external record must preserve provenance. External data is cached and refreshed server-side.

## Scientific calculation decision

- Use Astropy/Skyfield/SGP4-class deterministic libraries and documented formulas.
- Use JPL Horizons for development validation or controlled backend administrative queries only, not embedded direct public runtime traffic.
- Use external APIs for source data, not for opaque “intelligence.”
- Expose assumptions, uncertainty, freshness, and limitations.

## Personal data decision

The first complete product is local-first:

- settings;
- interests;
- progress;
- collections;
- observation plans;
- journal entries.

These live in IndexedDB and can be exported/imported. Optional cloud synchronisation is a later, separate decision and is not assumed.

## Visual technology decision

- Use WorldWide Telescope WebGL where it provides mature sky/deep-universe rendering.
- Use Three.js/React Three Fiber for custom educational simulations and object models.
- Provide reduced-motion and non-WebGL fallbacks.
- Do not use 3D merely as decoration.

## Content decision

Educational explanations, lessons, quizzes, myths, stories, and glossary entries are authored and reviewed content stored in version control. They are not generated at runtime.

## Free constraint

“Free” means:

- no paid API is required for core functionality;
- all core dependencies are open source or freely accessible under compatible terms;
- users do not pay;
- local development is fully functional without a paid account;
- the application remains portable and self-hostable.

It does not mean unlimited public hosting can be guaranteed at zero infrastructure cost forever. Provider adapters and deployment profiles must make costs controllable.

## Priority order

When scope pressure occurs, preserve in this order:

1. scientific correctness and honesty;
2. coherent user journey;
3. accessibility;
4. privacy and safety;
5. reliable core functionality;
6. performance;
7. visual polish;
8. breadth of content;
9. optional live integrations;
10. decorative effects.

## Success definition

Lumina is successful when a user can:

1. discover an object they did not already know;
2. understand why it matters;
3. manipulate a relevant visual or simulation;
4. determine whether and when it can be observed;
5. follow directions to find it;
6. save the experience;
7. inspect sources and uncertainty.

Not every object supports every step, but the product architecture must support the loop.
