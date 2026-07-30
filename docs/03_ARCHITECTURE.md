# Architecture

## 1. Style

Lumina uses a modular monolith. Web, API, and worker can run as separate processes, but the backend remains one codebase and one database.

This minimizes operational cost, preserves transactional consistency, simplifies local development, and avoids premature distributed systems.

Phase 0B2 implements the PostgreSQL prerequisite with separate least-privilege runtime and
migration roles. The API constructs its async pool lazily; migration code uses a separate synchronous
Psycopg connection and never imports the ASGI application.

## 2. Runtime components

```text
Browser / PWA
    |
    | HTTPS
    v
Next.js Web
    |
    | generated typed API client
    v
FastAPI Application
    |             \
    |              \ enqueue
    v               v
PostgreSQL       Worker Process
    ^               |
    |               +--> provider adapters
    |               +--> ingestion
    |               +--> plate solving
    |               +--> media processing
    |
Optional private object storage
```

## 3. Backend modules

- `shared`
- `catalog`
- `search`
- `astronomy`
- `observability`
- `planning`
- `content`
- `learning`
- `simulations`
- `missions`
- `live_data`
- `satellites`
- `identification`
- `media`
- `provenance`
- `jobs`

A module may contain:

- `domain`: entities, value objects, policies, interfaces;
- `application`: use cases;
- `infrastructure`: SQL repositories and provider adapters;
- `api`: FastAPI routes and public schemas;
- `tests`.

## 4. Dependency rules

Allowed:

- API → application
- application → domain
- infrastructure → domain interfaces
- composition root → modules

Forbidden:

- domain → FastAPI/SQLAlchemy/provider SDK;
- route → direct SQL;
- React → scientific provider;
- React → scientific formula;
- database model → public response;
- one module → another module's infrastructure internals.

## 5. Web architecture

- Next.js App Router
- Server Components for read-oriented pages
- Client Components only for interaction, browser APIs, WebGL, IndexedDB, and simulations
- route loading/error boundaries
- generated OpenAPI client
- TanStack Query for interactive server state
- Zustand for transient visualization state
- Dexie for local-first personal data
- PWA/service worker added in its roadmap phase

## 6. API architecture

- Prefix `/api/v1`
- JSON
- OpenAPI as contract source
- stable error format
- cursor pagination for large/changing collections
- page pagination only for bounded lists
- ETags/Last-Modified where appropriate
- freshness metadata for live data
- idempotency keys for costly job creation

## 7. Database

PostgreSQL stores:

- canonical entities;
- aliases;
- type-specific object data;
- measurements;
- provenance;
- relationships;
- mission and event data;
- authored-content metadata;
- provider cache metadata;
- job state;
- temporary image-job metadata.

Local personal data is not stored server-side by default.

Extensions:

- `pg_trgm`
- no required PostGIS, pgSphere, or vector extension
- HEALPix cell columns calculated in Python for indexed sky regions

## 8. Provider adapters

Each adapter must define:

- typed request and response;
- timeout;
- retry policy;
- rate limiter;
- provider error mapping;
- schema/version handling;
- cache/freshness policy;
- attribution;
- sanitized fixtures;
- normalization into Lumina data.

No provider payload is returned directly to clients.

## 9. Ingestion pipeline

1. Fetch
2. Validate transport
3. Validate provider schema
4. Record response metadata/checksum where allowed
5. Normalize units and IDs
6. Resolve canonical entity
7. Store source record
8. Store measurements
9. Calculate versioned derived fields
10. Refresh search representation
11. Record metrics and job result

Idempotency key: provider + provider record ID + source version/date.

## 10. Astronomy domain

Owns:

- coordinate parsing and frames;
- time scales;
- ephemerides;
- altitude/azimuth;
- rise/transit/set;
- angular separation;
- Moon calculations;
- satellite propagation;
- scale/physical conversion;
- validation reference calculations.

Internal values use typed quantities. Public responses always include units.

## 11. Background jobs

Baseline queue is database-backed to avoid mandatory Redis.

