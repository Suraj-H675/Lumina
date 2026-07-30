# Repository Structure

Create this incrementally; do not create empty future-phase folders.

```text
lumina/
├── AGENTS.md
├── PLAN.md
├── README.md
├── CONTRIBUTING.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── pyproject.toml
├── uv.lock
├── compose.yaml
├── .env.example
├── .editorconfig
├── .gitignore
├── .node-version
├── .python-version
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── lib/
│   │   │   ├── local-data/
│   │   │   ├── styles/
│   │   │   └── workers/
│   │   ├── public/
│   │   └── tests/
│   └── api/
│       ├── src/lumina/
│       │   ├── main.py
│       │   ├── bootstrap.py
│       │   ├── settings.py
│       │   ├── shared/
│       │   ├── catalog/
│       │   ├── search/
│       │   ├── astronomy/
│       │   ├── observability/
│       │   ├── planning/
│       │   ├── content/
│       │   ├── learning/
│       │   ├── missions/
│       │   ├── live_data/
│       │   ├── satellites/
│       │   ├── identification/
│       │   ├── provenance/
│       │   └── jobs/
│       └── tests/
├── packages/
│   ├── ui/
│   ├── api-client/
│   ├── config-eslint/
│   ├── config-typescript/
│   └── content-schema/
├── content/
│   ├── concepts/
│   ├── lessons/
│   ├── learning-paths/
│   ├── quizzes/
│   ├── myths/
│   ├── stories/
│   ├── activities/
│   └── editorial/
├── data/
│   ├── seed/
│   ├── fixtures/
│   ├── manifests/
│   └── README.md
├── migrations/
├── scripts/
│   ├── bootstrap/
│   ├── data/
│   ├── science/
│   └── ci/
├── infra/
│   ├── docker/
│   └── deployment/
├── docs/
└── .github/
    ├── workflows/
    ├── ISSUE_TEMPLATE/
    └── pull_request_template.md
```

Phase 0A creates only the root workspace/tooling files, `packages/config-typescript`,
`apps/api` package metadata and import smoke test, and `scripts/bootstrap`. All other entries
remain future-phase structure and must not be created as empty placeholders.

Phase 0B2 adds the API database runtime/probe and readiness service under `apps/api/src/lumina`,
root `migrations/` for Alembic, and `infra/docker/postgres` for the single local database script.
Phase 0B3A adds `lumina/jobs/domain`, `lumina/jobs/application`, and the enqueue-only
`lumina/jobs/infrastructure/postgresql` adapter. Phase 0B3C3 adds the static handler contract and
registry plus one-job execution application service under `lumina/jobs`, and only owner-identity
and timing support under `lumina/worker`. It does not add a worker entry point, CLI, polling loop,
signal handling, provider, frontend, or generated-client code.

## Ownership

### `apps/web`

Presentation, routing, browser APIs, accessibility, visualizations, local data, and API consumption. No upstream-provider logic or authoritative scientific formulas.

### `apps/api`

Public API, scientific domain, providers, catalog, jobs, normalized data, and calculations.

### `packages/ui`

Reusable accessible primitives without feature business logic.

### `packages/api-client`

Generated client plus transport wrapper. Generated files are never manually edited.

### `content`

Reviewed authored content. Treat content changes like code.

### `data/seed`

Small, cited, curated baseline records only.

### `data/fixtures`

Sanitized deterministic tests. Never production.

### `data/manifests`

Source, kernel, media, and licensing manifests.

### `migrations`

Alembic history. Never edit applied migrations.

## Naming

- Python: `snake_case`
- TypeScript files: `kebab-case`
- React components: `PascalCase`
- SQL tables: singular `snake_case`
- routes/slugs: lowercase kebab-case
- units encoded in names only when permanently fixed; otherwise value+unit
