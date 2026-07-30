# Environment Variables

This is the planned configuration contract. Add variables only when the related phase is implemented. `.env.example` must contain names and safe descriptions, never secrets.

Phase 0A defined no Lumina runtime environment variables. Phase 0B2 activates the API variables
and four database URLs below. Phase 0B3A activates its three enqueue settings, Phase 0B3B1
activates one job-operation timeout, and Phase 0B3B2 reuses that timeout for heartbeat. Phase
0B3B3 adds only the result-size setting and reuses the existing operation timeout for completion
and reconciliation. Phase 0B3C2 adds only the stale threshold and reuses the operation timeout for
recovery. Phase 0B3C3 activates four worker/execution settings, and Phase 0B3C4 activates only the
worker poll interval. All other variables remain planned until their owning phases.

## Active in Phase 0B1

| Variable | Required/default | Validation and behavior |
| --- | --- | --- |
| `LUMINA_ENV` | Required | `development`, `test`, `staging`, or `production`. |
| `LUMINA_LOG_LEVEL` | `INFO` | Standard `CRITICAL`, `ERROR`, `WARNING`, `INFO`, or `DEBUG` level. |
| `LUMINA_API_HOST` | `127.0.0.1` | IP literal or hostname without scheme, path, port, whitespace, or control characters. |
| `LUMINA_API_PORT` | `8000` | Integer from 1 through 65535. |
| `LUMINA_CORS_ORIGINS` | Empty immutable tuple | Comma-separated exact HTTP/HTTPS origins; no wildcard, credentials, path, query, or fragment. |
| `LUMINA_ENABLE_API_DOCS` | Environment default | Optional strict `true` or `false`. Defaults on in development/test and off in staging/production. |
| `LUMINA_BUILD_COMMIT` | Null | Optional 1–128 character public identifier using letters, numbers, dot, underscore, or dash. |

The API reads UTF-8 `.env` only from the repository root. Real process variables override matching
dotenv values. An unknown uppercase `LUMINA_` variable in either supported source fails startup;
unrelated process variables are ignored. `.env` remains ignored and bootstrap does not create,
copy, overwrite, print, stage, or commit it.

The `127.0.0.1` host default limits development binding to the local machine. Explicit
`0.0.0.0` or `::` is supported for intentional container or network access, but exposes the API
to reachable interfaces and does not configure HTTPS or authentication.

## Active in Phase 0B2 database variables

```text
LUMINA_DATABASE_URL=postgresql+asyncpg://...
LUMINA_DATABASE_SYNC_URL=postgresql+psycopg://...
LUMINA_TEST_DATABASE_URL=postgresql+asyncpg://...
LUMINA_TEST_DATABASE_SYNC_URL=postgresql+psycopg://...
```

API processes load only `LUMINA_DATABASE_URL` and never load migration credentials. Alembic loads
the synchronous migration URL and its paired runtime URL so ACL revision 0002 can derive and verify
the intended runtime role; no separate role variable exists. Integration tests require all four
URLs and `LUMINA_ENV=test`. The contracts remain portable
standard PostgreSQL through SQLAlchemy, Alembic, asyncpg, and Psycopg. Supabase may be evaluated
later only as an optional PostgreSQL host, not as a required
SDK, browser data API, authentication, storage, realtime, or edge-function dependency.

Every active database URL requires one decoded DNS/IPv4/IPv6 host, an explicit port, and an
explicit database name. Query mappings and fragments are forbidden, including SSL, service,
options, and connection-target parameters. Validation occurs before engine construction and emits
only fixed errors without URL components or credentials. Raw URL strings containing `?` are
rejected before parsing, including bare and empty-valued query forms; percent-encoded data does not
count as raw query syntax.

Local bootstrap generates these credentials only for a new named PostgreSQL volume. If the exact
Compose volume exists while `.env` is absent, bootstrap stops without generating replacements;
restore the matching `.env` or use the manual recovery procedure in deployment operations.

## Web public variables

