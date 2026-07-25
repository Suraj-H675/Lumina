# Environment Variables

This is the planned configuration contract. Add variables only when the related phase is implemented. `.env.example` must contain names and safe descriptions, never secrets.

Phase 0A defined no Lumina runtime environment variables. Phase 0B1 activates only the
database-independent API variables below. All other variables in this document remain planned
until their owning roadmap phases are implemented.

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

## Planned core variables

```text
LUMINA_PUBLIC_WEB_URL=http://localhost:3000
LUMINA_PUBLIC_API_URL=http://localhost:8000
LUMINA_DATABASE_URL=postgresql+asyncpg://...
LUMINA_DATABASE_SYNC_URL=postgresql://...
LUMINA_REQUEST_TIMEOUT_SECONDS=30
```

Future database URLs remain environment-only and portable standard PostgreSQL contracts through
SQLAlchemy, Alembic, asyncpg, and Psycopg. No database or managed-host credential is introduced in
Phase 0B1. Supabase may be evaluated later only as an optional PostgreSQL host, not as a required
SDK, browser data API, authentication, storage, realtime, or edge-function dependency.

## Web public variables

Only non-secret values use `NEXT_PUBLIC_`.

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_ENV=development
NEXT_PUBLIC_ENABLE_WEBGL=true
NEXT_PUBLIC_ENABLE_IDENTIFICATION=false
```

Do not put provider keys in public variables.

## Jobs

```text
LUMINA_WORKER_ID=
LUMINA_WORKER_POLL_SECONDS=2
LUMINA_JOB_HEARTBEAT_SECONDS=30
LUMINA_JOB_STALE_SECONDS=120
LUMINA_JOB_MAX_ATTEMPTS=5
```

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
