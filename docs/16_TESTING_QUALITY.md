# Testing and Quality Strategy

## 1. Quality layers

1. Static checks
2. Unit tests
3. Property/numerical tests
4. Database/repository integration
5. Provider contract tests
6. API integration tests
7. Component tests
8. End-to-end tests
9. Accessibility tests
10. Performance and visual checks
11. Scientific validation

No single layer replaces the others.

## 2. Required commands

Exact commands are added during bootstrap. The conceptual CI gates are:

### Web

- format check
- ESLint
- TypeScript
- unit/component tests
- generated client freshness
- Next.js production build
- Playwright smoke
- accessibility smoke

Phase 0C2 runs `pnpm api:check` as the generated-contract freshness gate. The command performs two
isolated exports and generations, verifies byte identity and TypeScript compatibility, and compares
only the three committed generated artifacts without writing to the repository. API-client tests
cover generated path/method typing, absence of handwritten response DTO replicas, strict runtime
unknown-field rejection, origin validation, bounded response reading, JSON media types, timeouts,
cancellation, and safe failure normalization. Web tests cover all four foundation status states,
metadata-only failure, accessibility, and absence of raw-error or provider/catalog claims.

Phase 0C2 Playwright status tests use one loopback stub bound to an operating-system-selected port.
The harness proves the listener before starting Next.js, switches explicit disconnect/ready modes
through a mode-0600 coordination file, records bounded categories for unexpected traffic, and
requires an authenticated clean assertion before teardown. Explicit authenticated clearing exists
only for deliberate isolation tests. Teardown retains unresolved violations as a failing outcome
while still awaiting web child, socket, listener, and file cleanup. No PostgreSQL process is
required for these browser tests.

### API

- Ruff format/check
- mypy
- pytest unit
- pytest integration
- migration upgrade
- migration downgrade where supported
- OpenAPI snapshot
- dependency import/startup

## 3. Coverage

Coverage is a diagnostic, not the only goal.

Initial thresholds after baseline code exists:

- Python domain/application: 85% line coverage
- critical astronomy calculations: near-complete branch coverage
- provider parsers: every mapped field and missing/invalid cases
- TypeScript calculation utilities: 90%
- UI: behavior-focused, not arbitrary line chasing

Threshold changes require decision record.

## 4. Scientific numerical tests

For each algorithm:

- units;
- reference input/output;
- tolerance;
- edge domain;
- invalid domain;
- source/reference;
- algorithm version.

Use `pytest.approx`, Astropy quantities, and operation-specific tolerances.

Property tests:

- angular separation symmetry;
- coordinate round trips;
- non-negative durations;
- score bounds;
- planner no overlap;
- deterministic same input/version;
- unit-conversion round trip.

## 5. Time and location tests

Include:

- UTC;
- half-hour and 45-minute offsets;
- Asia/Kolkata;
- DST transitions;
- date line;
- longitude ±180;
- polar day/night;
- leap day;
- invalid timezone;
- ambiguous/nonexistent local time.

## 6. Database tests

- migrations on empty DB;
- upgrade from previous release;
- constraints;
- unique aliases;
- idempotent ingestion;
- source/measurement immutability;
- canonical selection;
- job claim concurrency;
- search ranking;
- transaction rollback.

Tests use an actual PostgreSQL instance, not SQLite, for PostgreSQL-specific behavior.

Phase 0B2 verifies development/test role separation, real readiness, and guarded migration
upgrade/downgrade/re-upgrade against local `lumina_test`; destructive helpers refuse other targets.
The migration lifecycle compares the complete `job` catalog contract after each upgrade: columns,
defaults, generated/identity state, constraints, and indexes, including PostgreSQL's constraint
backing indexes. It then asserts downgrade absence of `job` before re-upgrading. Connection failures
at that integration-test boundary are normalized without credentials or connection details in pytest
output; schema assertions and other programming failures retain their normal diagnostics.
Guarded migration URLs use exactly `postgresql+psycopg`, an explicit loopback host and port, the
`lumina_test` database, and an empty query mapping. The test harness opens the connection before
invoking Alembic, then supplies that connection to migration execution so only connection-establishing
failures are normalized.

