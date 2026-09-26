# Testing and CI

## Local repository gate

```sh
pnpm check
```

This composes:

- formatting checks;
- ESLint;
- TypeScript checks;
- API-client and web unit/component tests;
- generated OpenAPI/client freshness;
- production manifest validation;
- catalogue/sky-context artifact validation;
- local Markdown-link validation;
- migration integrity.

Database integration tests require the accepted PostgreSQL environment and are exercised separately by hosted CI.

## Useful focused commands

```sh
pnpm build
pnpm test
pnpm test:e2e
pnpm api:check
pnpm manifests:check
pnpm docs:check
pnpm migrations:check
pnpm security:check
uv run ruff format --check .
uv run ruff check .
uv run mypy apps/api/src apps/api/tests scripts/bootstrap scripts/data scripts/openapi scripts/ci
```

## Hosted CI

`.github/workflows/ci.yml` has independent acceptance lanes for:

- repository checks;
- Python/PostgreSQL integration;
- production web build and Chromium E2E;
- dependency/secret security;
- aggregate acceptance.

A change is not certified until the exact pushed commit has passed every required lane.

## Determinism

Routine CI does not rely on live astronomy providers. Provider behaviour is tested with bounded deterministic fixtures and reviewed artifacts. Generated OpenAPI output and accepted migration history have explicit freshness/integrity checks.

## Accessibility

Automated axe/component/browser checks are useful regression tools, but they do not prove WCAG conformance, real screen-reader usability, native browser zoom/reflow quality, or physical-device performance. Those require real observations.

## Documentation

`scripts/ci/check_doc_links.py` validates repository-local Markdown targets/fragments for tracked and nonignored candidate Markdown. External URLs are intentionally not fetched during routine CI.
