# Production provenance manifests

This directory contains reviewed source and data manifests used by Nova-Lumina's deterministic validation and ingestion boundaries.

- `sources/` describes approved upstream sources/providers.
- `data/` describes exact reviewed dataset/release artifacts and references their source identity.
- `assets/` is reserved for reviewed asset manifests when such assets exist.

Manifests are canonical repository data. Runtime packaging must include required manifests from this canonical source rather than maintaining independent hand-edited copies.

Fictional provider/manifest fixtures belong under `apps/api/tests/fixtures` and must never be selected as production manifests.
