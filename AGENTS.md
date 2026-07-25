# AGENTS.md — Mandatory instructions for coding agents

This file governs every coding-agent action in this repository. These instructions apply to Codex and any other automated contributor.

## 1. Read order and authority

Before changing files, read:

1. `AGENTS.md`
2. `docs/00_SOURCE_OF_TRUTH.md`
3. `PLAN.md`
4. `docs/18_IMPLEMENTATION_ROADMAP.md`
5. All specifications relevant to the requested phase or feature
6. Existing code and tests in the affected area

When documents conflict, use this precedence:

1. The user's latest explicit instruction
2. `docs/00_SOURCE_OF_TRUTH.md`
3. `AGENTS.md`
4. `docs/19_DECISIONS.md`
5. Domain specification files
6. `PLAN.md`
7. Existing implementation
8. Comments and examples

Do not infer that existing code is correct merely because it exists.

## 2. Product invariants

The following decisions are frozen unless the user explicitly changes them:

- Product name: **Lumina**
- The new project is a clean rebuild.
- Lumina is free to use.
- Core functionality must not depend on paid APIs or paid SDKs.
- Lumina must not contain an LLM, generative-AI chatbot, AI answer generator, or thin API wrapper.
- Scientific results must come from deterministic calculations, curated content, or cited scientific data.
- The product is visual-first but accessible without animation or 3D.
- Personal features are local-first; cloud accounts are not required.
- The platform must distinguish measured facts, estimates, models, hypotheses, artist impressions, and unknowns.
- Every externally sourced scientific value and media asset must have provenance.
- No public social network, unrestricted comments, or direct messaging will be built.
- The application must degrade gracefully when external services fail.
- No external API is called directly from the browser if that exposes credentials, violates provider terms, bypasses caching, or creates uncontrolled traffic.

## 3. No hallucination rule

Never invent:

- scientific values;
- equations;
- API fields;
- API availability;
- licences;
- image credits;
- database columns;
- mission status;
- launch times;
- object identifiers;
- completed tests;
- benchmark results;
- accessibility compliance;
- deployment success;
- data-source reliability;
- environment variables;
- user requirements.

If a required fact is absent:

1. Search the repository documentation and code.
2. Check official upstream documentation if internet access is available and the task permits it.
3. Use a clearly marked `TODO(decision-required)` only when implementation can safely continue without the value.
4. Otherwise stop the affected subtask and report the exact missing decision.

Do not hide uncertainty behind plausible defaults.

## 4. Phase discipline

- Work only on the requested phase and its explicitly listed prerequisites.
- Do not build later-phase features “while here.”
- Do not create empty placeholder pages for the entire roadmap.
- Do not mark a feature complete when it contains mocked data, TODO-only handlers, decorative charts, or unverified formulas.
- Test fixtures must be visibly marked as fixtures and may never silently appear in production.
- A phase gate in `docs/18_IMPLEMENTATION_ROADMAP.md` must pass before beginning the next phase.
- When a requested change crosses phase boundaries, explain the dependency and implement only the minimum safe prerequisite.

## 5. Architecture rules

- Use the modular-monolith architecture defined in `docs/03_ARCHITECTURE.md`.
- Do not split the backend into microservices without a recorded architecture decision.
- Business logic belongs in domain/application services, not route handlers or React components.
- Astronomical calculations belong in the Python astronomy domain.
- UI components must not reimplement scientific formulas.
- External providers must be isolated behind adapters.
- Database models must not leak directly into public API responses.
- All public API contracts are versioned and validated.
- Generate the TypeScript API types/client from OpenAPI; do not maintain a second hand-written schema.
- Use UTC internally. Preserve the user's IANA time zone for presentation.
- Use SI units internally unless a scientific convention requires another canonical unit.
- Never use JavaScript `number` arithmetic for calculations that require scientific precision without an approved error analysis.

## 6. Data and scientific integrity

Read `docs/06_DATA_SOURCES.md`, `docs/11_SCIENCE_CONTENT_RULES.md`, and the relevant calculation specification before implementing data or science features.

Mandatory rules:

- Store original source value, unit, source identifier, source timestamp, and ingestion timestamp where applicable.
- Store uncertainty or bounds when supplied.
- Never merge conflicting measurements by silently choosing one.
- A “best value” must record the rule used to select it.
- Do not use an LLM to transform, summarise, translate, or generate scientific content.
- Do not label artist impressions as photographs.
- Do not present habitable-zone membership as evidence of life.
- Do not present visibility scores as physical measurements.
- Simulations must display assumptions and limitations.
- External data parsing must be schema validated and covered by fixture tests.
- Provider failure must not silently substitute unrelated fallback data.

## 7. Free-only dependency policy

Before adding any dependency or service, verify:

