# Contributing to Lumina

Read `AGENTS.md` and `docs/00_SOURCE_OF_TRUTH.md` before contributing.

## Development principles

- Work within the active roadmap phase.
- Prefer complete vertical slices.
- Never fabricate scientific data.
- Preserve source provenance.
- No LLM/generative-AI dependency.
- No paid core dependency.
- Keep personal data local-first.
- Design for accessibility and degraded modes.
- Update tests and documentation with code.

## Branches

Use short-lived branches:

- `feat/<scope>`
- `fix/<scope>`
- `docs/<scope>`
- `refactor/<scope>`
- `chore/<scope>`

## Commits

Use Conventional Commit-style messages:

- `feat(catalog): add alias search`
- `fix(observe): handle polar night`
- `docs(science): clarify moon scoring`
- `test(provider): add schema drift fixture`

A commit must not claim a feature that remains mocked.

## Pull requests

A PR includes:

- roadmap phase/task;
- problem and user outcome;
- architecture/science decisions;
- screenshots for UI;
- source/provider changes;
- migration notes;
- tests run;
- accessibility checks;
- known limitations;
- rollback/cost impact when relevant.

Keep unrelated changes separate.

## Code review

Reviewers check:

1. product scope;
2. scientific correctness;
3. provenance/licensing;
4. architecture boundaries;
5. privacy/security;
6. accessibility;
7. tests;
8. performance;
9. documentation.

## Scientific changes

Include:

- formula/reference;
- units;
- assumptions;
- valid range;
- tolerance;
- independent comparison;
- algorithm version change;
- affected cache invalidation.

## Data-source changes

Include:

- official docs;
- terms/licence;
- schema fixture;
- refresh/cache policy;
- failure behavior;
- attribution;
- provider-disable path.

## Content changes

Published content requires:

- source list;
- review metadata;
- mode variants if required;
- image/media credits;
- no copied text without compatible licence;
- quiz verification.

## Migrations

- Create through Alembic.
- Do not edit applied migrations.
- Test upgrade.
- Test downgrade when realistic.
- Document backfill.
- Avoid long locks.
- Never use application startup for large backfills.

## Generated files

Do not manually edit generated API client files. Update OpenAPI and regenerate.

## Local verification

Exact commands are maintained in README after bootstrap. Before PR:

- web format/lint/type/test/build;
- API Ruff/mypy/pytest;
- migrations;
- relevant E2E;
- docs/content/data checks.

## Reporting problems

Security issues follow `SECURITY.md`. Scientific errors should include the page/value, source or calculation, date, and supporting reference if available.
