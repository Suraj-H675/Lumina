# AGENTS.md

Instructions for automated contributors working in this repository.

## Authority and reasoning

1. Follow the user's latest explicit instruction.
2. Use the current tracked documentation as context, not immutable law.
3. Treat existing code, tests, architecture, comments, and prior decisions as evidence rather than proof that the current design is correct.
4. When an important fact can change or is uncertain, verify it from the repository or an authoritative current source before acting.
5. Do not invent requirements, APIs, scientific facts, test results, deployment outcomes, or accessibility evidence.

If the best decision remains genuinely ambiguous after investigation, surface the exact uncertainty instead of silently choosing a convenient assumption.

## Product direction

Lumina is a public astronomy learning and exploration platform. Its current implementation combines reviewed scientific data, deterministic calculations, visual exploration, observation planning, learning, live-data surfaces, simulations, offline behaviour, and personal tools.

The following are current constraints, not sacred architecture:

- Lumina is free to use.
- Required core functionality must not depend on a paid API or paid SDK.
- The current infrastructure budget is zero unless the user changes it.
- Scientific results must remain explainable and source/model bounded.
- There is no current required LLM dependency. Adding one requires a concrete product benefit, scientific/safety analysis, privacy analysis, and zero-cost feasibility review.
- Browser-local persistence is an implementation option, not a mandatory product invariant.
- Accounts/cloud persistence are neither required nor forbidden; choose them only if they improve the product enough to justify the complexity.
- Accessibility without animation or 3D remains a product requirement.

## Engineering rules

- Prefer simple, explicit boundaries over speculative frameworks.
- Keep the modular-monolith structure unless evidence shows a different boundary is better.
- Do not add a service, dependency, abstraction, cache, queue, database, or build layer without a demonstrated need.
- Do not preserve compatibility with dead/internal behaviour unless a real consumer requires it.
- Remove obsolete scaffolding and duplicated sources of truth when a safe migration path exists.
- Keep generated artifacts generated; do not hand-edit generated OpenAPI outputs.
- Never rewrite applied migration history. Add a new migration when the database contract changes.
- Keep secrets, exact private locations, uploaded private content, and private user text out of logs and public artifacts.
- Do not expose provider credentials to browser code.

## Scientific and data rules

- Preserve provenance for externally sourced scientific values and media.
- Distinguish measurements, estimates, models, approximations, hypotheses, and unknowns.
- Prefer authoritative primary sources and versioned releases where available.
- Do not silently replace conflicting source values with a fabricated "best" value.
- Keep provider failures explicit and degrade safely when upstream data is stale or unavailable.

## Accessibility and quality

- Keyboard access, focus behaviour, screen-reader semantics, reduced motion, zoom/reflow, contrast, touch use, and non-WebGL fallbacks are functional requirements.
- Automation supports accessibility review but does not prove WCAG compliance or screen-reader usability.
- Never mark manual/device evidence complete without a real observation.
- Performance claims require measured evidence on the stated environment.

## Repository workflow

Before changing code:

1. inspect the current worktree and relevant tests;
2. understand the owning module and data contract;
3. reproduce a defect or establish a concrete maintenance problem;
4. make the smallest coherent improvement;
5. add or update regression coverage;
6. run focused checks before broader gates.

For commits:

- group related changes coherently;
- stage explicit paths rather than `git add -A`;
- do not rewrite shared history or force-push;
- do not commit private environment files, caches, build output, downloaded private data, or secrets;
- do not claim hosted CI success until the exact pushed SHA has completed successfully.

## Documentation

Documentation is version-controlled project material. Update it when behaviour, architecture, setup, data ownership, or quality status changes. Historical implementation diaries are not a substitute for current documentation.