- it is open source or genuinely free for the intended usage;
- its licence is compatible;
- required attribution is documented;
- it does not force a paid tier for core functionality;
- it can be replaced through an adapter;
- it is actively maintained enough for the use case;
- it does not send user data to a third party without consent.

Do not add a SaaS dependency merely because it is convenient.

## 8. Security and privacy

Read `docs/15_SECURITY_PRIVACY.md`.

Mandatory defaults:

- Collect the minimum data needed.
- Do not require date of birth.
- Do not build behavioural advertising or third-party tracking.
- Location access requires explicit permission and must support manual coordinates.
- Exact locations remain local unless the user explicitly submits them for a server calculation.
- Uploaded sky images are private by default.
- Strip unnecessary EXIF metadata before sending images to external services.
- Validate file type using content, not only extension.
- Enforce file-size, pixel-count, and processing-time limits.
- Never log secrets, exact user locations, uploaded image contents, or private journal text.
- Do not expose provider API keys to the browser.
- Run dependency and secret scanning in CI.

## 9. Accessibility and performance

Every feature must support:

- keyboard navigation;
- visible focus;
- screen-reader labels;
- reduced motion;
- high contrast;
- responsive layouts;
- touch targets of at least 44 by 44 CSS pixels where practical;
- meaningful empty, loading, error, offline, and stale-data states;
- a 2D or textual fallback when 3D/WebGL is unavailable;
- low-bandwidth behaviour.

Do not ship an interaction that works only by hover.

Heavy simulations and visualisations must be lazy loaded. Long calculations belong in web workers or backend jobs.

## 10. Coding standards

### General

- Prefer clear code over clever code.
- Keep functions focused.
- Avoid hidden global state.
- Delete dead code.
- Do not suppress warnings without a written reason.
- Do not commit generated secrets, binary datasets, build output, or downloaded catalog dumps.
- Use structured logs.
- Errors must include stable machine codes and safe user messages.
- Public functions and non-obvious algorithms require documentation.

### Python

- Python version and tooling are defined in `docs/04_TECH_STACK.md`.
- Use type hints.
- Use Pydantic models at external boundaries.
- Use SQLAlchemy repositories behind domain interfaces.
- Use `Decimal` only where decimal semantics matter; use documented floating-point tolerances for scientific computation.
- Use Astropy units/quantities at domain boundaries where unit confusion is plausible.
- Run Ruff, mypy, and pytest.

### TypeScript

- Strict TypeScript is mandatory.
- Avoid `any`; an exception requires an explanatory comment and validation at the boundary.
- Use Server Components by default; use Client Components only for interaction/browser APIs.
- Keep domain calculations out of React.
- Validate untrusted runtime data.
- Run lint, type checks, unit tests, and relevant Playwright tests.

### SQL

- All schema changes use Alembic migrations.
- Migrations must be reversible when realistically possible.
- Add indexes based on measured query needs.
- Never edit an already-applied migration.
- Seed data must be deterministic and idempotent.

## 11. Testing requirements

Before reporting completion, run the checks listed for the affected package in `docs/16_TESTING_QUALITY.md`.

At minimum:

- formatting/lint;
- static type checking;
- unit tests;
- integration tests for changed API/data boundaries;
- accessibility checks for changed UI;
- a production build for frontend changes;
- migration upgrade/downgrade checks for schema changes.

Do not claim tests passed unless they were actually executed. Report skipped checks and why.

## 12. Change workflow

For every non-trivial task:

1. State the requested phase and scope.
2. Inspect relevant docs and code.
3. Identify dependencies and risks.
4. Implement the smallest coherent vertical slice.
5. Add or update tests.
6. Update affected documentation.
7. Run required checks.
8. Review the diff for accidental scope.
9. Report:
   - what changed;
   - what was verified;
   - what remains;
   - any assumptions;
   - exact commands for the next step.

## 13. Prohibited shortcuts

Do not:

- copy the old prototype architecture;
- add OpenAI, Anthropic, Gemini, local LLMs, embeddings, or vector search;
- use fake “AI” labels for deterministic features;
- scrape websites when a documented API or data release exists;
- embed JPL SSD APIs directly in the public website;
- download all Gaia data;
- make the frontend call every upstream provider;
- use the NASA `DEMO_KEY` in production;
- commit API keys;
- fabricate placeholder scientific data;
- use random numbers where a deterministic seed is required;
- create a generic chat interface;
- make 3D mandatory for core navigation;
- add authentication before the roadmap calls for it;
- store a user’s exact location by default;
- add public comments, DMs, follower counts, or feeds;
- claim that a simulation is physically complete;
- add gamification that rewards only clicks or time spent.

## 14. Definition of completion

A feature is complete only when it satisfies `docs/24_DEFINITION_OF_DONE.md`. Visual presence alone is not completion.