Phase 0B3A introduces only the enqueue boundary. Domain validation accepts the internal
`system.noop` type, bounded JSON-object payloads, safe idempotency keys, PostgreSQL-smallint
priorities, and one through five maximum attempts. The application assigns UUIDv4 identifiers.
The PostgreSQL adapter performs an atomic insert or exact replay comparison across job type,
JSONB-equal payload, priority, and maximum attempts. It exposes no public route and performs no
claiming or execution. Each enqueue transaction sets bounded transaction-local statement and lock
timeouts before issuing request-dependent SQL. Database failures cross the adapter boundary only as
fixed safe categories for unavailable transport, contention, database state, SQL/schema/ACL
programming, or otherwise unexpected database operations; raw SQLAlchemy exceptions and bound
parameters never escape.

Database access is capability-specific: 0B3A defines only an enqueue protocol. PostgreSQL-specific
SQL remains in job infrastructure; domain and application modules do not import SQLAlchemy,
FastAPI, asyncpg, Psycopg, CLI, worker, or signal code.

Phase 0B3B1 adds only atomic selection and passive mapping of one eligible queued row. The claim
uses `FOR UPDATE SKIP LOCKED`, transitions the row to `running`, records ownership timestamps, and
increments attempts in the same statement. `ClaimedJob` exposes exactly its identifier, passive
persisted type name, passive payload, attempts, maximum attempts, claimed timestamp, and heartbeat
timestamp. A persisted payload accepts every decoded PostgreSQL JSONB form, including an explicit
JSON null representation, and recursively exposes objects and arrays as read-only values. It does
not canonicalize, apply enqueue or handler validation, consult the application payload-size
setting, or select/import/dispatch/execute code. No-row detection is based only on whether
`RETURNING` produced a row and returns a typed `NoEligibleJob`.

Claim transactions install bounded transaction-local statement and lock timeouts before the atomic
statement. A returned candidate is committed explicitly. If the commit acknowledgement is
potentially lost, the failed connection is invalidated and a fresh bounded read-only transaction
reconciles only the job ID, owner, attempt, claimed timestamp, and heartbeat timestamp. An exact
match returns the original fully redacted claim, a definitely unchanged queued row is a fixed
operation failure, a foreign owner is a fixed database-state failure, and missing, terminal,
mismatched, unreadable, or unavailable evidence raises fatal `JobClaimOutcomeUnknown`. Claim never
issues a second claim while resolving an indeterminate outcome.

Phase 0B3B2 adds one separate heartbeat capability. Its application request contains only a UUID
and a B1-compatible validated owner token. The PostgreSQL adapter executes one explicit update:
`heartbeat_at = transaction_timestamp()` where the identifier matches, status is `running`, and
`claimed_by` matches the expected owner. It performs no read-before-write and no diagnostic read
after a zero-row result. Missing, queued, terminal, or foreign-owned rows all produce the same
fixed `JobOwnershipLost`; one returned timezone-aware timestamp produces the redacted success
value.

Every public heartbeat call creates and closes a fresh session around one short transaction,
installs transaction-local statement and lock timeouts from
`LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS`, maps while rollback remains possible, and returns only
after commit/rollback and pool release. Repeated correct-owner calls are valid, including equal
PostgreSQL transaction timestamps. Heartbeat adds no completion, result persistence, failure,
retry, recovery, handler, execution, worker loop, polling, signal, CLI, public route, migration,
or commit reconciliation behavior.

Phase 0B3B3 adds only owner-guarded successful completion. Its application boundary validates a
UUID, the existing owner token, and an immutable top-level JSON-object result. Result validation
uses the enqueue boundary's 32-level nesting limit but additionally requires signed 64-bit
integers; canonical compact, sorted, UTF-8-preserving JSON is bounded by
`LUMINA_JOB_RESULT_MAX_BYTES` before persistence. The PostgreSQL adapter independently checks the
JSONB textual UTF-8 representation against the existing 65,536-byte constraint in the same short
transaction.

Completion performs one update guarded by identifier, `running` status, and expected owner. It
sets `succeeded`, the bound result, progress `1`, PostgreSQL `transaction_timestamp()` completion
time, and null error fields. Ownership and claim/heartbeat timestamps remain on the succeeded row.
All zero-row outcomes are the existing indistinguishable `JobOwnershipLost`, without a diagnostic
read.

