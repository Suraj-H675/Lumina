# Deployment

Nova-Lumina's public runtime is a multi-service application. A deployment is only ready when the web
application, API, PostgreSQL state, reviewed catalogue data, and enabled provider state agree on the
same release.

This document describes the vendor-neutral deployment contract. Hosting-specific configuration may
implement this contract, but must not weaken it.

## Public deployment profile

The current production profile is:

- Next.js web application on an HTTPS Node-capable host;
- the production FastAPI image from `Dockerfile.vercel` on an HTTPS container-capable web
  service;
- durable managed PostgreSQL;
- image identification disabled;
- provider refresh performed by bounded scheduled `nova-lumina-provider sync` commands rather than a
  continuously running worker;
- API documentation left disabled by the production default.

The worker is still the canonical runtime for queued jobs and is required if identification or other
queued work is enabled. The direct provider command is only an alternative execution boundary for
the same guarded `ProviderSyncService` when the deployment does not otherwise need a worker.

## Required production settings

### API

At minimum the API service needs:

```text
LUMINA_ENV=production
LUMINA_LOG_LEVEL=INFO
LUMINA_API_HOST=0.0.0.0
LUMINA_API_PORT=<service port>
LUMINA_CORS_ORIGINS=https://<public-web-origin>
LUMINA_BUILD_COMMIT=<deployed git sha>
LUMINA_DATABASE_TLS_MODE=verify-full
LUMINA_DATABASE_URL=postgresql+asyncpg://<runtime-role>:<password>@<host>:<port>/<database>
LUMINA_ENABLE_REMOTE_ASTROMETRY=false
```

Do not append database query parameters. Nova-Lumina configures the reviewed TLS mode through driver
arguments and intentionally rejects connection-string query options.

The one-off migration environment additionally needs:

```text
LUMINA_DATABASE_SYNC_URL=postgresql+psycopg://<migration-role>:<password>@<host>:<port>/<database>
```

The reviewed Messier v2 catalogue operation additionally needs:

```text
LUMINA_CATALOG_OPERATOR_DATABASE_URL=postgresql+asyncpg://<catalog-role>:<password>@<host>:<port>/<database>
```

`LUMINA_NASA_API_KEY` is optional for the core product. Providers whose reviewed contracts require a
registered NASA key must remain disabled until the key is configured server-side.

### Web

Generic production web builds require both API origins explicitly:

```text
LUMINA_WEB_API_ORIGIN=https://<public-api-origin>
LUMINA_WEB_PUBLIC_API_ORIGIN=https://<public-api-origin>
```

The first value is used by server-side web requests. The second can reach browser code and therefore
must be the real public HTTPS API origin. Production deliberately rejects loopback and plaintext
browser API origins.

### Vercel Services profile

The repository `vercel.json` defines a same-project deployment with:

- Singapore (`sin1`) as the compute region so the web/API runtime stays colocated with the
  production Neon database in `aws-ap-southeast-1`;
- `web`: the Next.js workspace in `apps/web/`;
- `api`: the root `Dockerfile.vercel` container;
- a private service binding that injects the API service URL into the web service as
  `LUMINA_WEB_API_ORIGIN`;
- public same-origin rewrites for `/api/v1/*` and `/health/*` only;
- all remaining routes, including Next's own `/api/satellite-passes`, routed to `web`.

For Neon, use the pooled `lumina_app` connection for `LUMINA_DATABASE_URL`; keep migration/admin
operations on direct connections. This matches Neon's guidance for Python web/serverless runtimes
while preserving direct-session semantics for Alembic and ownership work.

For this profile, `LUMINA_WEB_PUBLIC_API_ORIGIN` does not need to be configured. In production on
Vercel, Nova-Lumina derives the browser-visible HTTPS origin from `VERCEL_PROJECT_PRODUCTION_URL`, which
tracks the stable production domain rather than the unique hostname of one deployment. Outside
Vercel, the explicit public-origin requirement remains unchanged and fails closed when omitted.

The API console runner also honors a platform-provided `PORT` when present; invalid platform values
fail startup rather than silently falling back. `LUMINA_API_PORT` remains the default everywhere
else.

Because the public API is same-origin in this profile, leave `LUMINA_CORS_ORIGINS` unset/empty unless
another trusted browser origin is deliberately introduced.

## Database bootstrap

Use an administrator/database-owner connection only for initial role/database ownership and extension
provisioning. The accepted migration lineage requires that administrator role to be named
`lumina_admin`; `pg_trgm 1.6` must also be owned by `lumina_admin`. Do not run the application with
administrator credentials.

Create three fixed login roles with pairwise-distinct credentials:

- `lumina_migrate`: migration role; no superuser, createdb, createrole, bypassrls, or inherited role
  privileges;