Only non-secret values use `NEXT_PUBLIC_`.

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_ENABLE_WEBGL=true
NEXT_PUBLIC_ENABLE_IDENTIFICATION=false
```

Do not put provider keys in public variables.

## Active in Phase 0B3A

| Variable | Required/default | Validation and behavior |
| --- | --- | --- |
| `LUMINA_JOB_PAYLOAD_MAX_BYTES` | `61440` | Integer from 1 through 65536; bounds canonical UTF-8 JSON before enqueue. |
| `LUMINA_JOB_DEFAULT_MAX_ATTEMPTS` | `5` | Integer from 1 through 5; used when enqueue omits an explicit value. |
| `LUMINA_JOB_ENQUEUE_WAIT_TIMEOUT_MS` | `5000` | Integer from 100 through 30000; transaction-local bound for enqueue statement and lock waits. |

Existing `.env` files may omit all three values. Bootstrap never rewrites an existing file.

## Active in Phase 0B3B1 and reused in Phase 0B3B2

| Variable | Required/default | Validation and behavior |
| --- | --- | --- |
| `LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS` | `5000` | Integer from 100 through 30000; transaction-local bound for claim/reconciliation and owner-guarded heartbeat statement and lock waits. |

Existing `.env` files may omit this value. Bootstrap never rewrites an existing file. Claim and
heartbeat construction receive the validated setting and never read the environment directly.
Claim construction and persisted-payload mapping do not accept or read
`LUMINA_JOB_PAYLOAD_MAX_BYTES`; that setting remains exclusively an enqueue-time application bound.

## Active in Phase 0B3B3

| Variable | Required/default | Validation and behavior |
| --- | --- | --- |
| `LUMINA_JOB_RESULT_MAX_BYTES` | `61440` | Integer from 1 through 65536; bounds canonical UTF-8 JSON before successful completion. |

Existing `.env` files may omit this value. Bootstrap never rewrites an existing file. Completion
construction receives this validated setting and never reads the environment directly. The
application default leaves headroom below the separate accepted 65,536-byte PostgreSQL JSONB-text
limit.

## Active in Phase 0B3C2

| Variable | Required/default | Validation and behavior |
| --- | --- | --- |
| `LUMINA_JOB_STALE_SECONDS` | `120` | Exact integer from 2 through 86400; PostgreSQL-authoritative running-job stale threshold. |

Existing `.env` files may omit this value. Bootstrap never rewrites an existing file. Recovery
construction receives the validated setting and never reads the environment directly. The batch
size is the fixed internal value 100 and is not configurable. No heartbeat/stale cross-setting
validation exists before C3, and no recovery-cadence setting exists.

## Active in Phase 0B3C3

| Variable | Required/default | Validation and behavior |
| --- | --- | --- |
| `LUMINA_WORKER_ID_PREFIX` | `worker` | Exact 1–91 character prefix matching `[a-z][a-z0-9_.-]{0,90}`. The final owner is the prefix, dot, and canonical lowercase UUIDv4. |
| `LUMINA_JOB_HEARTBEAT_SECONDS` | `30` | Exact integer from 1 through 3600; interval between sequential attempt-fenced heartbeats. |
| `LUMINA_JOB_HANDLER_TIMEOUT_SECONDS` | `300` | Exact integer from 1 through 86400; absolute monotonic handler execution deadline. |
| `LUMINA_JOB_CANCELLATION_GRACE_SECONDS` | `5` | Exact integer from 1 through 60; bounded task-settlement budget. |

Existing `.env` files may omit all four values. Boolean numeric coercion is rejected. Settings
require:

```text
LUMINA_JOB_STALE_SECONDS
>= 2 * LUMINA_JOB_HEARTBEAT_SECONDS
   + ceil(LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS / 1000)

