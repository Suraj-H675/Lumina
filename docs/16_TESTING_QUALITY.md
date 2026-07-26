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

## 7. Provider tests

No routine CI depends on live upstream providers.

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