- `lumina_app`: API/provider runtime role with the least privileges granted by migrations;
- `lumina_catalog_operator`: reviewed catalogue canonical-selection role, also without inherited or
  administrative privileges.

The target database remains owned by `lumina_admin`. Revoke public database/schema
privileges, grant database `CONNECT` to the three Nova-Lumina roles, grant `USAGE, CREATE` on `public` to
`lumina_migrate`, and grant only `USAGE` on `public` to the runtime and catalogue roles.

On PostgreSQL 18 managed services, verify the three restricted roles after provisioning. They must
have no `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`, or inherited-role
capabilities, and no role memberships in either direction. Some provider APIs create roles with
administrative memberships by default; those provider-created roles do not satisfy Nova-Lumina's contract.

### Migration order

The accepted migration lineage deliberately requires owner-provisioned `pg_trgm` between B2 and B3.
For a new production database:

```sh
uv run alembic upgrade b7f3a2c81d4e
# As lumina_admin, in the target Nova-Lumina database:
# CREATE EXTENSION pg_trgm VERSION '1.6' SCHEMA public;
uv run alembic upgrade head
test "$(uv run alembic heads)" = "a2b3c4d5e6f7 (head)"
```

Do not rewrite migration history or create the extension from the runtime/migration role merely to
fit a hosting vendor. A managed PostgreSQL service that cannot satisfy this contract is not compatible
with Nova-Lumina.

## Reviewed catalogue bootstrap

Migrations do not by themselves establish the complete reviewed catalogue. After migrations, ingest
and verify every current reviewed slice:

```sh
uv run nova-lumina-catalog ingest --slice gaia-dr3-exoplanet-host-photometry-v1
uv run nova-lumina-catalog data-check --slice gaia-dr3-exoplanet-host-photometry-v1

uv run nova-lumina-catalog ingest --slice gaia-dr3-exoplanet-host-astrometry-v1
uv run nova-lumina-catalog data-check --slice gaia-dr3-exoplanet-host-astrometry-v1

uv run nova-lumina-catalog ingest --slice simbad-messier-j2000-v2
uv run nova-lumina-catalog data-check --slice simbad-messier-j2000-v2
```

The Messier ingestion command uses the separate catalogue-operator connection for canonical selection
and validates the reviewed selection fingerprint. A failed ingest or data check blocks deployment.

These commands are replay-safe and should also be exercised against a deployment candidate before a
release is promoted.

## Provider refresh without a permanent worker

Provider state is disabled by default. Enable only providers that the deployment is prepared to keep
fresh and whose credentials, where required, are configured:

```sh
uv run nova-lumina-provider enable --provider <provider-code>
```

A scheduler may then call the bounded direct execution boundary:

```sh
uv run nova-lumina-provider sync --provider <provider-code>
```

This command uses the same provider registry, lease acquisition, due-time checks, request limits,
schema validation, replacement protection, stale fallback, circuit breaker, and persistence as the
worker-owned provider job. Its JSON output contains operational metadata only; provider payload bytes
and raw response hashes are not emitted.

Use the reviewed source-manifest cadence:

| Provider code            | Scheduler invocation                                  |
| ------------------------ | ----------------------------------------------------- |
| `noaa-swpc`              | every 5 minutes                                       |
| `nasa-exoplanet-archive` | hourly (the provider enforces its 6-hour eligibility) |
| `nasa-apod`              | hourly (the provider enforces its 4-hour eligibility) |
| `nasa-neows`             | hourly (the provider enforces its 2-hour eligibility) |
| `launch-library-2`       | hourly                                                |
| `celestrak-gp`           | hourly (the provider enforces its 2-hour eligibility) |
| `zooniverse-panoptes`    | every 6 hours                                         |

The production scheduler of record is the branch-scoped Neon Function in
`infra/neon/functions/provider-scheduler/`. Neon schedule triggers invoke one provider per request,
and the function delegates the actual cycle to Nova-Lumina's authenticated
`POST /api/v1/providers/internal-sync` boundary. Provider networking, validation, persistence,
leases, due-time checks, stale fallback, and circuit breaking therefore remain implemented only in
the Python provider runtime; the Neon function contains no source-specific science or normalization
logic.

The API requires `LUMINA_PROVIDER_TRIGGER_TOKEN`, a 64-character lowercase hexadecimal secret, for
that hidden route. Deploy the same value as an environment variable on the Neon function. The Neon
function also requires an independent `LUMINA_NEON_TRIGGER_PATH_TOKEN` of the same format; each Neon
trigger places that private path token plus exactly one approved provider code in its
`function_path`. Trigger requests must also contain Neon's schedule-invocation header and bounded
schedule payload. Do not put the Nova-Lumina bearer token in a URL or trigger definition.

