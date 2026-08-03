# Contributing to Lumina

Read `AGENTS.md` and `docs/00_SOURCE_OF_TRUTH.md` before contributing.

Lumina currently has no project licence and is not accepting outside contributions under an
open-source licence. Licensing must be reconsidered before outside contributions are accepted or
the project is declared open source.

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

Use `.github/pull_request_template.md` so skipped checks, phase boundaries, provenance, privacy,
accessibility, and rollback evidence remain explicit. Public bug and data reports must not include
secrets, exact locations, private journal content, or upload contents; security disclosures follow
`SECURITY.md` privately.

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

Phase 0C4 verification commands are maintained in README. Before a PR, run the focused checks while
iterating and the applicable complete acceptance set before reporting completion:

```sh
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) process.exit(1)'
test "$(pnpm --version)" = "11.17.0"
uv --version |
  awk 'NR == 1 && $1 == "uv" && $2 == "0.12.1" { ok=1 } END { exit !(NR == 1 && ok) }'
uv lock --check
uv sync --locked
pnpm install --frozen-lockfile
pnpm check
uv run ruff format --check .
uv run ruff check .
uv run mypy apps/api/src apps/api/tests scripts/bootstrap scripts/data scripts/openapi scripts/ci
docker compose up -d --wait db
uv run alembic upgrade head
LUMINA_ENV=test uv run pytest -q
pnpm build
pnpm --filter @lumina/web exec playwright install chromium
pnpm test:e2e
pnpm security:check
docker compose down
```

The plain Chromium installation above is the accepted local Arch Linux command. GitHub Ubuntu uses
`pnpm --filter @lumina/web exec playwright install --with-deps chromium` so the required Linux
packages are installed there. The Docker-based security command requires a full, non-shallow Git
history; exit 10 means findings and exit 20 means scanner/preflight execution failure. Both fail the
gate and raw scanner output must never be pasted into a public issue or PR.

After checks, inspect `git diff`, the staged index, and nonignored untracked files. Never use cleanup
or regeneration to hide a mutation caused by a supposedly read-only check.

## Reporting problems

Security issues follow `SECURITY.md`. Scientific errors should include the page/value, source or calculation, date, and supporting reference if available.
