# Security and Privacy

## 1. Privacy model

Lumina is local-first and data-minimizing.

The baseline product does not require:

- account;
- real name;
- date of birth;
- phone number;
- advertising identifier;
- public profile.

## 2. Data classification

### Public

Catalog, lessons, simulations, provider summaries, approved media.

### Local private

Interests, locations, equipment, progress, collections, plans, journal, dashboard preferences.

### Server temporary private

Identification uploads, job metadata, optional exact location submitted for a calculation.

### Secret

Provider keys, database credentials, signing keys, storage credentials.

## 3. Location

- Request browser location only after a user action.
- Explain purpose.
- Manual coordinates are always available.
- Store saved locations in IndexedDB.
- Default server requests use coordinates transiently and do not persist them.
- Do not log coordinates.
- Shared links omit exact location unless user explicitly chooses a rounded/approximate location.
- Provide location deletion.

## 4. Children and teens

Design for safety without collecting age:

- no public comments/messages;
- no discoverable profiles;
- no precise public observation locations;
- no targeted advertising;
- no behavioral tracking;
- no manipulative streak pressure;
- no external link opened without clear destination;
- citizen-science links show external-site notice.

Legal compliance for a public deployment must be reviewed for the operating jurisdiction. The codebase must not claim legal compliance merely from these design choices.

## 5. Uploads

- private by default;
- explicit remote-processing consent;
- MIME signature validation;
- size and pixel limits;
- EXIF stripping;
- random keys;
- signed URLs;
- processing sandbox;
- retention deadline;
- deletion endpoint;
- no content indexing;
- no public gallery.

## 6. API security

- environment-based CORS allowlist;
- trusted proxy configuration;
- request body limits;
- timeouts;
- rate limits;
- validation;
- stable safe errors;
- CSRF protection where cookie-authenticated state is later introduced;
- no secrets in client bundles;
- security headers;
- HTTPS production requirement.

Baseline anonymous local-first APIs should not create server sessions unnecessarily.

## 7. Headers

Production target:

- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options: nosniff
- Referrer-Policy
- Permissions-Policy
- frame-ancestors through CSP
- secure cache headers by sensitivity

CSP must account for approved visualization workers and media hosts. Avoid broad `unsafe-eval`.

Phase 0B1 emits this API-only baseline on every non-documentation response:

- `Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`
- `Permissions-Policy: camera=(), geolocation=(), microphone=()`

Phase 0B1 intentionally does not emit HSTS. That header is introduced only after HTTPS
termination and trusted-proxy behavior are explicitly configured, so local HTTP development is
not falsely treated as a production transport boundary.

When enabled, only FastAPI's built-in development documentation routes use route-local CSP
exceptions. `/docs` permits its pinned-template jsDelivr Swagger script, stylesheet, FastAPI
favicon, Swagger stylesheet `data:` images, same-origin OpenAPI fetch, and inline initializer.
`/redoc` permits its jsDelivr script,
Google Fonts stylesheet/font origins, FastAPI favicon, ReDoc `data:` images, same-origin OpenAPI
fetch, and inline style block. Both retain `default-src 'none'`, `base-uri 'none'`, `form-action 'none'`, and
`frame-ancestors 'none'`; no non-documentation response receives these allowances.

## 8. Dependency security

CI:

- lockfile integrity;
- npm audit/advisory review;
- Python vulnerability scan;
- GitHub dependency review;
- secret scanning;
- CodeQL where practical;
- container scan;
- licence scan.

A vulnerability is triaged by exploitability and affected path, not ignored solely because it is transitive.

## 9. Database

- least-privilege runtime role;
- separate migration role when production permits;
- parameterized queries;
- migrations reviewed;
- encrypted transport;
- backups protected;
- no public exposure;
- raw provider payloads reviewed for unexpected personal data.

Phase 0B2 local development binds PostgreSQL only to loopback, uses SCRAM password authentication,
and separates development/test runtime and migration credentials. Readiness logs and responses omit
URLs, credentials, hosts, ports, database names, driver details, and SQL errors.

The bootstrap administrator owns the local databases. Migration roles are non-superusers with only
database `CONNECT` and `public` schema `USAGE`/`CREATE`; they own only objects created by Alembic.
Runtime roles receive `CONNECT` and schema `USAGE`, but no schema creation, table ownership,
temporary-table privilege, role/database administration, or row-security bypass. `PUBLIC` is
revoked from database `CONNECT`/`TEMPORARY` and public-schema creation.
Integration privilege and migration connection failures are reduced to fixed safe test failures;
their test helpers retain no password-bearing URL string in traceback-visible state.