LUMINA_JOB_CANCELLATION_GRACE_SECONDS
<= LUMINA_JOB_HANDLER_TIMEOUT_SECONDS
```

Identity construction and execution receive validated values and never read the environment.
Complete owner tokens, UUID suffixes, and prefix configuration are never logged.

## Active in Phase 0B3C4

| Variable | Required/default | Validation and behavior |
| --- | --- | --- |
| `LUMINA_WORKER_POLL_SECONDS` | `2` | Exact integer from 1 through 60; full no-job delay, interruptible by shutdown. |

Existing `.env` files may omit this value. The validated value is injected into the sequential
runtime and is never read by domain/application code. Recovery cadence remains derived from the
existing stale threshold and is not independently configurable.

## Storage

```text
LUMINA_STORAGE_BACKEND=filesystem|s3
LUMINA_STORAGE_LOCAL_ROOT=./var/storage
LUMINA_S3_ENDPOINT=
LUMINA_S3_REGION=
LUMINA_S3_BUCKET=
LUMINA_S3_ACCESS_KEY_ID=
LUMINA_S3_SECRET_ACCESS_KEY=
LUMINA_SIGNED_URL_TTL_SECONDS=300
LUMINA_UPLOAD_MAX_BYTES=
LUMINA_UPLOAD_MAX_PIXELS=
LUMINA_UPLOAD_RETENTION_HOURS=24
```

## Provider common

```text
LUMINA_PROVIDER_HTTP_TIMEOUT_SECONDS=20
LUMINA_PROVIDER_USER_AGENT=Lumina/<version> (<contact>)
LUMINA_PROVIDER_MAX_CONCURRENCY=1
```

Provider-specific enable switches:

```text
LUMINA_ENABLE_NASA_API=false
LUMINA_ENABLE_EXOPLANET_ARCHIVE=false
LUMINA_ENABLE_GAIA=false
LUMINA_ENABLE_SIMBAD=false
LUMINA_ENABLE_NOAA_SWPC=false
LUMINA_ENABLE_CELESTRAK=false
LUMINA_ENABLE_LAUNCH_LIBRARY=false
LUMINA_ENABLE_REMOTE_ASTROMETRY=false
```

## NASA

```text
LUMINA_NASA_API_KEY=
```

`DEMO_KEY` is forbidden in production.

## Astrometry.net remote

```text
LUMINA_ASTROMETRY_API_URL=https://nova.astrometry.net/api
LUMINA_ASTROMETRY_API_KEY=
LUMINA_ASTROMETRY_PUBLICLY_VISIBLE=n
LUMINA_ASTROMETRY_ALLOW_MODIFICATIONS=n
LUMINA_ASTROMETRY_ALLOW_COMMERCIAL_USE=n
LUMINA_ASTROMETRY_POLL_SECONDS=5
LUMINA_ASTROMETRY_TIMEOUT_SECONDS=900
```

Values must reflect provider-supported options and user consent.

## Local Astrometry.net

```text
LUMINA_ASTROMETRY_SOLVE_FIELD_PATH=/usr/local/bin/solve-field
LUMINA_ASTROMETRY_INDEX_DIR=/data/astrometry/indexes
LUMINA_ASTROMETRY_PROCESS_TIMEOUT_SECONDS=900
LUMINA_ASTROMETRY_PROCESS_MEMORY_MB=
LUMINA_ASTROMETRY_PROCESS_CPU_SECONDS=
```

## Ephemeris

```text
LUMINA_EPHEMERIS_KERNEL_PATH=./data/ephemeris/<file>
LUMINA_EPHEMERIS_KERNEL_CHECKSUM=
LUMINA_EPHEMERIS_NAME=
```

The app must verify checksum and supported time coverage.

## Live-provider schedules

Use duration/cron configuration only when implemented. Defaults live in typed settings and are documented.

Examples:

```text
LUMINA_SYNC_LAUNCHES_MINUTES=60
LUMINA_SYNC_CELESTRAK_MINUTES=360
LUMINA_SYNC_NOAA_MINUTES=5
LUMINA_SYNC_EXOPLANETS_HOURS=168
```

## Security

```text
LUMINA_TRUSTED_PROXY_COUNT=0
LUMINA_RATE_LIMIT_ENABLED=true
LUMINA_UPLOAD_RATE_LIMIT_PER_HOUR=
LUMINA_CSP_REPORT_ONLY=false
```

Future authentication variables are not added until authentication is approved.

## Test

```text
LUMINA_USE_PROVIDER_FIXTURES=true
LUMINA_TEST_DATABASE_URL=
```

Fixture mode must be impossible in production through startup validation.

## Validation rules

- Production refuses localhost public URLs where inappropriate.
- Production refuses `DEMO_KEY`.
- Production refuses fixture mode.
- Enabled provider requiring a key fails startup or provider readiness explicitly.
- Secret values are redacted in config logging.
- CORS list parsed as exact origins.
- Numeric limits have bounded safe ranges.
