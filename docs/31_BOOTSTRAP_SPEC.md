# Phase 0 Bootstrap Specification

This document removes ambiguity for the first implementation phase.

## 1. Required local tools

- Git
- Docker with Compose when Phase 0B introduces the database service
- compatible Node.js 24.x active-LTS release
- pnpm pinned exactly by the root `packageManager` field, preferably activated via Corepack
- compatible Python 3.12.x release
- maintained uv `>=0.11.0` capable of reading the committed `uv.lock`

Phase 0C4 CI uses the exact verified runtime set Node.js 24.16.0, pnpm 11.17.0, Python 3.12.13,
and uv 0.12.1. The accepted local gate requires Node.js major 24 and pnpm 11.17.0; its uv parser
accepts `uv 0.12.1` with trailing official build metadata but rejects every other semantic release.
The setup-uv action and installed uv binary are pinned independently; setup-uv must download the
exact binary from the official GitHub release rather than selecting a current version or using the
Astral mirror.

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
pnpm api:check
pnpm manifests:check
pnpm docs:check
pnpm migrations:check
pnpm security:check
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
- `/status` — dynamic, no-store API foundation health summary that remains renderable when unavailable
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

Phase 0B2 typed settings, the Phase 0B3A enqueue limits, the Phase 0B3B1/B2/B3 job-operation
timeout, the Phase 0B3B3 result limit, and the Phase 0B3C2 stale threshold:

- required runtime environment;
- API host and port;
- CORS origins;
- logging level;
- API-documentation override;
- optional public build commit.
- job payload maximum bytes;
- default maximum attempts.
- claim, heartbeat, completion, and completion-reconciliation operation wait timeout.
- successful-result maximum bytes.
- stale-running-job threshold.
- worker owner prefix;
- heartbeat interval;
- handler timeout;
- cancellation-settlement grace.

Settings are loaded once and injected; tests can override explicitly.

The API requires its async runtime database URL; Alembic uses its separate synchronous migration
URL plus the paired runtime URL solely to derive and validate revision 0002's runtime ACL role.
Integration tests require isolated test runtime/migration URLs and `LUMINA_ENV=test`. Worker,
provider, storage, later operation-specific timeout, public-URL, and trusted-proxy settings remain
deferred.

## 8. Database baseline

Tables in first migration:

- schema/version support if needed;
- `job`;
- provider metadata may wait until Phase 1A unless needed for fake-provider architecture.

Do not create the entire future schema in Phase 0.

The second migration is ACL-only. It grants the paired runtime role table SELECT, enqueue-column
INSERT, and approved lifecycle-column UPDATE without transferring table ownership. Its downgrade
fails closed unless the configured runtime role uniquely holds the exact grants introduced by the
revision. The accepted first migration remains unchanged.

## 9. Worker baseline

- `worker` command;
- database connection;
- deterministic `system.noop` test job;
- claim/heartbeat/complete/fail;
- graceful shutdown;
- retry test;
- no external provider.

The noop job is not exposed as a product feature.

Phase 0B3A implements only validated, idempotent enqueue for `system.noop`. Claim, heartbeat,
completion, failure, retry, recovery, execution, worker process, handler, signal, and CLI behavior
remain deferred to later Phase 0B3 gates. Phase 0B3B1 then implements only atomic claim and passive
mapping of every PostgreSQL JSONB form. It does not add heartbeat updates, completion, failure,
retry, recovery, execution, a worker process, handlers, signals, or CLI behavior.
Claim returns a typed no-eligible-row outcome, bounds its transaction locally, and reconciles a
potentially lost commit acknowledgement without issuing another claim.

Phase 0B3B2 then implements only the internal owner-guarded heartbeat service. It updates only
`heartbeat_at` from PostgreSQL time where job ID, `running` status, and owner match. Every
zero-row outcome is indistinguishable ownership loss, and every call is an independent bounded
transaction that releases its pool checkout before returning. It adds no completion, result
persistence, failure, retry, recovery, execution, worker loop, polling, handler, signal, CLI,
public route, migration, or claim-style commit reconciliation behavior.

Phase 0B3B3 then implements only internal owner-guarded successful completion. It accepts a
validated bounded JSON-object result, sets the exact succeeded-state fields using PostgreSQL time,
retains ownership timestamps, and makes every zero-row outcome indistinguishable ownership loss.
A potentially lost commit acknowledgement is reconciled on a fresh bounded connection without
retrieving the stored result or issuing a second mutation. Failure transitions, retries, stale
recovery, execution, worker loops, polling, handlers, signals, CLI, public routes, and migrations
remain deferred.

Phase 0B3C1 then adds only closed owner/status/attempt-guarded failure and retry transitions.
Heartbeat and completion also gain the attempt fence before retry requeueing is available.
Retryable remaining attempts requeue using deterministic delay and PostgreSQL time; exhausted
retryable attempts become `dead_letter`, and non-retryable failures become `failed`. Failure
codes/messages are fixed catalog values. A potentially lost failure commit acknowledgement uses a
fresh bounded distinct backend and Boolean-only reconciliation without a second mutation. Stale
recovery, handlers, execution, worker loops, polling, identity, signals, CLI, public routes,
settings, and migrations remain deferred.

