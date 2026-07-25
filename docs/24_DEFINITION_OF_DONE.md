# Definition of Done

A feature is done only when every applicable item is satisfied.

## Product

- User outcome matches the product specification.
- Scope belongs to the current phase.
- No fake future functionality.
- Empty/loading/error/offline/stale states exist.
- Copy is clear and non-misleading.
- Relevant next action exists.
- Known limitations are visible.

## Scientific

- Source or calculation model documented.
- Units explicit.
- Uncertainty retained when available.
- measured/estimated/calculated/simulated status correct.
- algorithm/model version returned.
- range and assumptions documented.
- validation cases pass.
- no unsupported precision.
- source drawer works.

## Data

- schema/migration complete;
- constraints/indexes considered;
- provenance present;
- idempotent ingestion;
- unknown is null;
- fixtures cannot leak to production;
- parser error behavior tested;
- freshness policy defined.

## API

- typed request/response;
- OpenAPI updated;
- generated client updated;
- stable errors;
- validation and limits;
- pagination/caching where needed;
- rate/provider protection;
- integration tests;
- no database models leaked.

## Frontend

- responsive;
- keyboard;
- screen-reader labels;
- visible focus;
- reduced motion;
- 200% zoom;
- 2D/text fallback for canvas/WebGL;
- no hover-only control;
- source/freshness accessible;
- production build;
- route error boundary;
- no excessive initial bundle.

## Privacy/security

- data classification reviewed;
- minimum collection;
- exact location handling reviewed;
- upload/import validation where applicable;
- secrets server-only;
- safe logs;
- rate/resource limits;
- deletion/retention;
- threat tests;
- security headers not weakened.

## Testing

- lint/format;
- type checks;
- unit;
- property/numerical where relevant;
- integration;
- E2E critical path;
- accessibility automation and manual checks;
- regression test;
- provider fixtures;
- migration test;
- no falsely reported skipped test.

## Content/media

- authored, not generated;
- sources;
- review state;
- image type labelled;
- credit/licence;
- internal links;
- no copied text without licence;
- translations reviewed if present.

## Operations

- env variables documented;
- feature/provider disable switch where needed;
- health/status;
- metrics/logs;
- cache and stale behavior;
- cleanup/schedule;
- rollback considered;
- cost/resource impact bounded.

## Documentation

- README/feature docs updated;
- decision recorded if architecture changed;
- roadmap task/gate updated;
- API/source/model docs updated;
- known limitations;
- exact commands to verify.

## Completion report

The final implementation report states:

1. files/features changed;
2. user-visible behavior;
3. scientific/data sources;
4. tests run and results;
5. checks not run and reason;
6. remaining limitations;
7. next roadmap step.

Anything not verified must not be presented as complete.