Create production triggers only for providers that have been deliberately enabled. The reviewed
polling policy is version-controlled in `infra/neon/provider-schedules.json`. Trigger cadence is
intentionally more frequent than provider eligibility; the atomic database `next_sync_at` claim is
the authority for whether an upstream request may run. This prevents second-level cron drift from
doubling effective refresh intervals while still preserving every provider's upstream rate limit.
Use separate triggers so one slow or failing source cannot block another provider's invocation:

| Provider code            | Neon polling trigger |
| ------------------------ | -------------------- |
| `noaa-swpc`              | `*/2 * * * *`        |
| `nasa-exoplanet-archive` | `19 * * * *`          |
| `launch-library-2`       | `8,38 * * * *`        |
| `celestrak-gp`           | `13,43 * * * *`       |
| `zooniverse-panoptes`    | `47 * * * *`          |

APOD and NeoWs remain without schedule triggers until a registered NASA API key is configured and
those providers are explicitly enabled. Provider-owned due-time checks remain authoritative if a
trigger is retried or delivered late.

`.github/workflows/providers.yml` remains the manual operator and rollback fallback. It resolves the
stable production `/api/v1/meta` endpoint first and checks out the exact reported `build_commit`
before running any provider operator command, keeping manual work aligned with the deployed database
contract. It is intentionally manual-only; automatic provider scheduling belongs exclusively to the
Neon triggers above so Nova-Lumina does not maintain two competing production schedulers.

The workflow requires a GitHub Actions `LUMINA_DATABASE_URL` secret containing the same pooled,
`lumina_app` production URL shape used by the API. `LUMINA_NASA_API_KEY` remains optional: APOD and
NeoWs stay disabled and network-silent until a registered NASA key is configured and an operator
explicitly enables them. The workflow exposes manual `status`, `enable`, `disable`, and `sync`
operations for the finite production provider allowlist.

If no scheduler is configured, leave provider state disabled and expose the product's existing honest
unavailable state instead of claiming current provider data.

## Identification

The current production profile keeps identification disabled. The only supported live identification
mode uses remote Astrometry.net, while private uploads currently use filesystem storage only. Enabling
it on an ephemeral web service would lose uploads, and API/worker processes would need shared
persistent storage.

Do not enable identification until the deployment provides a reviewed shared persistent-storage
design, an Astrometry.net server API key, and the worker's polling and retention lifecycle.

## Container artifact

Build the API from the repository root:

```sh
docker build -f Dockerfile.vercel -t nova-lumina-api:<git-sha> .
```

The image:

- pins the official Python 3.12.13 base and uv 0.12.17 binary image by digest;
- installs only locked production Python dependencies;
- contains the API source, migrations, and reviewed runtime science data required by the API;
- runs as UID/GID `10001` rather than root;
- contains no environment secrets;
- can be used for the API service and for one-off migration/catalog/provider operator commands.

CI must build and smoke this image before aggregate acceptance can pass.

## Release order

For an initial deployment:

1. Provision PostgreSQL and the three Nova-Lumina roles.
2. Migrate to B2.
3. Provision and verify `pg_trgm` as the database owner.
4. Migrate to repository head.
5. Ingest and data-check all three reviewed catalogue slices.
6. Deploy the API image with identification and providers disabled.
7. Verify API liveness and readiness over HTTPS.
8. Build/deploy the web app with the exact public API origin.
9. Verify browser requests, CORS, narrow/mobile behavior, and critical product journeys on the public
   origins.
10. Configure provider credentials, deliberately enable approved providers, then enable their external
    schedules.
11. Observe provider freshness/status before describing those surfaces as live.

For subsequent releases, run migrations/catalog checks as an explicit pre-promotion step. Never run
Alembic automatically from every API replica or request cold start.

## Public verification

At minimum verify the deployed release against:

- `/health/live` and `/health/ready` on the API origin;
- `/status` on the web origin;
- catalogue browse/search and one object detail;
- one deterministic simulation request from the browser;
- one observation/sky-context journey;
- mobile-width overflow and keyboard navigation on representative routes;
- provider status/freshness for every provider actually enabled;
- the deployed build SHA reported by the API status surface.

Manual accessibility, device, and field-performance claims still require real observation; automated
deployment readiness is not evidence that those observations occurred.

## Secrets and rollback

- Keep database, NASA, and Astrometry.net credentials only in server-side secret stores.
- Never expose them through `NEXT_PUBLIC_*`, browser-visible configuration, image layers, logs, or
  committed deployment files.
- Retain the previous web/API artifact for rollback.
- Database migrations are forward-owned. Before applying a release migration, understand whether an
  application rollback remains compatible with the migrated schema.
- Back up or use the managed database provider's restore/branch mechanism before destructive operator
  work.
