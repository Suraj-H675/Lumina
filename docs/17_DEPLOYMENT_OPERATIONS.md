# Deployment and Operations

## 1. Deployment principle

Lumina is portable and self-hostable. No single hosting vendor is part of the product architecture.

Free tiers may be used for demos, but they can change. Core code must not depend on vendor-specific paid functionality.

## 2. Local profiles

### Minimal development

- web;
- API;
- PostgreSQL;
- no worker/provider sync;
- curated seed data.

### Full development

- web;
- API;
- worker;
- PostgreSQL;
- local object storage;
- optional self-hosted Astrometry.net;
- provider adapters with developer keys.

### Offline development

- seed catalog;
- content;
- fixture providers;
- no network.

## 3. Docker Compose services

Planned:

- `web`
- `api`
- `worker`
- `db`
- `object-storage` optional
- `astrometry` optional

Health checks are required. Volumes are named. Secrets are not in compose.

Phase 0B2 implements only `db`: PostgreSQL 18.4 is pinned to the verified Docker Official Image
OCI index digest `sha256:3a82e1f56c8f0f5616a11103ac3d47e632c3938698946a7ad26da0df1334744a`.
Verified 2026-07-25 against `registry-1.docker.io/library/postgres` by requesting and re-requesting
its OCI index manifest; it contains `linux/amd64` and the other supported local platforms. Buildx
was unavailable locally, so Docker Registry v2 inspection established the same official index
digest. The named volume is mounted at `/var/lib/postgresql` as required by PostgreSQL 18's official
image documentation. The host port is loopback-only; normal teardown is `docker compose down`,
never `down -v`.

Lumina explicitly pins the physical PostgreSQL data volume name to
`lumina_lumina_postgres_data`. `COMPOSE_PROJECT_NAME` and `docker compose -p` may change container
or network names, but they do not change this canonical volume. Multiple simultaneous Lumina
checkouts must not share this development volume unless a future isolation design explicitly
supports that workflow.

The PostgreSQL entrypoint executes `/docker-entrypoint-initdb.d` only when the named data volume is
first initialized. Bootstrap therefore refuses to generate `.env` when the exact
`lumina_lumina_postgres_data` volume exists but `.env` is absent: generating replacement passwords
would not change existing role passwords. Restore the matching ignored `.env`, or perform an
explicit manual local-development recovery: stop the service, preserve any needed data, then either
perform a reviewed credential rotation with the existing administrator credential or intentionally
reset the disposable local database. Neither bootstrap nor normal setup deletes volumes, guesses
credentials, or rotates passwords.

Before creating a missing `.env`, bootstrap first verifies Docker daemon access and inspects that
exact volume. Only an authoritative exact-volume absence permits credential generation; Docker,
context, permission, inspection, or malformed-output failures stop setup without changing `.env` or
Docker state. Bootstrap credentials are accepted only as direct environment values of exactly 64
ASCII hexadecimal bytes; newline-bearing or otherwise transformed values are rejected.
Exact inspection has no absence-inference fallback: only Docker's precise response for the exact
Compose volume being absent is accepted as `ABSENT`; every other inspection result is fail-closed.

Compose health requires both an accepting PostgreSQL process and an exact true result for the
required Lumina databases and roles. Application readiness remains independent: it uses the runtime
role and parameter-free `SELECT 1`.

## 4. Production profiles

### Demonstration profile

- public web;
- small API;
- managed/free PostgreSQL if available;
- live integrations selectively enabled;
- identification disabled if storage/CPU unavailable.

### Full self-hosted profile

- reverse proxy/TLS;
- web;
- API replicas if needed;
- worker;
- PostgreSQL backups;
- private object storage;
- optional solver;
- monitoring.

### Static education profile

A limited export/PWA package containing authored content, curated catalog, local simulations, and local personal data. It does not claim live data or server calculations.

## 5. Environment separation

- development
- test
- staging
- production

Each has separate database, keys, storage prefix/bucket, and allowed origins.

## 6. Configuration

All environment variables are validated at startup. Missing required production values fail startup with a safe message.

Feature flags can disable:

- provider;
- Space Now section;
- remote plate solving;
- uploads;
- specific simulation;
- public API docs.

Flags are operational, not a substitute for unfinished feature states.

## 7. Database migrations

Deployment order:

1. backup/restore point;
2. migration compatibility review;
3. apply expand-compatible migration;
4. deploy application;
5. backfill via job if needed;
6. later contract/remove obsolete schema.

Avoid long table locks. Large backfills never run inside startup.