Phase 0B3A additionally proves the exact ACL-only 0002 upgrade/downgrade/re-upgrade contract,
role-identity mismatch refusal without partial revocation, and the unchanged 0001 checksum. Real
PostgreSQL tests exercise the restricted six-column INSERT and every server default, JSONB
idempotency equivalence, terminal-key reservation, conflicting logical requests, and concurrent
equal/different enqueues. Tests verify bounded idempotency-conflict waits and fixed, non-leaking
repository error categories for connection, transport, contention, ACL, SQL, integrity, and
unexpected database failures, including commit/rollback/session-exit failures. ACL tests compare
grantor and grant-option state and reject direct or transitive runtime-role memberships in either
direction without partial changes. They also exercise all four PostgreSQL column privileges against
the runtime role, `PUBLIC`, and alternate principals before upgrade and downgrade. Settings tests
reject every runtime URL query parameter before engine construction. Repository lifecycle tests
prove concrete database subtype and SQL-state evidence takes precedence over acquisition/exit phase.
Raw URL tests include bare and empty-valued query delimiters that SQLAlchemy would otherwise
discard, and repository tests require unclassified SQLAlchemy exceptions to remain operation
failures.

Phase 0B3B1 unit and guarded `lumina_test` integration tests cover object, array, string, number,
Boolean, and JSON null payloads. They prove recursively read-only values, complete representation
redaction, JSON null versus no returned row, passive integers beyond signed 64-bit, absence of
enqueue canonicalization and payload-limit dependencies, and unchanged strict Phase 0B3A enqueue
validation. Real PostgreSQL fixtures are inserted only through migration-role helpers guarded to
the local `lumina_test` database. Tests also prove normal application-enqueued noop objects remain
claimable, the existing 65,536-byte constraint remains unchanged, and claim performs no handler
lookup, import, validation, dispatch, execution, or failure transition.

The same gate uses synchronized separate PostgreSQL sessions to prove unique concurrent ownership,
`SKIP LOCKED`, every eligibility and deterministic ordering field, exact attempt increments, and
rollback restoration. Explicit relation locks prove transaction-local operation timeouts,
contention classification, rollback, later connection-setting reset, pool release, and successful
claim after release without timing sleeps. Controlled lifecycle doubles and persisted
reconciliation tests cover confirmed commits, lost acknowledgements, queued/foreign/mismatched/
unavailable evidence, process-control cancellation, fatal unknown outcomes, and absence of a
second claim. Dedicated-pool checks cover every public exit. Representative guarded planner
evidence records index participation, filtering, sorting, actual rows, and buffers without forcing
a planner strategy, then removes fixtures and re-analyzes the empty test table.

Phase 0B3B2 deterministic tests prove immutable/redacted heartbeat values, application validation
before infrastructure, exact SQL and bindings, evidence-specific safe database classification,
and rollback/close behavior. Guarded `lumina_test` tests prove correct-owner and repeated
heartbeats, PostgreSQL-authored time, deliberately equal transaction timestamps, indistinguishable
missing/foreign/queued/terminal rejection, no rejected write, and unchanged attempts, status,
owner, claim time, and immutable fields. Explicit row locks and events prove bounded timeout,
transaction-local setting reset, pool release, and a fresh successful heartbeat after release.
Dedicated operation pools also return to baseline after success, ownership loss, timeout,
malformed mapping, safe database failure, and cancellation, with no arbitrary correctness sleeps
or unobserved task.

Phase 0B3B3 deterministic tests cover empty and nested result objects, Unicode, signed 64-bit
boundaries, finite floats, booleans/null, canonical ordering, exact UTF-8 byte boundaries,
32-level nesting, cycles, non-string keys, bytes, custom objects, non-finite numbers, NUL,
surrogates, mutation isolation, and representation redaction. Application tests prove identifier,
owner, and result validation occurs before the narrow completion store.

