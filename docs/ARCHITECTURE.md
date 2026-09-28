# Architecture

## Current shape

Nova-Lumina is a monorepo containing a Next.js web application and a Python/FastAPI backend. The backend also owns the sequential background worker and provider integrations. PostgreSQL stores shared server-side state.

## Naming compatibility

`Nova-Lumina` is the product, repository, deployment, and user-facing application name. A small set
of older `lumina` identifiers remain intentionally as compatibility contracts rather than branding:

- the Python import namespace `lumina`;
- `LUMINA_*` environment variables already provisioned across deployment and CI systems;
- the private scheduler header `X-Lumina-Provider-Code` already shared by the API and Neon function;
- PostgreSQL database and role names such as `lumina`, `lumina_app`, and `lumina_migrate`;
- persisted browser-storage/export identifiers used to read existing local user data;
- applied migration history and frozen algorithm/schema/version identifiers;
- content-addressed reviewed scientific artifacts whose exact bytes are part of their integrity contract;
- historical quality-audit artifacts that record the application name observed when the evidence
  was actually collected.

Changing any of those requires an explicit compatibility/data migration. Do not rename them merely
to make internal identifiers mirror the current product brand.

```text
browser
  |
  v
Next.js web
  |
  v
FastAPI API ---- PostgreSQL
  |
  +---- reviewed external providers

background worker ---- PostgreSQL ---- reviewed external providers
```

The modular-monolith boundary is currently appropriate because the domains share contracts, data, deployment cadence, and operational scale. It should remain only while that continues to be true.

## Web application

`apps/web` owns:

- routing and presentation;
- browser accessibility and interaction;
- PWA/offline behaviour;
- WorldWide Telescope integration;
- client-side visualisations;
- personal browser persistence currently implemented with IndexedDB/Dexie;
- calls to Nova-Lumina's public API.

Browser-local persistence is a current implementation choice, not an invariant. Cross-device/cloud persistence can be introduced later if it provides enough product value and has an acceptable privacy/cost model.

## API

`apps/api` owns:

- API contracts and validation;
- scientific domain calculations;
- catalogue reads/ingestion;
- provenance/provider runtime;
- shared PostgreSQL state;
- observation and simulation server calculations;
- optional identification/plate-solving orchestration;
- background job definitions and worker composition.

The browser must never receive private/internal service origins or provider/database credentials.

## Worker

The worker consumes durable PostgreSQL-backed jobs. It handles tasks that do not belong in an interactive HTTP request, such as provider synchronisation and optional identification work.

Do not add Redis or another queue simply because background work exists; add infrastructure only when the PostgreSQL-backed design cannot meet a demonstrated requirement.

## Data boundaries

Reviewed source data and manifests live under root `data/`. Generated client contracts live in `packages/api-client`. Browser-delivered immutable data lives under `apps/web/public/data` when it genuinely must be fetched by the browser.

See [Data and provenance](DATA_AND_PROVENANCE.md).

## External services

External astronomy/weather/visualisation services are adapters, not sources of opaque intelligence. Provider responses are validated, normalized, cached where appropriate, and surfaced with freshness/provenance boundaries.

## Optional capabilities

Image identification is deployment-gated and may be disabled entirely. A disabled capability should not require storage, worker resources, or exposed routes.

## Security boundaries

- browser-visible and internal API origins are separate configuration concepts;
- production browser origins require HTTPS;
- production database transport uses verified TLS;
- secrets remain server-side;
- private uploads and exact user locations must not leak into logs or public URLs;
- public response failures should be bounded and should not expose internal exceptions.
