# Lumina

Lumina is a public astronomy learning and exploration platform that combines reviewed scientific data, deterministic simulations, observation planning, sky visualisation, live-space data, and guided learning in one web application.

The project prioritises scientific honesty, provenance, accessibility, graceful degradation, and a low-cost operational footprint. Existing implementation choices are not treated as permanent constraints: they should be kept only while they remain the best solution.

## What Lumina includes

- catalogue exploration and object pages;
- astronomy simulations and interactive labs;
- observation planning, sky finding, and weather-assisted context;
- deep-sky visualisation with WorldWide Telescope;
- launches, satellites, near-Earth objects, space weather, and other reviewed live-data surfaces;
- learning paths, quizzes, collections, journals, saved plans, offline support, and PWA behaviour;
- optional image identification infrastructure, currently safe to disable at deployment level.

Lumina currently has no required LLM dependency. Scientific results come from reviewed data, deterministic calculations, and explicit source/model boundaries.

## Repository layout

```text
apps/
  api/                 FastAPI backend, worker, domain logic, providers
  web/                 Next.js application
packages/
  api-client/          Generated OpenAPI contracts and bounded transport
  config-typescript/   Shared TypeScript configuration
data/                   Reviewed source data, manifests, evidence, audit artifacts
migrations/             Alembic migration history
scripts/                Bootstrap, validation, OpenAPI, and CI tooling
infra/                  Local infrastructure assets
.github/                CI and contribution templates
docs/                   Current project documentation
```

See [Repository structure](docs/REPOSITORY.md) for ownership rules.

## Development setup

Prerequisites are pinned by the repository:

- Node.js: `.node-version`
- Python: `.python-version`
- pnpm: root `packageManager`
- uv: CI/bootstrap contract
- Docker: required for the accepted local PostgreSQL integration environment

Bootstrap the workspace:

```sh
./scripts/bootstrap/setup.sh
```

Start local PostgreSQL and apply migrations:

```sh
docker compose --env-file .env up -d --wait db
uv run alembic upgrade head
```

Start the API:

```sh
LUMINA_ENV=development uv run lumina-api
```

Start the web application:

```sh
pnpm dev
```

The default local web URL is `http://127.0.0.1:3000`; the API defaults to `http://127.0.0.1:8000`.

## Quality gates

The main repository check is:

```sh
pnpm check
```

It covers formatting, linting, TypeScript, unit/component tests, generated API-contract freshness, manifest and scientific-artifact validation, documentation links, and migration integrity.

Additional important checks include:

```sh
pnpm build
pnpm test:e2e
pnpm security:check
LUMINA_ENV=test uv run pytest -q
```

See [Testing](docs/TESTING.md) and [Quality status](docs/QUALITY_STATUS.md).

## Engineering principles

- Verify external facts and APIs instead of guessing.
- Do not preserve code, architecture, data, or documentation merely because it already exists.
- Prefer the smallest architecture that correctly solves the current problem.
- Keep scientific claims deterministic, sourced, bounded, and reviewable.
- Treat accessibility and degraded operation as product behaviour, not polish.
- Never claim compliance, deployment success, or test success without evidence.
- Core functionality must not require a paid API or paid SDK. The current deployment budget requirement is zero until explicitly changed.

See [Product](docs/PRODUCT.md), [Architecture](docs/ARCHITECTURE.md), and [Data and provenance](docs/DATA_AND_PROVENANCE.md).

Current runtime/environment ownership is documented in [Configuration](docs/CONFIGURATION.md).
Public runtime topology, database/catalog bootstrap, and release order are documented in
[Deployment](docs/DEPLOYMENT.md).

## Project status

The implemented application and automated repository gates are mature. Final quality evidence still requires real human accessibility review, representative-device observations, and approved field performance evidence from a deployment; those gaps are tracked explicitly rather than being inferred from automated tests. See [Quality status](docs/QUALITY_STATUS.md).

## Security

Do not report vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Licence

No project licence is currently granted. The repository is public, but the absence of a licence means normal copyright restrictions apply. Third-party data, libraries, imagery, and source material remain subject to their own terms.
