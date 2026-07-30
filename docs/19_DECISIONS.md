# Architecture and Product Decisions

This file records accepted decisions. New decisions use the same format and must not silently rewrite history.

## ADR-001 — Clean rebuild

**Status:** Accepted
**Decision:** Build Lumina in a new repository. Do not inherit the old prototype architecture.
**Reason:** The previous app was a small JSON lookup with hardcoded explanation templates and does not match the new product.

## ADR-002 — Keep the name Lumina

**Status:** Accepted
**Decision:** Product and repository identity remain Lumina.

## ADR-003 — No LLM or generative AI

**Status:** Accepted
**Decision:** No chatbot, LLM-generated answer, generated lesson, embedding search, or AI-wrapper dependency.
**Reason:** Product value must come from science data, deterministic calculations, authored content, and interaction.

## ADR-004 — Free and self-hostable

**Status:** Accepted
**Decision:** Core features use open-source dependencies and free/public scientific sources; no paid core API.
**Caveat:** Unlimited hosting cannot be guaranteed at zero cost.

## ADR-005 — Modular monolith

**Status:** Accepted
**Decision:** Next.js web, FastAPI API, one worker, PostgreSQL. No microservices baseline.

## ADR-006 — Local-first personal data

**Status:** Accepted
**Decision:** Collections, settings, progress, plans, and journal live in IndexedDB. No account required.

## ADR-007 — PostgreSQL canonical store

**Status:** Accepted
**Decision:** Use PostgreSQL with `pg_trgm`; no MongoDB/vector DB.
**Reason:** Relational provenance and measurement integrity.

## ADR-008 — OpenAPI-generated client

**Status:** Accepted
**Decision:** Backend OpenAPI generates the TypeScript client/contracts.

## ADR-009 — Provenance-first measurements

**Status:** Accepted
**Decision:** Source measurements remain immutable; canonical display values reference selected measurements and rules.

## ADR-010 — Do not mirror Gaia

**Status:** Accepted
**Decision:** Curated local catalog plus targeted/on-demand Gaia queries and cache.

## ADR-011 — Runtime ephemeris local-first

**Status:** Accepted
**Decision:** Use Skyfield/Astropy and a documented local JPL kernel. Horizons is for validation/controlled use, not browser-embedded runtime.

## ADR-012 — WorldWide Telescope plus custom Three.js

**Status:** Accepted
**Decision:** WWT for mature sky/deep-universe rendering; Three.js/R3F for custom simulations/models. Both require fallbacks.

## ADR-013 — Database-backed jobs initially

**Status:** Accepted
**Decision:** PostgreSQL queue using safe row claiming. Do not require Redis until measured need.

## ADR-014 — Authored content in version control

**Status:** Accepted
**Decision:** Lessons, concepts, quizzes, stories, myths, and activities are reviewed structured files.

## ADR-015 — Presentation modes

**Status:** Accepted
**Decision:** Explorer, Student, and Deep Dive use authored variants. Scientific values do not change.

## ADR-016 — No public social features

**Status:** Accepted
**Decision:** No comments, DMs, followers, or public profiles. Sharing uses exportable cards/files/links with privacy controls.

## ADR-017 — Identification via plate solving

**Status:** Accepted
**Decision:** Use Astrometry.net local or remote adapter. No image-recognition AI.

## ADR-018 — Separate astronomical and weather visibility

**Status:** Accepted
**Decision:** Always calculate astronomical suitability; weather is optional and separately timestamped/scored.

## ADR-019 — No project licence during the personal-project stage

**Status:** Accepted
**Decision:** Lumina currently has no project licence. All rights are reserved by default.
Third-party data, media, fonts, libraries, models, and other assets remain governed by their
respective licences and attribution requirements.
**Consequences:** Scientific provenance, third-party attribution, dependency-licence review, and
asset-manifest requirements remain mandatory. Licensing must be reconsidered before accepting
outside contributions or declaring Lumina open source.

## ADR-020 — Phase 0B2 PostgreSQL before worker behavior

**Status:** Accepted
**Date:** 2026-07-25
**Decision:** Phase 0B2 provides PostgreSQL, Alembic, the initial `job` table, and readiness before
Phase 0B3 implements database-backed worker behavior.
**Reason:** The roadmap lists a worker before its database prerequisite, while the architecture
requires the queue to be database-backed. This preserves dependency order without advancing worker scope.

## ADR-021 — Phase 0B3A capability-specific enqueue and runtime ACL

**Status:** Accepted
**Date:** 2026-07-26
**Decision:** Introduce job behavior incrementally. Phase 0B3A defines only the enqueue capability,
uses the existing singular `job` table, and grants the runtime role table SELECT plus exact
column-level INSERT/UPDATE privileges through reversible ACL-only revision 0002. The paired runtime
URL username is part of that revision's migration contract.
**Consequences:** Idempotency covers job type, JSONB-equal payload, priority, and maximum attempts.
Changing runtime roles requires an explicit future ACL migration. Claiming, execution, lifecycle
mutations, workers, handlers, and CLI behavior remain outside Phase 0B3A.

## ADR-022 — Phase 0B3B1 passive persisted-job claim boundary

