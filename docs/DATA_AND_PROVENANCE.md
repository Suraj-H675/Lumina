# Data and provenance

## Principle

Nova-Lumina should be able to explain where externally sourced scientific information came from, what transformation was applied, and what limitations remain.

## Repository data areas

- `data/manifests/` — source/release provenance contracts.
- `data/seed/` — reviewed deterministic input/output artifacts used by scientific/catalogue features.
- `data/reviews/` — explicit review evidence tied to data products.
- `data/sky/` — immutable metadata describing browser-delivered sky-context products.
- `apps/web/public/data/` — immutable data that must be fetched directly by the browser at runtime.

## Source-of-truth rule

There should be one canonical reviewed source for each artifact. If a distribution format needs a packaged copy, that copy must be generated/included from the canonical source rather than maintained independently.

## Scientific claims

For important externally sourced values, preserve as applicable:

- source/provider identity;
- release or dataset version;
- source record/identifier;
- retrieval/access date;
- units and coordinate/reference frame;
- uncertainty or validity bounds;
- transformation/model version;
- licence/attribution requirements.

Do not silently collapse conflicting measurements into a fabricated authoritative value.

## Provider data

Live providers should be treated as unreliable network dependencies. Validate payloads, bound response size/time, record freshness, cache only reviewed normalized forms, and expose stale/unavailable state honestly.

Routine CI must use deterministic fixtures/artifacts rather than relying on live provider availability.

## Generated data

Generated scientific or API artifacts require deterministic generation/validation and should fail CI if the committed artifact drifts from its generator or declared evidence.
