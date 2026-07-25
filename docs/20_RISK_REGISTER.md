# Risk Register

Risks are reviewed at every phase gate.

## R-001 — Scope collapse

**Risk:** The full vision is too broad and produces many incomplete screens.
**Probability:** High
**Impact:** Critical
**Mitigation:** Mandatory phased vertical slices; no future placeholders; phase gates; one simulation/provider at a time.

## R-002 — Scientific misinformation

**Risk:** Wrong units, stale values, conflicting catalogs, or misleading models.
**Mitigation:** Provenance model, measurement history, algorithm versions, validation fixtures, source drawer, review states.

## R-003 — Provider instability

**Risk:** APIs change, rate limit, or disappear.
**Mitigation:** Adapters, fixtures, caching, status, disable flags, last-good data, no browser-direct dependency.

## R-004 — “Free” provider limits

**Risk:** Public usage exceeds quotas or hosting free tiers.
**Mitigation:** caching, scheduled sync, local calculations, optional heavy features, portable deployment, no per-user upstream calls.

## R-005 — Plate-solving resource cost

**Risk:** CPU/storage/queue abuse.
**Mitigation:** optional service, strict limits, duplicate hashes, private retention, queue caps, rate limits, self-host mode.

## R-006 — Privacy of minors/location

**Risk:** Exact locations, uploads, and journals expose users.
**Mitigation:** local-first, no account, no social network, no coordinate logs, explicit consent, export warning, private uploads.

## R-007 — WebGL performance

**Risk:** Low-end devices fail or battery use is excessive.
**Mitigation:** lazy load, DPR cap, pause offscreen, 2D fallback, no decorative continuous animation, performance tests.

## R-008 — Content workload

**Risk:** Authored modes and review are labor intensive.
**Mitigation:** publish fewer complete lessons; reusable concept blocks; content schemas; no generated shortcuts.

## R-009 — Licence violations

**Risk:** Images/data/content are copied without compatible rights.
**Mitigation:** asset manifest, required credit/licence fields, CI validation, no unreviewed asset commit.

## R-010 — Catalog identity conflicts

**Risk:** Aliases identify multiple objects or source records merge incorrectly.
**Mitigation:** canonical UUID, provider IDs, ambiguous-match workflow, manual review queue, no automatic destructive merge.

## R-011 — Time/coordinate errors

**Risk:** DST, frames, epochs, proper motion, longitude conventions.
**Mitigation:** Astropy quantities/time, explicit conventions, edge tests, independent validation.

## R-012 — Satellite prediction inaccuracy

**Risk:** Stale TLE/OMM gives wrong pass.
**Mitigation:** element age visible, refresh schedule, warning thresholds, no guarantee language.

## R-013 — Launch-time misinformation

**Risk:** tentative times displayed as confirmed.
**Mitigation:** precision/status model, source timestamp, no countdown for TBD/window-only without correct representation.

## R-014 — Fake habitability claims

**Risk:** simplistic score misleads users.
**Mitigation:** no percentage; show contributing measured/estimated parameters and missing data.

## R-015 — Architecture overengineering

**Risk:** abstractions delay product.
**Mitigation:** modular monolith, no microservices, implement interfaces only at actual boundaries.

## R-016 — Hidden test fixtures

**Risk:** demo data appears as live science.
**Mitigation:** fixture package never imported by production; CI import check; visible environment banner for fixture mode.

## R-017 — Upstream schema drift

**Risk:** parser silently maps incorrect fields.
**Mitigation:** strict validation, schema/version detection, quarantine, last-good cache, contract fixtures.

## R-018 — News/editorial accuracy

**Risk:** automated feed spreads premature claims.
**Mitigation:** no auto-publish; reviewed structured entries; event/publication dates separated.

## R-019 — Offline stale confusion

**Risk:** cached live data looks current.
**Mitigation:** freshness badge, offline state, timestamp, no “live” label without active freshness.

## R-020 — Local data loss

**Risk:** browser clears IndexedDB.
**Mitigation:** export/import, reminders, schema migration tests, clear explanation that local data needs backup.

## R-021 — Child-inappropriate external links

**Risk:** citizen-science/media links leave controlled environment.
**Mitigation:** curated allowlist, external notice, link review date, no embedded third-party tracking by default.

## R-022 — Scientific simulation overclaim

**Risk:** simplified model appears professional/complete.
**Mitigation:** model/limitations visible, valid range, reference tests, educational-use notice.

## R-023 — Security vulnerabilities in image libraries

**Risk:** malicious files exploit parsers.
**Mitigation:** patching, sandbox, limits, content checks, separate process/container, security scans.

## R-024 — Repository documentation divergence

**Risk:** code changes without specs.
**Mitigation:** PR checklist, doc-owner field, phase gate, generated contract checks, decision records.

## Risk review format

For each release:

- new risks;
- changed probability/impact;
- incidents/near misses;
- mitigation status;
- accepted residual risk;
- owner.