Phase 0B3C2 then adds only one explicit atomic stale-running-job recovery batch. PostgreSQL selects
at most 100 eligible rows in oldest-lease, claim-time, then ID order with `FOR UPDATE SKIP LOCKED`.
It requeues non-exhausted attempts without incrementing attempts and dead-letters exhausted
attempts with the canonical stale-exhaustion error. Empty batches roll back; ambiguous positive
commit acknowledgement is fatal and is neither reconciled nor retried. Handler execution,
the `system.noop` handler, worker identity/cadence, polling, heartbeat orchestration, signals,
graceful shutdown, CLI, public routes, migrations, and ACL changes remain deferred.

Phase 0B3C3 then adds only a literal static registry containing `system.noop`, object-only noop
validation with `{}` output, redacted UUIDv4 owner construction, and one-job execution. One
invocation claims once, creates one handler and one periodic attempt-fenced heartbeat task, uses
monotonic deadlines and deterministic simultaneous-outcome precedence, and settles cancellation
within the configured grace. Fixed settlement-unknown and accepted lifecycle outcome-unknown
errors are fatal. Polling, no-job delay, repeated claims, recovery cadence, process composition,
signals, graceful shutdown, startup events, CLI, hard exit, public routes, migrations, and ACL
changes remain deferred.

Phase 0B3C4 then composes the accepted capabilities into the internal `lumina-worker` command.
After process-lifetime nonblocking output activation, it validates settings and exact runtime-role
database compatibility, constructs services and the static registry, installs signals, creates
one owner, emits the fixed startup event through the readiness gate, performs one initial recovery
batch, and runs sequential recovery/poll/execution scheduling. Cleanup and settlement-unknown hard
termination are deadline-bounded. No migration, ACL, state, handler, dependency, route, generated
contract, Docker/Compose service, scheduler, Redis queue, or supervisor is added.

## 10. Web/API contract generation

- API OpenAPI written deterministically;
- generated TypeScript and Zod contract in `packages/api-client`, with no generated SDK;
- read-only check fails on stale committed OpenAPI or generated output without consulting unrelated
  working-tree changes;
- bounded server-only transport can call health/meta from web;
- no handwritten duplicate types.

## 10A. Phase 0C3 provenance boundary

Phase 0C3 provenance is file-backed and database-free. Production code contains three immutable
Pydantic manifest contracts and the request/raw-payload/validated-payload/result provider protocol.
The production manifest root is empty-valid and checked by a read-only fixed-root command. The only
provider implementation and all fictional data remain under tests.

This gate adds no settings or environment variables, production provider, registry, network call,
cache execution, database table or migration, API route or OpenAPI shape, generated client file,
worker handler, job, scheduler, Docker service, or UI. Root `pnpm check` composition remains
unchanged until Phase 0C4.

## 11. CI jobs

Phase 0C4 defines four isolated executable jobs and one acceptance aggregator:

1. `repository`: frozen pnpm/uv restore, format/lint/type/unit, generated-client freshness,
   manifests, candidate-aware Markdown links, and immutable migration history;
2. `python_postgres`: Ruff, mypy, shell syntax, guarded real-PostgreSQL migrations and tests, then
   unconditional Compose volume and generated-environment cleanup;
3. `web_e2e`: frozen install, production build, exact Playwright 1.62.1 verification,
   Chromium-only browser installation, E2E/accessibility smoke, process/output cleanup, and bounded
   failure artifacts;
4. `security`: full non-shallow checkout, history/current-candidate TruffleHog scans, and
   lockfile-only OSV scan;
5. `phase0_acceptance`: no checkout; requires all four results to be successful.

Official actions are full-commit pinned and scanner images use tag-plus-top-level-digest references.
Every checkout disables persisted credentials; security alone uses full history. setup-node owns the
only pnpm cache and setup-uv the only uv cache. Frozen lock validation and installation follows
every restore, no broad restore prefix is configured, and no job caches `node_modules`, `.venv`,
Python installations, or Playwright browsers. Cache access on forks remains controlled by GitHub
and cannot bypass the lockfiles.

After intentional cleanup, every checkout job proves the working tree, index, and nonignored
untracked candidate are clean. Jobs do not format, regenerate, restore, or clean files to make this
assertion pass. The Python job removes only its generated `.env` with a single-file unlink after
Compose teardown. The web job separately proves Next/Playwright outputs are ignored and test
processes are gone. The security wrapper removes its private temporary root on normal exit and
signals.

GitHub Ubuntu installs Chromium and required system packages with:

```sh
pnpm --filter @lumina/web exec playwright install --with-deps chromium
```

The accepted local Arch Linux validation instead uses:

```sh
pnpm --filter @lumina/web exec playwright install chromium
```

Hosted workflow success is separate evidence and is not inferred from local implementation.

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