Phase 0B3A grants runtime table `SELECT`, column-level INSERT only for enqueue fields, and
column-level UPDATE only for approved future lifecycle fields. Runtime cannot update immutable
request fields, delete/truncate rows, perform DDL, or own `job`. Revision 0002 derives its role
from the paired runtime URL and fails closed if ACL provenance is ambiguous or the configured role
differs during downgrade. The runtime identity must be a standalone login role with no direct or
transitive membership relationship in either direction. ACL identity includes object, column,
grantor, grantee, privilege, and grant-option state; grant options and changed grantors cause
fail-closed reversal. Ambiguity inspection covers every PostgreSQL column privilege (`SELECT`,
`INSERT`, `UPDATE`, and `REFERENCES`) for the runtime role, `PUBLIC`, and every non-owner principal,
including effective access. Changing the runtime username requires a later explicit ACL migration.

## 10. Provider secrets

- server environment/secret store;
- never `.env` committed;
- `.env.example` contains names only;
- rotation documented;
- logs redact;
- provider adapters never return credentials;
- NASA `DEMO_KEY` prohibited in production.

## 11. Job security

- validate job type and payload;
- no arbitrary module/function invocation;
- bounded retries;
- payload size limit;
- no shell command construction from user input;
- worker uses least privilege;
- plate solver isolated;
- expired jobs cleaned.

The enqueue boundary accepts only `system.noop`, validates JSON before persistence, limits its
canonical UTF-8 form to 61,440 bytes by default, and retains PostgreSQL's 65,536-byte JSONB bound.
Idempotency keys use a strict ASCII allowlist. Payloads and keys are bound SQL values and are not
logged. Raw SQLAlchemy and driver exceptions never leave the enqueue repository: fixed exception
types distinguish confirmed connection/transport unavailability, bounded contention, integrity or
database-state failure, SQL/schema/ACL programming failure, and unexpected database operation
failure. The safe replacements retain no raw exception, bound parameters, SQL state, URL, or
connection detail. Transaction entry, commit, rollback, context exit, and connection return are all
inside this boundary; process-control cancellation is not converted. Classification evaluates
timeout, integrity, programming, invalidation, and SQL-state evidence before lifecycle phase, so
session or transaction acquisition does not disguise ACL or schema defects as connectivity.
Any SQLAlchemy failure without confirmed contention, integrity, programming/schema, or
connectivity evidence uses the fixed unexpected database-operation category.

Phase 0B3B1 treats claimed JSONB as passive private job data. Every valid persisted JSONB form is
deeply read-only. Persisted type, persisted payload, and the complete claimed-job representation
are fixed redacted forms that reveal no UUID, owner, attempts, timestamps, type, or payload. Claim
mapping does not log claim evidence, use the enqueue payload-size setting, perform dynamic imports,
resolve handlers, or execute payload-derived behavior. Safe claim failures and fatal
`JobClaimOutcomeUnknown` retain no raw database exception, SQL, parameters, cause, context, or
reconciliation evidence. JSONB null is an explicit payload value and cannot be confused with the
typed absent-row outcome.

Phase 0B3B2 treats the requested owner, job identifier, actual row state/owner, and returned
heartbeat timestamp as private ownership evidence. Request, owner-token, success, ownership-loss,
and database-failure representations are fixed and redacted. Missing rows, non-running rows, and
owner mismatches all return the same fixed `JobOwnershipLost` without a diagnostic query. Safe
failures retain no raw SQLAlchemy/driver exception, SQL, bound values, SQLSTATE, URL, credentials,
cause, or context. The heartbeat adapter logs none of this evidence and exposes no mutation
capability beyond its single owner/status-guarded heartbeat statement.

Phase 0B3B3 treats successful job results as private data. The accepted result is copied into a
canonical serialization and all result, request, success, ownership, reconciliation, and failure
representations are fixed and redacted. Result contents, sizes, owners, identifiers, timestamps,
SQL, SQLSTATE, parameters, URLs, credentials, raw exceptions, causes, and contexts are never
logged or returned through diagnostics.

Completion uses bound values for both the PostgreSQL JSONB size check and the guarded update.
Missing, non-running, foreign-owned, and previously completed rows share the same
`JobOwnershipLost` without a follow-up state query. A potentially ambiguous commit is reconciled
without selecting the stored result into Python and without a second mutation.
`JobCompletionOutcomeUnknown` reveals no reconciliation evidence and is fatal for that operation.

Phase 0B3C1 treats the committed attempt as private ownership evidence. Heartbeat, completion, and
failure require it, bind it as SQL, and expose every missing, foreign, wrong-state, or wrong-attempt
row as the same fixed `JobOwnershipLost`. No diagnostic ownership/state/attempt query is permitted.