Revision `0002_grant_job_runtime_dml` treats the paired runtime URL username as part of the
database migration contract. Do not switch that username by editing configuration alone. Apply a
future explicit ACL migration first. Revision 0002 upgrade and downgrade inspect direct/effective
ACLs and fail before changes when role identity or grant provenance is ambiguous; downgrade never
silently abandons grants on an earlier role. The runtime role must remain a standalone login role:
any direct or transitive membership in either direction blocks upgrade and downgrade. Exact ACL
identity includes the table or column, migration-role grantor, runtime-role grantee, privilege, and
non-grantable state. A changed grantor, overlapping grant, or `WITH GRANT OPTION` must be resolved
explicitly before reversal.

Phase 0B3A enqueue sets PostgreSQL transaction-local `statement_timeout` and `lock_timeout` from
`LUMINA_JOB_ENQUEUE_WAIT_TIMEOUT_MS` before request-dependent statements. The default is 5000 ms;
contention is rolled back and reported through a fixed safe category. Multi-host, Unix-socket,
implicit-host, fragmented, and query-overridden migration/runtime targets are rejected before an
engine is constructed. Raw URL strings containing a literal query delimiter are rejected before
SQLAlchemy parsing, including bare or empty-valued query components. ACL preconditions inspect
table privileges and all column `SELECT`, `INSERT`, `UPDATE`, and `REFERENCES` grants for runtime,
`PUBLIC`, and other non-owner principals.

Phase 0B3B1 claim sets the same transaction-local bounds from
`LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS`, default 5000 ms. A timeout rolls back the claim transaction
and never persists on a returned pool connection. A lost commit acknowledgement is reconciled on a
fresh independently bounded connection; `JobClaimOutcomeUnknown` is fatal for that claim caller
and must not trigger an immediate second claim. The reconciliation values and database diagnostics
must never be logged.

Phase 0B3B2 heartbeat reuses `LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS` for transaction-local
`statement_timeout` and `lock_timeout`. Each call owns one fresh short transaction and releases its
session/connection before returning success, ownership loss, a safe database error, or
process-control cancellation. A row-lock wait is bounded, rolled back, and leaves the pooled
connection settings reset. Heartbeat is owner-guarded and repeatable, so it does not use claim
commit reconciliation.

Phase 0B3B3 completion also reuses `LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS` for its transaction-local
statement and lock timeouts and independently activates `LUMINA_JOB_RESULT_MAX_BYTES`, default
61,440. Every call validates before persistence, owns one short transaction, checks PostgreSQL's
JSONB textual UTF-8 size against 65,536, performs the one guarded update, and releases its
session/connection before returning.

Because successful completion is terminal and persists a result, a lost commit acknowledgement is
not reported as ordinary retryable storage failure. The failed primary connection is discarded and
a fresh bounded connection reconciles exact completion evidence without returning the result
object. Exact evidence confirms success; definite same-owner running/no-write evidence is a fixed
operation failure; indeterminate evidence raises fatal `JobCompletionOutcomeUnknown`. Operators
and future callers must not automatically issue a second completion after that outcome.

Phase 0B3C1 failure and retry reuse `LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS`; no setting is added.
The failure statement and all reconciliation work use transaction-local statement and lock
timeouts. Retry delay is deterministic application policy, while PostgreSQL
`transaction_timestamp()` remains the scheduling and completion authority. Only claim increments
attempts.

Heartbeat, completion, and failure require the committed attempt as an ownership fence. A wrong
attempt is indistinguishable ownership loss and must not be diagnosed. After a returned failure
mutation, commit uncertainty quarantines the primary backend and reconciles on a distinct bounded
connection using Boolean evidence only. Exact committed state returns success, exact unchanged
running state is a fixed operation failure, and all other evidence raises fatal
`JobFailureOutcomeUnknown`. Operators and future worker code must never repeat the failure write
or claim another job after that unknown outcome.

Phase 0B3C2 activates `LUMINA_JOB_STALE_SECONDS`, default 120 and bounded from 2 through 86,400,
and reuses `LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS`. Each explicit invocation opens one short
transaction, installs transaction-local statement and lock timeouts, and recovers at most 100 stale
running rows using PostgreSQL time and `FOR UPDATE SKIP LOCKED`. An empty batch rolls back rather
than requiring a mutating commit.

A positive batch commits once. If commit acknowledgement is uncertain, the primary connection is
quarantined, recovery is not repeated, no rows are diagnosed or reconciled, and fatal
`JobRecoveryOutcomeUnknown` must stop the future worker lifecycle. Confirmed commit followed by
unsafe cleanup is a fixed recovery operation failure, not an unknown database outcome. Phase
0B3C2 adds no recovery cadence, worker identity, polling, heartbeat orchestration, signals,
graceful shutdown, or CLI.

