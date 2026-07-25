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

Phase 0B1 adds a database-independent FastAPI foundation to the Phase 0A workspace. It provides
process liveness, safe application metadata, validated configuration, structured request logs,
request IDs, CORS, security headers, and normalized public errors. It does not yet provide a web
application, database, readiness check, worker, provider integration, or product feature.

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

## Local setup

Required tool families are Node.js 24.x active LTS, Python 3.12.x, and a maintained uv capable
of reading `uv.lock`. pnpm is pinned exactly by the root `packageManager` field.

```sh
./scripts/bootstrap/setup.sh
npm exec --yes --prefer-offline --cache .cache/npm --package=pnpm@11.17.0 -- pnpm run check
uv run ruff format --check .
uv run ruff check .
uv run mypy apps/api/src apps/api/tests
uv run pytest -q
```

When Corepack is available, `corepack pnpm run check` is the preferred equivalent. Never use a
pnpm version that differs from the root `packageManager` field.

## API development

`LUMINA_ENV` is required. The API reads a UTF-8 `.env` only from the repository root, and real
process environment variables take precedence. `.env.example` contains the safe Phase 0B1
configuration; `.env` remains ignored and is never generated or overwritten by bootstrap.

Start the API with:

```sh
LUMINA_ENV=development uv run lumina-api
```

The safe default bind address is `127.0.0.1:8000`. Development API documentation is available at
`http://127.0.0.1:8000/docs`; liveness is at `/health/live`, and public application metadata is at
`/api/v1/meta`.

Set `LUMINA_API_HOST=0.0.0.0` or `LUMINA_API_HOST=::` only when intentional network or container
access is required. An all-interface bind exposes the development API to every reachable network
interface; it does not add TLS, authentication, or a production proxy boundary.

## Licensing status

Lumina currently has no project licence. All rights are reserved by default. Third-party data,
media, fonts, libraries, models, and other assets remain governed by their respective licences
and attribution requirements.

Scientific provenance, third-party attribution, dependency-licence review, and asset-manifest
requirements still apply. Licensing must be reconsidered before accepting outside contributions
or declaring Lumina open source.

## Implementation rule

Build Lumina incrementally. The complete vision is intentionally large. A phase is not complete because screens exist; it is complete only when its acceptance criteria, tests, scientific validation, accessibility, error states, source attribution, and documentation are complete.
