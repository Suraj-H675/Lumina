# Contributing to Nova-Lumina

Nova-Lumina welcomes well-scoped improvements that preserve scientific correctness, accessibility, privacy, and maintainability.

## Before changing code

- Read [README.md](README.md), [AGENTS.md](AGENTS.md), and the relevant file under [docs/](docs/README.md).
- Search for the existing behaviour and tests before introducing a new abstraction.
- Verify current external APIs, libraries, data releases, and standards from authoritative sources when the change depends on them.
- Do not assume an existing implementation or previous decision must be preserved.

## Local setup

```sh
./scripts/bootstrap/setup.sh
docker compose --env-file .env up -d --wait db
uv run alembic upgrade head
```

Run the web app with `pnpm dev` and the API with `LUMINA_ENV=development uv run nova-lumina-api`.

## Required checks

Use focused tests while developing, then run the relevant broader gates. The normal repository gate is:

```sh
pnpm check
```

Changes that touch database-backed Python behaviour should also run the appropriate pytest/integration coverage with the accepted local PostgreSQL environment. Browser behaviour should receive focused Playwright coverage where appropriate.

Security-sensitive changes should run:

```sh
pnpm security:check
```

See [docs/TESTING.md](docs/TESTING.md).

## Change quality

A strong change:

- solves a demonstrated problem;
- keeps ownership boundaries clear;
- removes obsolete code rather than layering new behaviour on top of it;
- adds regression coverage for new behaviour or repaired defects;
- updates documentation when the public/developer contract changes;
- preserves provenance and uncertainty for scientific data;
- considers keyboard, screen-reader, zoom/reflow, reduced-motion, touch, offline, and failure behaviour where relevant.

## Data and scientific changes

Do not hand-wave scientific values. Include the authoritative source, release/version, retrieval context, units, uncertainty/limitations, and attribution required by the owning artifact or manifest contract. See [docs/DATA_AND_PROVENANCE.md](docs/DATA_AND_PROVENANCE.md).

## Privacy and security

Never include secrets, private user content, exact personal locations, private uploads, or credentials in issues, fixtures, logs, screenshots, or commits. Security vulnerabilities must be reported privately as described in [SECURITY.md](SECURITY.md).