Phase 0B3C3 activates `LUMINA_WORKER_ID_PREFIX`, `LUMINA_JOB_HEARTBEAT_SECONDS`,
`LUMINA_JOB_HANDLER_TIMEOUT_SECONDS`, and `LUMINA_JOB_CANCELLATION_GRACE_SECONDS`. A process owner
token is constructed once from the validated prefix and UUIDv4, then injected into the one-job
executor. Staleness must be at least two heartbeat intervals plus the rounded-up database
operation wait; cancellation grace cannot exceed handler timeout.

One executor invocation claims at most one job. It supervises one handler and one periodic
attempt-fenced heartbeat using monotonic absolute deadlines, then calls one accepted terminal
capability. Fixed settlement-unknown errors and accepted lifecycle outcome-unknown errors are
fatal to that invocation. C3 deliberately adds no process composition, polling/no-job delay,
repeated claim, recovery cadence, signals, graceful shutdown, startup event, CLI, or hard-exit
behavior.

Phase 0B3C4 adds the internal `lumina-worker` command and activates only
`LUMINA_WORKER_POLL_SECONDS`, default `2`. Construction order is CLI parsing, process-output
activation, settings, engine, fully cleaned read-only compatibility check, lifecycle services and
static registry, signals, one identity, readiness linearization, complete startup output, shutdown
recheck, then initial recovery. Startup failure unwinds established resources in reverse-safe
order, writes only the fixed failure sentence while output remains active, and restores descriptor
modes last. Graceful shutdown before readiness omits both startup and failure output.

The process runs one recovery or executor operation at a time. SIGINT/SIGTERM interrupts idle
polling immediately; recovery and claims reach accepted definite boundaries; a confirmed active
handler receives one outer cancellation; terminal settlement is never newly cancelled. Exit `0`
means help or fully settled graceful shutdown, `1` means startup/runtime/cleanup failure, and `2`
means silent invalid CLI invocation.

The worker contains no scheduler or supervisor. Deployments remain responsible for restart policy,
resource limits, and process observation. Settlement-unknown live handler, heartbeat, output,
startup-check, engine, or cleanup tasks use bounded fatal output/cleanup and exactly one hard exit
with status `1`, avoiding ordinary async-runner shutdown.

## 8. Backups

Production:

- automated PostgreSQL backup;
- documented retention;
- encrypted storage;
- restore test;
- object-storage lifecycle;
- manifests/content already in Git.

Local-first user data is the user's responsibility; Lumina provides export reminders and clear backup instructions.

## 9. Provider operations

Each provider has:

- enable flag;
- key/config;
- polling schedule;
- timeout;
- rate limiter;
- circuit breaker behavior;
- cache TTL;
- last successful sync;
- status page label.

A provider is disabled rapidly without redeploying where configuration allows.

## 10. Scheduled jobs

Examples:

- exoplanet curated sync weekly;
- current discovery count daily;
- launch sync hourly, more frequent near events within provider policy;
- CelesTrak selected groups every 4–8 hours;
- NOAA products every few minutes according to product;
- media/credit integrity weekly;
- stale record cleanup daily;
- upload deletion hourly/daily;
- content integrity on deploy.

Schedules are configurable and jittered to avoid synchronized bursts.

## 11. Monitoring

Free/open options preferred.

Minimum:

- structured logs;
- health endpoints;
- provider freshness dashboard;
- job queue metrics;
- database health;
- disk/storage limits;
- HTTP error/latency;
- client web-vitals sampling only after privacy decision.

No private payloads in telemetry.

## 12. Status page

`/status` shows:

- application version;
- catalog availability;
- live-data providers;
- last sync;
- known outage;
- identification availability;
- stale-data explanation.

Do not expose hostnames, stack traces, database details, or quotas.

## 13. Incident cases

### Provider outage

Serve cache if safe, mark stale, reduce retries, update status.

### Bad provider data

Disable ingestion, retain last good normalized records, quarantine new batch, investigate parser/schema.

### Migration failure

Stop deploy, restore/revert according to migration strategy, never force inconsistent startup.

### Upload abuse

Disable uploads, preserve core, delete malicious objects, rotate affected secrets, review logs.

### Scientific bug

Mark affected calculated data, increment algorithm version after fix, invalidate derived cache, publish correction note if public.

## 14. Deployment checks

- config validated;
- migrations applied;
- health ready;
- seed/content version known;
- provider keys server-only;
- CORS/CSP correct;
- API docs policy;
- upload limit;
- cleanup schedule;
- source/asset manifests;
- smoke tests.

## 15. Cost controls

- server-side caching;
- bounded provider polling;
- no huge catalog mirror;
- responsive media;
- storage lifecycle;
- optional expensive features;
- queue limits;
- duplicate upload hashes;
- static delivery for content;
- no paid core API.

The application must communicate when a resource-heavy optional service is unavailable rather than charging users or silently failing.
