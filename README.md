# Nova-Lumina

Nova-Lumina is a public astronomy learning and exploration platform built around reviewed scientific data, deterministic calculations, visual exploration, observation planning, simulations, live-space data, and guided learning.

Live application: https://nova-lumina.vercel.app

## What it includes

- astronomical catalogue exploration and object pages;
- observation planning, sky finding, and weather-assisted context;
- WorldWide Telescope deep-sky visualisation;
- deterministic astronomy simulations and interactive labs;
- launches, satellites, space weather, near-Earth objects, and other reviewed live-data surfaces;
- learning paths, quizzes, collections, journals, saved plans, offline support, and PWA behaviour;
- optional image-identification infrastructure, intentionally disabled in the current public deployment.

Scientific results are sourced, deterministic, and explicit about provenance, uncertainty, limitations, and stale or unavailable upstream data. Core functionality does not require a paid API, SDK, or LLM.

## Repository

```text
apps/
  api/                 FastAPI backend, worker, domain logic, providers
  web/                 Next.js application
packages/
  api-client/          Generated OpenAPI contracts and transport
  config-typescript/   Shared TypeScript configuration
data/                  Reviewed source data, manifests, seed data, sky context
migrations/            Alembic migration history
scripts/               Bootstrap, validation, OpenAPI, and CI tooling
infra/                 Local and hosted infrastructure definitions
.github/               CI and public repository templates
```

Permanent compatibility identifiers such as the Python `lumina` package, `LUMINA_*` environment variables, existing PostgreSQL role/database names, persisted browser-storage keys, applied migrations, and frozen scientific artifact identifiers intentionally retain their existing names.

Durable maintainer references:

- [Architecture](docs/ARCHITECTURE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Data and provenance](docs/DATA_AND_PROVENANCE.md)

## Development

Prerequisites are pinned by the repository:

- Node.js: `.node-version`
- Python: `.python-version`
- pnpm: root `packageManager`
- Docker: local PostgreSQL integration environment

Bootstrap:

```sh
./scripts/bootstrap/setup.sh
docker compose --env-file .env up -d --wait db
uv run alembic upgrade head
```

Run the API and web app:

```sh
LUMINA_ENV=development uv run nova-lumina-api
pnpm dev
```

Default local URLs:

- web: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:8000`

## Quality

Run the repository gate:

```sh
pnpm check
```

Important broader checks:

```sh
pnpm build
pnpm test:e2e
pnpm security:check
LUMINA_ENV=test uv run pytest -q
```

The repository keeps permanent correctness, scientific-integrity, accessibility, performance, security, migration, generated-contract, and browser tests. One-time development audit artifacts are intentionally not kept in the production repository.

The current deployment intentionally leaves two credential/infrastructure-dependent capabilities disabled:

- NASA APOD and NeoWs require a registered NASA API key before they can be enabled and verified.
- Image identification requires shared persistent private storage; remote solving additionally requires Astrometry.net credentials and the worker lifecycle.

Automated checks do not substitute for real accessibility, device, or field-performance observation.
Do not represent unperformed manual review as completed evidence.

## Engineering principles

- Verify changing external facts and APIs instead of guessing.
- Keep architecture only while it earns its complexity.
- Prefer small, explicit interfaces and remove obsolete scaffolding.
- Preserve scientific provenance and distinguish measurements, estimates, models, and unknowns.
- Treat accessibility, privacy, degraded operation, and failure states as product behaviour.
- Never claim test, deployment, compliance, or performance results that were not actually observed.

## Security

Do not report vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Licence

No project licence is currently granted. The repository is public, but the absence of a licence means normal copyright restrictions apply. Third-party data, libraries, imagery, and source material remain subject to their own terms.
