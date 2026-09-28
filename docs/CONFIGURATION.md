# Configuration

Nova-Lumina configuration is explicit and server-owned. The accepted backend settings are defined in
`apps/api/src/lumina/settings.py`; safe development examples live in `.env.example`. Web API-origin
settings are owned by `apps/web` and documented in `apps/web/.env.example`.

Do not add speculative environment variables. A variable belongs here only after the code accepts
and validates it.

## Backend application

Core process settings:

- `LUMINA_ENV` — `development`, `test`, `staging`, or `production`.
- `LUMINA_LOG_LEVEL` — validated application log level.
- `LUMINA_API_HOST` / `LUMINA_API_PORT` — API bind address and port.
- `LUMINA_CORS_ORIGINS` — comma-separated exact browser origins.
- `LUMINA_ENABLE_API_DOCS` — optional strict `true` / `false` override.
- `LUMINA_BUILD_COMMIT` — optional public build identifier.

Unknown uppercase `LUMINA_` settings are rejected rather than silently ignored. Secrets are kept out
of validation messages and public responses.

## PostgreSQL

The API, migrations, catalogue operator, and integration tests use separate validated URLs/roles:

- `LUMINA_DATABASE_URL`
- `LUMINA_DATABASE_SYNC_URL`
- `LUMINA_CATALOG_OPERATOR_DATABASE_URL`
- `LUMINA_TEST_DATABASE_URL`
- `LUMINA_TEST_DATABASE_SYNC_URL`
- `LUMINA_TEST_CATALOG_OPERATOR_DATABASE_URL`
- `LUMINA_DATABASE_TLS_MODE`

Development bootstrap also uses the `POSTGRES_*` values shown in `.env.example` to create local
Compose credentials. Those Compose credentials are local infrastructure state, not browser
configuration.

Staging and production require verified database TLS. Async runtime connections use the operating
system trust store with certificate and hostname verification; they do not require a per-user
`~/.postgresql/root.crt`. Migration clients use psycopg/libpq `verify-full` with the default CA file
reported by Python/OpenSSL (including an `SSL_CERT_FILE` override when configured), falling back to
libpq's system root store when no CA file is exposed. Runtime and migration credentials remain
separate.

## Jobs and worker

The PostgreSQL-backed job/worker runtime accepts:

- `LUMINA_JOB_PAYLOAD_MAX_BYTES`
- `LUMINA_JOB_DEFAULT_MAX_ATTEMPTS`
- `LUMINA_JOB_ENQUEUE_WAIT_TIMEOUT_MS`
- `LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS`
- `LUMINA_JOB_RESULT_MAX_BYTES`
- `LUMINA_JOB_STALE_SECONDS`
- `LUMINA_WORKER_ID_PREFIX`
- `LUMINA_JOB_HEARTBEAT_SECONDS`
- `LUMINA_JOB_HANDLER_TIMEOUT_SECONDS`
- `LUMINA_JOB_CANCELLATION_GRACE_SECONDS`
- `LUMINA_WORKER_POLL_SECONDS`

Defaults and numeric bounds are enforced in `AppSettings`; do not duplicate them in deployment
scripts.

## Optional provider and identification settings

- `LUMINA_NASA_API_KEY` — optional server-only registered NASA key. `DEMO_KEY` is rejected.
- `LUMINA_ENABLE_IDENTIFICATION` — explicit private-upload/identification enable override.
- `LUMINA_STORAGE_BACKEND` — currently validated to the filesystem backend only.
- `LUMINA_STORAGE_LOCAL_ROOT`
- `LUMINA_UPLOAD_MAX_BYTES`
- `LUMINA_UPLOAD_MAX_PIXELS`
- `LUMINA_UPLOAD_RETENTION_HOURS`
- `LUMINA_ENABLE_REMOTE_ASTROMETRY`
- `LUMINA_ASTROMETRY_API_URL` — currently locked to the reviewed Nova HTTPS API origin.
- `LUMINA_ASTROMETRY_API_KEY`
- `LUMINA_ASTROMETRY_PUBLICLY_VISIBLE`
- `LUMINA_ASTROMETRY_ALLOW_MODIFICATIONS`
- `LUMINA_ASTROMETRY_ALLOW_COMMERCIAL_USE`
- `LUMINA_ASTROMETRY_POLL_SECONDS`
- `LUMINA_ASTROMETRY_TIMEOUT_SECONDS`

Remote Astrometry.net requires both identification and a server API key. Privacy flags remain fixed
to the reviewed private/non-modifiable/non-commercial values in the current contract.

## Web server

The Next.js server accepts two separate API origins:

- `LUMINA_WEB_API_ORIGIN` — private/server-to-server API origin.
- `LUMINA_WEB_PUBLIC_API_ORIGIN` — browser-visible API origin.

On a Vercel Services deployment, `LUMINA_WEB_API_ORIGIN` is injected through the private API service
binding and `LUMINA_WEB_PUBLIC_API_ORIGIN` may be omitted; Nova-Lumina derives the same-origin HTTPS
production URL from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`. Using `VERCEL_URL` here is incorrect:
it names the unique deployment host and becomes cross-origin when a visitor uses the project's
production alias. Other production platforms still require the explicit browser-visible origin.

Development defaults both to loopback. Production requires an explicit browser-visible origin and
rejects plaintext or loopback public targets. Provider/database secrets must never be placed in
`NEXT_PUBLIC_*` variables.

## Source files

- Copy or generate local backend values from `.env.example`.
- Put web-local origin overrides in an ignored environment file under `apps/web` using
  `apps/web/.env.example` as the reference.
- Never commit `.env`, generated credentials, provider keys, or production database URLs.
