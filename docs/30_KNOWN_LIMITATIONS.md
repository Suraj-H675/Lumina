# Known Limitations

This document starts with planned limitations and must be updated as implementation progresses.

## Repository foundation

- Phase 0A provides workspace and toolchain foundations only; it has no running web, API,
  database, or worker service.
- Phase 0C2 `/status` is a dynamic, point-in-time foundation check of the committed API's liveness,
  database readiness, and safe metadata. It does not poll, retain history, monitor providers, or
  claim that the catalog or scientific services are operational.
- No catalog or product data exists in the web application, and no live provider functionality is
  available.
- Lumina currently has no project licence and is all-rights-reserved by default. Licensing must
  be reconsidered before accepting outside contributions or declaring the project open source.

## Product scope

- Lumina is an educational/exploration platform, not a professional observatory, navigation, launch-control, hazard-warning, or mission-planning system.
- The full feature inventory is multi-release.
- A route is not created until its phase.

## Science/data

- Curated catalog is intentionally much smaller than full professional archives.
- External values can differ across sources.
- Canonical selection does not erase alternatives.
- Data freshness varies by provider.
- Some objects lack measured mass, radius, distance, atmosphere, or imagery.
- Artist concepts are not observations.
- Habitable-zone placement does not establish habitability or life.

## Observation

- Visibility calculations do not guarantee weather, local horizon, eyesight, equipment quality, or observing skill.
- Bortle/manual conditions are approximate.
- Telescope-view simulation is illustrative.
- Device orientation sensors can be inaccurate.
- Satellite predictions degrade with element age.
- Rise/set/refraction policy has documented model limits.

## Simulations

- Models are simplified and have valid ranges.
- Rocket designer is not an engineering tool.
- Impact effects are approximate.
- Stellar evolution may use broad model relations/presets.
- Black-hole/relativity visuals are representations, not direct observations.
- Cosmic Zoom is curated scale storytelling, not a complete spatial model.

## Identification

- Plate solving requires sufficient detectable star patterns.
- Blurry, saturated, cloudy, narrow, or feature-poor images may remain unsolved.
- It does not identify arbitrary bright dots.
- Remote solving sends the image to an external service after consent.
- Self-hosted solving requires large index files and compute.
- Quality checks are proxies, not universal photography advice.

## Live data

- Launch times change.
- Aggregators may lag official announcements.
- Space-weather data is informational.
- Near-Earth approach displays should not be treated as emergency alerts.
- Provider outages may show stale data.
- No auto-published news/discovery feed.

## Privacy/local data

- Browser storage may be cleared by the user/browser/OS.
- Users should export backups.
- No cloud sync baseline.
- Deleting a local reference may not delete a separately exported file.
- Remote-provider deletion may be best effort only.

## Hosting

- Core software and sources are free/open as documented.
- Unlimited hosting, bandwidth, storage, and plate-solving compute cannot be guaranteed at zero cost.
- Optional heavy features may be disabled on constrained deployments.

## Phase 0B3C4 worker

- The production registry contains only the internal deterministic `system.noop` handler.
- One worker process executes one job at a time; concurrent job execution is intentionally absent.
- Handlers are static; there is no dynamic loading, plugin discovery, Redis queue, internal
  scheduler, or process supervisor.
- Compose still contains only PostgreSQL. Operators start and supervise `lumina-worker`
  separately.
- Startup compatibility is intentionally exact for the accepted 0001 catalog and 0002 effective
  privileges; incompatible schema or ACL drift fails startup.