Guarded `lumina_test` tests prove the exact owner/running successful transition, JSONB result
equality, progress `1`, PostgreSQL-authored completion time, null error fields, retained ownership
fields, and unchanged request/attempt/timestamp columns. Missing, queued, every terminal state,
foreign ownership, and a second completion are indistinguishable and write nothing. Separate
application-canonical and PostgreSQL-JSONB-text size boundaries are exercised before mutation.
Explicit row locks and events prove bounded transaction-local timeouts, reset, pool release, and
fresh success after release. Controlled commit-acknowledgement loss proves exact fresh-connection
reconciliation, definite unchanged failure, fatal unknown exhaustion, no second mutation,
post-update cancellation settlement, and no unobserved lifecycle task.

Phase 0B3C1 tests the exact fixed failure catalog, intrinsically closed request factory,
schema-compatible attempt value, deterministic delays `2, 4, 8, 16, 32`, and defensive rejection
of forged reasons, classifications, and delays before session construction. Existing heartbeat and
completion suites prove their SQL and completion reconciliation now require the expected attempt.

Guarded PostgreSQL tests prove retry requeue field clearing, PostgreSQL-authored scheduling,
retry exhaustion to `dead_letter`, non-retryable transition to `failed`, terminal historical-field
retention, owner/attempt indistinguishability, transaction-local contention bounds, and ACL
sufficiency. Same-owner requeue/reclaim evidence proves delayed attempt-one heartbeat, completion,
and failure cannot mutate attempt two while current-attempt operations succeed. Lost commit
acknowledgements reconcile queued, failed, and dead-letter outcomes exactly once. Exact unchanged
running evidence requires null result and becomes a fixed operation failure; non-null result,
malformed/non-exclusive Booleans, missing rows, and all partial evidence become fatal unknown.
Reconciliation returns only Booleans and every exit is checked for secret-safe diagnostics and
bounded resource cleanup.

Phase 0B3C2 deterministic tests cover exact stale-threshold parsing, immutable/redacted requests
and aggregate-only results, the fixed 100-row batch, exact SQL eligibility/order/bindings,
canonical stale-exhaustion error resolution, malformed aggregate evidence, timeout/error
classification, empty-batch rollback, bounded cleanup and task observation, and fatal ambiguous
positive commit without reconciliation or a second mutation.

Guarded PostgreSQL tests prove exact requeue and dead-letter field policies, PostgreSQL time
authority and cutoff equality, recent-heartbeat exclusion, null-heartbeat fallback to claim time,
attempt preservation, 100/101 batching and ordering, concurrent `SKIP LOCKED` recoverers, locked-row
skipping, and heartbeat/recovery lock races without correctness sleeps. Same-owner recovery and
reclaim tests prove delayed attempt-one heartbeat/completion/failure cannot mutate attempt two,
while each current-attempt operation succeeds in a separate fixture. Existing ACL tests plus a
runtime recovery transition prove revision 0002 is sufficient and prohibited columns/operations
remain denied.

Phase 0B3C3 deterministic tests cover the immutable exact registry, sole production noop
registration, object-only noop input and `{}` result, UUIDv4 owner identity, exact timing settings,
one-claim/no-job behavior, every handler failure mapping, completion validation rejection,
deadline cancellation, external cancellation, uncooperative settlement, heartbeat sequencing and
non-overlap, no catch-up burst, ownership loss, and every simultaneous handler/heartbeat
precedence branch. Controlled events and monotonic test timing replace arbitrary correctness
sleeps. Secrecy tests cover registry/handler/outcome/error representations and fixed exception
boundaries.

Guarded `lumina_test` tests compose the accepted claim, heartbeat, completion, and failure stores.
They prove successful enqueued noop execution with `{}`, unsupported and incompatible terminal
failures, retryable requeue using accepted C1 backoff, non-retryable/unexpected/invalid-result
failures, a heartbeat during blocked execution, attempt fencing, timeout, and real heartbeat
ownership loss with no later terminal mutation. Existing lifecycle integration suites remain the
authoritative detailed evidence for each individual PostgreSQL capability.

Phase 0B3C4 deterministic tests use events, explicit task barriers, and monotonic seams to cover
initial recovery, derived cadence, full no-job poll delay, non-overlap, readiness and handler-start
linearization, every shutdown phase, claimed-after-shutdown settlement, signal restoration,
process-lifetime descriptor ownership, partial/non-writable output, and exactly-once hard
termination. No correctness sleep is used.

