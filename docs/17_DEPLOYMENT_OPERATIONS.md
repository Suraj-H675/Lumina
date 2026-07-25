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
