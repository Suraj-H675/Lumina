# Lumina

Lumina is a free, visual, scientifically grounded space exploration, learning, observation, simulation, and participation platform.

It is designed for curious children, teenagers, beginners, students, amateur astronomers, and anyone who wants one coherent place to:

- explore the universe visually;
- understand astronomy and space science;
- discover what is visible from their location;
- plan and record real observations;
- identify astronomical images through plate solving;
- run deterministic educational simulations;
- follow launches, missions, satellites, near-Earth objects, and space weather;
- build a personal, local-first space journey.

Lumina does **not** use an LLM, generative-AI assistant, or AI-wrapper architecture. Scientific truth comes from curated content, documented public scientific data, deterministic calculations, transparent models, and explicit citations.

## Repository status

This repository begins as a clean rebuild. The previous Lumina prototype is not an architectural dependency and must not be copied into this repository unless a specific asset is reviewed and approved.

Before writing implementation code, read these files in order:

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/00_SOURCE_OF_TRUTH.md`](docs/00_SOURCE_OF_TRUTH.md)
3. [`PLAN.md`](PLAN.md)
4. [`docs/01_PRODUCT_SPEC.md`](docs/01_PRODUCT_SPEC.md)
5. [`docs/03_ARCHITECTURE.md`](docs/03_ARCHITECTURE.md)
6. [`docs/18_IMPLEMENTATION_ROADMAP.md`](docs/18_IMPLEMENTATION_ROADMAP.md)
7. The domain-specific specification for the feature being implemented.

## Core product areas

1. Mission Control
2. Explore
3. Observe
4. Identify
5. Learn
6. Space Lab
7. Space Now
8. My Lumina
9. Participate

## Licensing intent

- Source code: MIT License, unless the repository owner changes this explicitly.
- Original educational content: Creative Commons Attribution 4.0, unless stated otherwise.
- Third-party data, images, fonts, models, and media retain their original licences and must be tracked individually.
- No third-party asset may be committed without recorded source, licence, credit, and permitted use.

## Implementation rule

Build Lumina incrementally. The complete vision is intentionally large. A phase is not complete because screens exist; it is complete only when its acceptance criteria, tests, scientific validation, accessibility, error states, source attribution, and documentation are complete.