**Status:** Accepted
**Date:** 2026-07-26
**Decision:** Claim one eligible queued row atomically and map its type and payload as passive
persisted values. `PersistedJobPayload` accepts every valid decoded PostgreSQL JSONB form, uses an
explicit JSON null value, recursively freezes containers, and redacts its representation. Claim
mapping neither receives nor reads the enqueue payload-size setting and does not apply enqueue or
handler validation.
**Consequences:** `ClaimedJob` contains only `id`, passive `job_type`, passive `payload`, `attempts`,
`max_attempts`, `claimed_at`, and `heartbeat_at`. A returned row containing JSONB null is a claimed
job; only absence of a `RETURNING` row means no job. Phase 0B3A remains unchanged, migrations 0001
and 0002 remain unchanged, and handler selection, validation, import, dispatch, execution, and
failure transitions remain out of scope. In future Phase 0B3C, a static registry selects a handler
from the passive type and that handler validates the passive payload before execution.

The no-row outcome is a fieldless `NoEligibleJob`. Claim uses a validated transaction-local
operation timeout. Once claim SQL returns a candidate, commit acknowledgement is explicit and
process-control cancellation is deferred through commit or reconciliation. Exact persisted
ownership returns the original claim; definitely unchanged queued state is an operation failure;
foreign ownership is a database-state failure; all other indeterminate evidence raises fatal
`JobClaimOutcomeUnknown`. Reconciliation never claims another row and exposes no evidence.

## ADR-023 — Phase 0B3B2 owner-guarded job heartbeat

**Status:** Accepted
**Date:** 2026-07-26
**Decision:** Add only a capability-specific heartbeat request, success value, service, and
PostgreSQL adapter. The adapter updates only `heartbeat_at` to `transaction_timestamp()` where the
job identifier, `running` status, and expected owner all match. Every zero-row outcome is the same
fixed `JobOwnershipLost`, with no diagnostic query.
**Consequences:** Each public call uses one fresh bounded transaction and releases the pool
checkout before returning. Repeated calls and equal timestamps are valid. Migration revisions
0001 and 0002 and the B1 claim contract remain unchanged. Completion, result persistence, failure,
retry, recovery, handlers, execution, worker loops, polling, signals, CLI commands, public routes,
and commit reconciliation remain outside this boundary.

## ADR-024 — Phase 0B3B3 owner-guarded successful completion

**Status:** Accepted
**Date:** 2026-07-28
**Decision:** Add only immutable JSON-object result validation and a capability-specific successful
completion service/adapter. The exact update requires job ID, `running` status, and expected owner;
sets `succeeded`, the bound result, progress `1`, PostgreSQL-authored completion time, and null
error fields; and retains ownership and claim/heartbeat timestamps. Every zero-row outcome is the
existing indistinguishable `JobOwnershipLost`.
**Consequences:** Canonical application JSON is bounded by `LUMINA_JOB_RESULT_MAX_BYTES` and
PostgreSQL JSONB text is independently bounded by the existing 65,536-byte constraint before the
update. A potentially lost commit acknowledgement is reconciled on a genuinely fresh bounded
connection without returning the result into Python or performing a second mutation. Exact
evidence returns success, a definitely unchanged same-owner running row is a fixed operation
failure, and indeterminate evidence raises fatal `JobCompletionOutcomeUnknown`. Migrations 0001
and 0002 remain unchanged. Failure, retry, recovery, handler, execution, worker-loop, polling,
signal, CLI, and public-route behavior remain outside this boundary.

## ADR-025 — Phase 0B3C1 closed failure transitions and attempt fencing

**Status:** Accepted
**Date:** 2026-07-30
**Decision:** Add one narrow owner/status/attempt-guarded failure capability and require the
committed claim attempt for heartbeat, successful completion, completion reconciliation, and
failure. Production failure code, message, classification, and retry delay come only from a closed
catalog and intrinsically closed request factory. Retryable remaining attempts requeue with
deterministic exponential backoff; exhausted retryable attempts become `dead_letter`;
non-retryable failures become `failed`. Only claim increments attempts.
**Consequences:** Delayed work from an earlier attempt cannot mutate a later attempt even when the
same process owner token is reused. Every zero-row mutation remains indistinguishable
`JobOwnershipLost`. Potentially lost failure commit acknowledgement is reconciled once on a
distinct bounded backend using only mutually exclusive Boolean exact-transition or
exact-unchanged-running evidence. Exact unchanged evidence requires null result; all indeterminate
evidence raises fatal `JobFailureOutcomeUnknown`. Migrations, ACLs, settings, dependencies, public
routes, stale recovery, handlers, worker runtime, signals, and CLI remain unchanged or deferred.

## ADR-026 — Phase 0B3C2 atomic stale-running-job recovery

**Status:** Accepted
**Date:** 2026-07-30
**Decision:** Add one narrow recovery capability using PostgreSQL-authoritative stale eligibility
and timestamps. One ordered materialized CTE selects and locks at most 100 stale running rows with
`FOR UPDATE SKIP LOCKED`, atomically requeues attempts with capacity, and dead-letters exhausted
attempts using `FailureReason.STALE_ATTEMPTS_EXHAUSTED`. Recovery never increments attempts and
returns only aggregate counts.
**Consequences:** `LUMINA_JOB_STALE_SECONDS` is the only new setting. Empty batches roll back.
Positive batches commit once under a shared lifecycle deadline; uncertain acknowledgement is not
reconciled or retried and raises fatal `JobRecoveryOutcomeUnknown` after quarantine. C1 attempt
fences protect later same-owner attempts. Migrations, ACLs, dependencies, handlers, execution,
worker identity/cadence, polling, signals, graceful shutdown, CLI, and public routes remain
unchanged or deferred.

## ADR template

```text
## ADR-NNN — Title

Status: Proposed | Accepted | Superseded | Rejected
Date:
Context:
Decision:
Consequences:
Alternatives:
Supersedes:
```
