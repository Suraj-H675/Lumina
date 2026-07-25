# Phase 0 Bootstrap Specification

This document removes ambiguity for the first implementation phase.

## 1. Required local tools

- Git
- Docker with Compose when Phase 0B introduces the database service
- compatible Node.js 24.x active-LTS release
- pnpm pinned exactly by the root `packageManager` field, preferably activated via Corepack
- compatible Python 3.12.x release
- maintained uv `>=0.11.0` capable of reading the committed `uv.lock`

The bootstrap scripts check supported Node/Python families, the exact pinned pnpm version, and
uv lockfile compatibility. Recommended patch releases in `.node-version` and `.python-version`
must not cause other compatible patches to fail. Corepack's own patch version is not pinned.

If Corepack is unavailable, scripts first use the pinned pnpm through a repository-local,
non-elevated method. They never silently use another pnpm version. Global npm installation,
operating-system package changes, elevated commands, and changes outside the repository require
approval.

## 2. Default ports

- Web: 3000
- API: 8000
- PostgreSQL host: 5432
- Optional object storage: assigned only when introduced

Ports are configurable.

## 3. Root commands

After Phase 0 the repository must provide:

```text
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm api:generate
pnpm check

uv sync
uv run ruff format --check .
uv run ruff check .
uv run mypy apps/api/src
uv run pytest
```

A root `pnpm dev` may orchestrate web/API/worker through a documented script, but Python dependencies remain managed by uv.

Also provide:

```text
docker compose up -d db
docker compose down
docker compose down -v   # explicitly destructive
```

## 4. Initial web

Required routes only:

- `/` — honest project foundation page
- `/status` — static/app health shell when API available
- framework not-found/error/loading boundaries

Home includes:

- Lumina statement;
- no fake catalog/live values;
- link to repository docs/about;
- development status.

## 5. Initial API

Phase 0B1 endpoints:

- `GET /health/live`
- `GET /api/v1/meta`

`GET /health/ready` is introduced with the Phase 0B2 database prerequisite. It is intentionally
absent from the database-independent 0B1 application and OpenAPI contract.

`/api/v1/meta` returns:

- application name;
- version;
- environment-safe feature flags;
- API version;
- build commit if configured.

No secrets or infrastructure details.

## 6. Error middleware

- request ID from incoming safe header or generated UUID;
- structured logs;
- stable JSON error;
- validation mapping;
- unhandled exception mapping;
- development stack trace remains server log only.

## 7. Settings

Phase 0B2 typed settings:

- required runtime environment;
- API host and port;
- CORS origins;
- logging level;
- API-documentation override;
- optional public build commit.

Settings are loaded once and injected; tests can override explicitly.

The API requires its async runtime database URL; Alembic uses its separate synchronous migration
URL. Integration tests require isolated test runtime/migration URLs and `LUMINA_ENV=test`. Job,
provider, storage, timeout, public-URL, and trusted-proxy settings remain deferred.

## 8. Database baseline

Tables in first migration:

- schema/version support if needed;
- `job`;
- provider metadata may wait until Phase 1A unless needed for fake-provider architecture.

Do not create the entire future schema in Phase 0.

## 9. Worker baseline

- `worker` command;
- database connection;
- deterministic `system.noop` test job;
- claim/heartbeat/complete/fail;
- graceful shutdown;
- retry test;
- no external provider.

The noop job is not exposed as a product feature.

## 10. Web/API contract generation

- API OpenAPI written deterministically;
- generated TypeScript client in `packages/api-client`;
- script fails on uncommitted/stale generated output;
- client can call health/meta from web;
- no handwritten duplicate types.

## 11. CI jobs

Suggested separate jobs:

1. docs/data validation
2. web lint/type/unit/build
3. Python lint/type/unit
4. PostgreSQL integration/migrations
5. API client generation diff
6. Playwright smoke
7. security/dependency scans where available

Use caching but correctness must not depend on cache.

## 12. Initial test expectations

- health live;
- ready fails when DB unavailable and passes when available;
- error envelope;
- request ID;
- settings production validation;
- migration upgrade/downgrade;
- noop job lifecycle;
- web home/status;
- keyboard smoke;
- generated client call;
- no fixture mode in production.

## 13. Initial repository scripts

- `scripts/bootstrap/check-tools.sh`
- `scripts/bootstrap/setup.sh`
- `scripts/ci/check-doc-links.py`
- `scripts/ci/check-generated.sh`

Scripts are idempotent where practical.

## 14. Initial environment example

Only implemented Phase 0 variables from `23_ENVIRONMENT_VARIABLES.md` are included. Do not add
unused provider secrets.

Phase 0A has no runtime variables, so its `.env.example` contains comments only.
Phase 0B2 includes safe database placeholders. Bootstrap atomically creates a mode-0600 ignored
`.env` only when absent, with independently generated local credentials; it never overwrites one.
Because PostgreSQL entrypoint initialization scripts run only for a new data volume, bootstrap also
refuses to create `.env` if the exact Lumina Compose volume already exists. The developer must
restore the matching `.env` or follow the documented explicit manual recovery path; bootstrap never
deletes the volume, guesses old credentials, or rotates role passwords.

## 14A. Phase 0B1 server foundation

- Module-level `lumina.main:app` and the `lumina-api` command share one resolved settings object.
- The runner passes the application object and resolved host/port to Uvicorn.
- Uvicorn access logging is disabled and its log configuration is not allowed to replace Lumina's
  structured logger.
- `/docs`, `/redoc`, and `/openapi.json` share the validated environment/override policy.
- Request IDs, exact-origin CORS, safe response headers, normalized errors, and JSON access logs
  apply without database initialization.
- No database, migration, readiness, worker, provider, storage, or Supabase component is created.

## 15. Phase 0 non-goals

- catalog;
- search;
- login;
- user profile;
- WebGL scene;
- provider data;
- simulation;
- placeholder top-level navigation;
- fake dashboard cards.

## 16. Phase 0 completion evidence

The implementation report includes:

- fresh-clone setup commands;
- service URLs;
- migration result;
- test commands/results;
- screenshot of honest home/status;
- generated client verification;
- known platform limitations.