Once the update returns, commit acknowledgement is explicit. A potentially lost acknowledgement
invalidates the primary connection and reconciles on a genuinely fresh, independently bounded
connection using only status, owner, completion time, JSONB result equality, progress, and error
nullness. Exact evidence returns success, a definitely unchanged same-owner running row is a fixed
operation failure, and all mismatched, missing, unreadable, or indeterminate evidence raises fatal
`JobCompletionOutcomeUnknown`. Reconciliation never performs a second completion mutation.
Completion adds no failure transition, retry, recovery, handler, execution, worker loop, polling,
signal, CLI, or public route.

Phase 0B3C1 evolves every attempt-owned mutation to require the committed claim attempt as well as
job ID, `running` status, and owner. `ExpectedJobAttempt` accepts only exact integers one through
five. Heartbeat, successful completion, completion reconciliation, and failure all bind this value;
a wrong attempt is the existing indistinguishable `JobOwnershipLost` and never triggers a
diagnostic read. This prevents delayed work from an earlier attempt from mutating a later claim by
the same process owner.

Failure is a separate narrow capability. `FailJobRequest.create` accepts only the fixed production
`FailureReason` catalog and derives retry classification and deterministic delay internally.
Retryable failure with attempts remaining clears running ownership/lifecycle/result/error fields,
resets progress, and schedules `queued` availability from PostgreSQL time. Exhausted retryable
failure becomes `dead_letter`; non-retryable failure becomes `failed`. Both terminal branches
retain historical ownership, claim, heartbeat, progress, attempts, and availability evidence,
clear result, and use PostgreSQL completion time plus the fixed catalog error.

The PostgreSQL failure adapter performs one owner/status/attempt-guarded statement. After a returned
mutation, a potentially lost commit acknowledgement uses the accepted bounded quarantine pattern
and a genuinely distinct backend. Reconciliation returns only two Boolean facts: exact transition
or exact unchanged running. Exact unchanged evidence includes null result and produces a fixed
operation failure; every missing, mismatched, malformed, overlapping, or unavailable outcome is
fatal `JobFailureOutcomeUnknown`. Failure is never issued a second time to resolve ambiguity.

Phase 0B3C2 adds only one atomic stale-running-job recovery capability. Eligibility is
`status = 'running'` with `COALESCE(heartbeat_at, claimed_at)` at or before PostgreSQL
`transaction_timestamp() - make_interval(secs => :stale_seconds)`. One materialized CTE orders by
oldest lease, claim timestamp, and ID, locks at most 100 rows with `FOR UPDATE SKIP LOCKED`, and
updates that batch in the same statement. Recovery never accepts a clock or batch size from its
caller.

Stale attempts with attempts remaining return to `queued` at PostgreSQL transaction time, clear
ownership, lifecycle completion, result, progress, and error fields, and do not increment attempts.
Exhausted stale attempts become `dead_letter`, clear result, record PostgreSQL completion time and
the canonical `FailureReason.STALE_ATTEMPTS_EXHAUSTED` code/message, and retain owner, claim,
heartbeat, progress, availability, and attempt history. Python receives only validated requeued and
dead-lettered aggregate counts.

An empty batch is rolled back and cleaned up without a mutating commit. A positive batch is
committed once under one shared monotonic lifecycle deadline. Uncertain commit acknowledgement
quarantines the connection, performs no reconciliation or second recovery, and raises fatal
`JobRecoveryOutcomeUnknown`; confirmed commit plus unsafe cleanup is instead a fixed recovery
operation failure. C1 attempt fences prevent delayed work from an earlier attempt from mutating a
later same-owner claim after recovery.

Phase 0B3C3 adds a one-invocation, one-claim execution boundary using only the accepted narrow
claim, heartbeat, completion, and failure capabilities. A literal immutable production registry
contains exactly `system.noop`; there is no dynamic import, module-path resolution, entry-point
discovery, plugin loading, reflection dispatch, or payload-selected handler. The noop accepts any
top-level persisted JSON object without inspecting or echoing its fields and returns exactly `{}`.
Unsupported types and synchronously incompatible payloads fail without starting heartbeat
supervision.

For a valid handler, execution creates one handler task and one periodic heartbeat-supervisor task.
Deadlines use the event loop's monotonic clock. Heartbeats are sequential, owner/status/attempt
fenced, first occur after one interval, and reschedule from current monotonic time after each
completed call, so delayed calls cannot create catch-up bursts. Handler success/failure and
heartbeat results use a fixed precedence: heartbeat ownership loss always wins; an already-known
handler outcome wins over a simultaneous non-ownership heartbeat failure; and a non-ownership
heartbeat failure while the handler remains active cancels and settles it before recording
`HEARTBEAT_FAILED`.

