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

Phase 0C3 adds strict source, data-release, and asset manifest contracts plus a transport-neutral
provider boundary. A deterministic fictional provider exists only in tests. The production
manifest root is intentionally empty, and Lumina still has no catalog, product data, live
providers, provider dashboard, or accounts.

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
uv run mypy apps/api/src apps/api/tests scripts/data
uv run pytest -q
```

When Corepack is available, `corepack pnpm run check` is the preferred equivalent. Never use a
pnpm version that differs from the root `packageManager` field.

## Web development

The Next.js App Router application lives in `apps/web`.

```sh
pnpm dev
```

The development site is available at `http://127.0.0.1:3000`.

```sh
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm api:generate
pnpm api:check
pnpm manifests:check
pnpm check
```

`pnpm build` creates a production build. `pnpm test` runs focused unit/component checks, and
`pnpm test:e2e` runs the Playwright browser smoke tests.

`LUMINA_WEB_API_ORIGIN` is a server-only web setting. Development defaults to
`http://127.0.0.1:8000`; copy the safe value from `apps/web/.env.example` into a web-local ignored
environment file only when an override is needed. Production must configure an exact HTTP or HTTPS
origin without credentials, a path, query, or fragment. The value is never exposed through a
`NEXT_PUBLIC_` variable.

The committed OpenAPI JSON and generated TypeScript/Zod contract live in `packages/api-client`.
`pnpm api:generate` regenerates the complete artifact set, while `pnpm api:check` verifies freshness
without rewriting the repository.

`pnpm manifests:check` independently validates only `data/manifests`. Phase 0C3 approves no real
production manifests, so the documented empty set is valid. This command is intentionally not part
of root `pnpm check` until Phase 0C4.

## API development

`LUMINA_ENV` is required. The API reads a UTF-8 `.env` only from the repository root, and real
process environment variables take precedence. `.env.example` contains safe placeholders;
bootstrap atomically creates an ignored local `.env` only when absent and never overwrites it.

Start the API with:

```sh
LUMINA_ENV=development uv run lumina-api
docker compose --env-file .env up -d db
uv run alembic upgrade head
```

The database binds only to `127.0.0.1`; change `POSTGRES_HOST_PORT` explicitly in `.env` if 5432
is occupied. Development API documentation is available at `http://127.0.0.1:8000/docs`; liveness
is at `/health/live`, database readiness at `/health/ready`, and public metadata at `/api/v1/meta`.

Set `LUMINA_API_HOST=0.0.0.0` or `LUMINA_API_HOST=::` only when intentional network or container
access is required. An all-interface bind exposes the development API to every reachable network
interface; it does not add TLS, authentication, or a production proxy boundary.

## Internal worker development

Start the existing database and worker from the repository root:

```sh
docker compose up -d --wait db
uv run lumina-worker
```

The worker confirms readiness with exactly one structured stdout event and accepts SIGINT or
SIGTERM for bounded graceful shutdown. `LUMINA_WORKER_POLL_SECONDS` defaults to `2` and accepts
exact integers from 1 through 60. The process currently supports only the internal
`system.noop` handler and executes jobs sequentially. It is not added to Compose and requires an
external process supervisor in deployment environments.

Guarded worker integration tests must explicitly target the local test database:

```sh
LUMINA_ENV=test uv run pytest -q apps/api/tests/integration/jobs/test_worker.py
```

## Licensing status

Lumina currently has no project licence. All rights are reserved by default. Third-party data,
media, fonts, libraries, models, and other assets remain governed by their respective licences
and attribution requirements.

Scientific provenance, third-party attribution, dependency-licence review, and asset-manifest
requirements still apply. Licensing must be reconsidered before accepting outside contributions
or declaring Lumina open source.

## Implementation rule

Build Lumina incrementally. The complete vision is intentionally large. A phase is not complete because screens exist; it is complete only when its acceptance criteria, tests, scientific validation, accessibility, error states, source attribution, and documentation are complete.