Persisted failure errors come only from the closed production `FailureReason` catalog. Handler
exception text and caller-provided codes, messages, classifications, or delays are never accepted.
The request factory derives retry policy and delay, and the PostgreSQL adapter revalidates those
derivations before opening a session. Stale exhaustion is reserved for a later recovery capability
and cannot pass through the owner failure store.

Failure commit reconciliation selects no payload, result, raw owner, or error text. PostgreSQL
returns only mutually exclusive Boolean exact-transition and exact-unchanged facts. Unknown
evidence raises fixed, cause-free `JobFailureOutcomeUnknown`; no second mutation is attempted.
Request, result, catalog selection, schedule, lifecycle evidence, and database failures retain
fixed redacted representations and are not logged.

Phase 0B3C2 recovery accepts only a validated stale threshold and returns only requeued and
dead-lettered aggregate counts. Requests, results, thresholds, errors, and fatal
`JobRecoveryOutcomeUnknown` have fixed redacted representations. No IDs, owners, attempts,
payloads, types, timestamps, errors, row evidence, SQL, parameters, SQLSTATE, URLs, credentials, or
raw exceptions cross the boundary or enter logs.

The runtime role uses only the lifecycle-column updates already granted by revision 0002.
Ambiguous positive-batch commit acknowledgement discards the primary connection and is never
diagnosed with row reads, reconstructed from partial evidence, reconciled, or retried. Cleanup is
bounded and quarantines or replaces unsafe pooled resources before returning.

Phase 0B3C3 resolves handlers only from an immutable explicit production registry containing
`system.noop`. Handlers receive only the deeply read-only passive payload: never sessions, owner
tokens, attempts, lifecycle services, environment objects, import paths, or CLI arguments. Noop
accepts a top-level object without inspecting fields and returns `{}`. Handler exception text,
arguments, payload/type/owner/attempt values, results, identifiers, timestamps, timing evidence,
and database diagnostics never become persisted failure data or execution-control outcomes.

Worker owner identities are `<validated-prefix>.<canonical-lowercase-uuid4>` and are fully
redacted, including prefix and suffix. Execution errors and settlement-unknown outcomes are fixed,
cause-free, and context-free. An unknown claim/completion/failure outcome or unconfirmed task
settlement stops lifecycle work; it is never converted to a normal processed result or followed by
another terminal mutation.

## 12. Local export/import

Export may contain private location/journal data.

- show warning before export;
- no automatic upload;
- validate JSON schema;
- size limit;
- prototype-pollution-safe parsing;
- preview changes;
- reject unknown executable content;
- preserve backup before destructive merge where feasible.

## 13. Logging

Allowed:

- request ID;
- route template;
- status;
- duration;
- coarse error code;
- provider name;
- job ID;
- data freshness.

Forbidden:

- exact query when sensitive;
- coordinates;
- journal text;
- filenames if sensitive;
- image bytes;
- access tokens;
- API keys;
- database URLs;
- full provider response containing secrets.

Phase 0B1 disables Uvicorn's default access logger. Lumina emits one JSON access event with a UTC
timestamp, level, event, canonical request ID, route template, method, status, duration, and safe
error code when applicable. It does not log raw paths, queries, bodies, headers, configuration
values, exception text, or stack traces.

## 14. Analytics

No third-party analytics baseline.

If privacy-preserving analytics are later added:

- explicit decision;
- no advertising;
- no cross-site tracking;
- no exact location;
- no private page content;
- documented opt-out;
- self-hosted/free preference.

## 15. Threat cases

Required threat review:

- malicious image upload;
- decompression bomb;
- path traversal;
- SSRF through provider/media URL;
- API quota exhaustion;
- job queue abuse;
- SQL injection;
- XSS from content/provider fields;
- malicious imported local-data file;
- stale/poisoned provider cache;
- forged source attribution;
- secret leak into generated client;
- WebGL denial of service;
- dependency supply-chain compromise.

## 16. Incident readiness

Document:

- secret rotation;
- provider disable switch;
- upload service disable switch;
- data-source rollback;
- migration rollback/restore;
- user-facing status message;
- vulnerable asset removal;
- cache purge.

## 17. Retention

Baseline temporary upload retention: configurable, default 24 hours after terminal job unless user explicitly saves a local copy/reference. Production policy must be displayed.

Job metadata may be retained longer for aggregate reliability metrics only after private fields are removed.

## 18. Security acceptance

A feature handling location, uploads, imports, external URLs, or secrets is incomplete without:

- threat cases;
- validation tests;
- rate/resource limits;
- safe logs;
- deletion/cleanup;
- error behavior;
- documentation.