Cancellation and timeout use one absolute bounded settlement deadline. A handler or heartbeat
supervisor that cannot settle within that budget raises a fixed fatal settlement-unknown error and
prohibits further lifecycle writes. Claim, completion, and failure outcome-unknown errors retain
their accepted fatal category. C3 adds no polling loop, repeated claims, stale-recovery cadence,
signals, graceful process shutdown, CLI, startup event, process hard exit, engine composition, or
public route; those remain outside this gate.

Phase 0B3C4 composes those accepted capabilities into one internal sequential worker process.
After CLI parsing, raw stdout/stderr descriptors become nonblocking for the process lifetime.
Startup validates the exact existing `job` catalog and effective runtime privileges in one
read-only bounded transaction, constructs the static noop registry and lifecycle services,
installs SIGINT/SIGTERM handlers, creates one owner identity, and linearizes shutdown against the
fixed startup event before initial recovery.

The runtime performs exactly one initial recovery batch, then one due batch at
`max(1, min(60, stale_seconds // 2))` cadence and one executor invocation at a time. Recovery,
claim, handler, and terminal settlement never overlap. A synchronous handler-start gate decides
whether shutdown or user-handler entry wins without an event-loop yield. Shutdown does not cancel
recovery, claim, pre-handler setup, or terminal settlement; only a confirmed active handler causes
one outer-executor cancellation.

All process-owned task, signal, engine, output, and startup-check cleanup shares absolute bounded
deadlines. A live task whose settlement remains unknown is never returned to ordinary async-runner
shutdown: the worker emits only the applicable fixed fatal event, performs bounded cleanup, and
uses the termination-only hard-exit capability exactly once. C4 changes no lifecycle SQL, schema,
ACL, public API, handler catalog, generated contract, dependency, or Compose service.

Every runtime and migration database-settings boundary accepts one normalized DNS hostname, IPv4
literal, or IPv6 literal with an explicit port and an empty query mapping. Multi-host, socket-path,
implicit-host, connection-target query, fragment, and ambiguous host forms are rejected before
engine construction, without DNS resolution or echoing the rejected value. Raw-string entry points
reject a literal `?` before SQLAlchemy parsing so bare and empty-valued query forms cannot disappear.

Worker rules:

- claim with `FOR UPDATE SKIP LOCKED`;
- heartbeat;
- bounded retries;
- exponential backoff;
- dead-letter state;
- idempotency;
- progress;
- optional cancellation;
- retention/cleanup.

Job types include provider sync, derived rebuild, plate solve, image derivative, stale refresh, and content integrity.

A dedicated queue may replace this only after a measured need and decision record.

## 12. Caching

Layers:

1. browser HTTP cache;
2. Next.js safe cache;
3. small API process cache;
4. PostgreSQL normalized/provider cache;
5. CDN for public static media.

Live responses expose:

- `observed_at`
- `fetched_at`
- `expires_at`
- `is_stale`
- provider/source

Stale-while-revalidate is allowed for non-safety-critical information.

## 13. Media

Repository contains only small approved assets.

User uploads:

- filesystem-backed object store in development;
- S3-compatible private object storage in production;
- signed URLs;
- retention and cleanup;
- no public bucket.

External media records require source, credit, licence, URL, dimensions, media type, and cache policy.

## 14. Failure isolation

- launch provider failure does not affect catalog;
- NOAA failure shows stale/unavailable state;
- Gaia timeout falls back only to existing curated catalog, never fake remote results;
- plate-solver failure preserves retryable state;
- WebGL failure renders 2D/text alternative.

## 15. Logging and metrics

Logs: request ID, route, duration, status, provider, cache state, job ID, algorithm version.

Never log private content, exact location, secrets, or uploaded bytes.

Metrics:

- API latency/errors;
- provider latency/errors;
- job age/failure;
- data freshness;
- query duration;
- cache hit rate;
- plate-solving success;
- web vitals.

## 16. Future boundaries

Do not pre-build cloud accounts, subscriptions, social graph, recommendation ML, embeddings, vector database, microservices, Kubernetes, or event streaming.