Guarded `lumina_test` tests execute the runtime-role startup catalog/ACL check, real initial
recovery and sequential noop completion, claimed-after-shutdown cancellation, pool return, and
one-owner reuse. Subprocess tests resolve the installed `lumina-worker`, promote only the guarded
test runtime URL, await the exact complete startup line, send real SIGTERM, and assert exact
status/output. Invalid polling and secret-bearing argv cases prove fixed or silent output. Failed
tests use bounded child termination so no worker remains live.

## 7. Provider tests

No routine CI depends on live upstream providers.

Phase 0C3 focused tests validate three independently discriminated immutable manifests, canonical
JSON, cross-file source references, safe diagnostics, the request/raw/validated/normalized provider
boundary, and deterministic lookup/batch behavior from fictional fixtures. They are intentionally
PostgreSQL-free. Architecture guards keep the fake and fixture data outside production imports and
the wheel.

`pnpm manifests:check` is the standalone read-only production-manifest gate. An empty production
set passes. Phase 0C4 will compose this command into root `pnpm check`; Phase 0C3 does not change
that composition.

Use sanitized fixtures for:

- normal response;
- missing optional fields;
- changed type;
- invalid payload;
- empty response;
- rate limit;
- timeout;
- 500;
- schema/version change;
- duplicated record.

A scheduled non-blocking provider smoke workflow may test official endpoints with respectful frequency.

## 8. API tests

- status and schema;
- validation;
- error code;
- pagination;
- conditional caching;
- stale metadata;
- rate limits;
- unauthorized/forbidden only if auth later exists;
- upload limits;
- OpenAPI contract.

## 9. Web tests

Component:

- keyboard;
- loading/error/empty/stale;
- units;
- source drawer;
- reduced motion;
- local data failure;
- WebGL fallback.

E2E critical paths:

1. search → object → source;
2. compare;
3. location → Sky Tonight;
4. create plan → journal;
5. lesson → quiz → progress;
6. identify upload state machine with fake solver;
7. export/import local data;
8. provider stale/unavailable.

## 10. Accessibility

Automated axe plus manual:

- tab sequence;
- focus visibility;
- dialog behavior;
- screen-reader landmarks;
- chart alternative;
- canvas alternative;
- 200% zoom;
- reduced motion;
- contrast;
- touch-only interaction.

Automated tools do not prove compliance.

## 11. Visual regression

Use sparingly for:

- core design primitives;
- object page;
- Sky Tonight;
- source drawer;
- simulation layout;
- mobile navigation.

Mask timestamps and deterministic animation state.

## 12. Performance

Measure:

- initial route JS;
- LCP/CLS/INP;
- API p50/p95;
- catalog search;
- Sky Tonight batch;
- planner;
- worker queue age;
- WebGL frame rate on representative hardware;
- memory cleanup after route leave.

Performance budgets live in CI once stable.

## 13. Data-quality tests

- no seed record without source;
- valid units;
- unique slugs;
- alias normalization;
- media credit/licence present;
- artist concepts labelled;
- content source list non-empty;
- no unresolved publication blockers;
- no future/stale dates inconsistent with source.

## 14. Content tests

- front matter/schema;
- internal links;
- entity IDs;
- quiz answer validity;
- duplicate IDs;
- learning prerequisites cycle detection;
- required mode content;
- source URLs format;
- prohibited generated-content markers.

## 15. Test data

- fixtures are clearly fictional or source-sanitized;
- production never imports fixtures;
- random tests use fixed seed and report it;
- no personal images;
- licences permit fixture storage;
- large binaries fetched in an opt-in script with checksum.

## 16. Bug regression

Every fixed bug that can recur gets a test. The test should fail before the fix where practical.

## 17. Release checklist

- all required checks green;
- migrations verified;
- source manifests valid;
- no secrets;
- no debug flags;
- provider caches/fallback tested;
- accessibility smoke;
- production build;
- documentation updated;
- version/changelog updated;
- known limitations documented.
