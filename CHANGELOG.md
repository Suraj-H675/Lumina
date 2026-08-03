# Changelog

All notable changes will be documented here once implementation begins.

The format follows Keep a Changelog principles and semantic versioning where practical.

## [Unreleased]

### Added

- Repository planning and specification documents for the clean Lumina rebuild.
- Phase 0A pnpm and uv workspaces, strict TypeScript and Python quality foundations, bootstrap
  scripts, and lockfile-driven local setup.
- Phase 0C4 deterministic GitHub Actions acceptance workflow, contribution templates,
  candidate-aware documentation validation, immutable migration validation, and pinned
  dependency/secret scanners.

### Changed

- Recorded that Lumina currently has no project licence and remains all-rights-reserved by
  default while preserving third-party licensing and attribution requirements.

### Deprecated

### Removed

### Fixed

### Security

- Remediated the three verified transitive dependency edges with parent-qualified pnpm workspace
  overrides and a deterministic frozen lockfile graph; package manifests remain unchanged.
- Added mandatory full-history and current-candidate TruffleHog scans with verification disabled,
  plus lockfile-only OSV scanning with fixed safe output and private temporary artifacts.
