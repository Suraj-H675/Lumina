# Technology Stack

Last research review: 2026-07-25.

## Version policy

- Bootstrap with current stable releases.
- Use no canary/beta/nightly dependency.
- Lock exact versions.
- Record major upgrades.
- Scientific upgrades require numerical regression tests.

Phase 0A runtime contracts:

- compatible Node.js 24.x active-LTS release; `.node-version` selects a recommended patch;
- pnpm pinned exactly through the root `packageManager` field and `pnpm-lock.yaml`;
- compatible Python 3.12.x release; `.python-version` selects a recommended patch;
- maintained uv `>=0.11.0` capable of reading the committed `uv.lock`;
- Corepack is preferred for pnpm activation but its patch version is not a project runtime
  requirement.

## Web

Required:

- active-LTS Node.js supported by selected Next.js;
- pnpm;
- stable Next.js 16.x or a later stable major at bootstrap;
- React required by Next.js;
- strict TypeScript;
- Tailwind CSS;
- Radix UI primitives;
- Motion for React;
- TanStack Query;
- Zustand;
- Dexie;
- Zod;
- generated OpenAPI TypeScript client;
- Three.js and React Three Fiber;
- WorldWide Telescope WebGL in the relevant phase;
- Apache ECharts for scientific charts.

Testing:

- Vitest;
- React Testing Library;
- Playwright;
- axe-core.

Rules:

- App Router only.
- Server Components by default.
- No duplicate handwritten API contracts.
- No mandatory proprietary font.
- No analytics SDK in baseline.

Official references:

- https://nextjs.org/docs/app
- https://nextjs.org/docs/app/getting-started/upgrading
- https://docs.worldwidetelescope.org/webgl-reference/latest/

## Backend

Phase 0B2 exact runtime:

- FastAPI `0.140.0`;
- Uvicorn `0.51.0`;
- Pydantic `2.13.4`;
- pydantic-settings `2.14.2`;
- HTTPX `0.28.1` for API tests.
- SQLAlchemy `2.0.51`, Alembic `1.18.5`, asyncpg `0.31.0`, and Psycopg `3.3.4` for PostgreSQL.

These packages are exact-pinned in the uv workspace lock. Their installed metadata identifies
FastAPI, Pydantic, and pydantic-settings as MIT-licensed, and Uvicorn and HTTPX as BSD-3-Clause.
They are local runtime or test libraries and introduce no paid service or third-party data
transfer. PostgreSQL is local and self-hostable; no hosted-database SDK is used. Later backend
dependencies remain unimplemented until their roadmap phase.

Runtime:

- Python 3.12 baseline;
- uv;
- FastAPI stable;
- Pydantic v2;
- SQLAlchemy 2;
- Alembic;
- asyncpg;
- HTTPX;
- PostgreSQL.

Scientific:

- Astropy;
- astroquery only in controlled adapters;
- Skyfield;
- a documented JPL ephemeris kernel;
- sgp4;
- astropy-healpix;
- NumPy;
- SciPy only when justified;
- Pillow/OpenCV only for deterministic image work;
- Astropy FITS support.

Quality:

- pytest;
- pytest-asyncio;
- Hypothesis;
- Ruff;
- mypy;
- coverage.py;
- respx.

Official references:

- https://fastapi.tiangolo.com/
- https://fastapi.tiangolo.com/deployment/versions/
- https://docs.astropy.org/
- https://rhodesmill.org/skyfield/

## Database

- PostgreSQL
- `pg_trgm`
- `timestamptz`
- UUID canonical IDs
- provider IDs retained separately
- JSONB only for raw/infrequent extras, not core schema

## Local personal data

- IndexedDB through Dexie
- versioned schema
- versioned export with checksums
- localStorage only for tiny non-sensitive flags

## Assets

- CSS variables for tokens
- system font stack initially
- approved open-source icons
- third-party asset manifest
- no required remote font

## Automation

- GitHub Actions
- Docker Compose
- multi-stage Docker builds
- Next.js standalone output where supported
- shell scripts use `set -euo pipefail`

## Excluded baseline technology

- LLM APIs/runtimes
- LangChain/LlamaIndex
- embeddings/vector databases
- GraphQL
- microservices
- Kubernetes/Kafka
- mandatory Firebase
- proprietary mapping SDK
- paid monitoring
- serverless-only design
- MongoDB for canonical records
- browser-direct scientific providers

## New dependency checklist

A dependency must have:

- a clear missing function;
- active maintenance;
- compatible licence;
- acceptable bundle/runtime cost;
- no paid core requirement;
- security review;
- tests;
- attribution documentation when needed.
