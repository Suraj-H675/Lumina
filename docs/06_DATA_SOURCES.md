# Data Sources and Provider Policy

Last researched: 2026-07-25. Provider contracts, licences, quotas, and schemas can change. Verify official documentation before implementing or modifying an adapter.

## 1. General policy

Lumina never treats an external provider as an undocumented database.

Every adapter must record:

- provider name;
- official documentation URL;
- terms/licence URL;
- attribution text;
- endpoint/base URL;
- authentication method;
- rate/fair-use constraints;
- schema/version;
- cache TTL;
- refresh schedule;
- source observation/publication time;
- fetch time;
- normalized fields;
- error and fallback behaviour;
- fixture/checksum strategy;
- known limitations.

All provider calls are server-side unless explicitly approved.

### Phase 0C3 static source declarations

Phase 0C3 implements a strict immutable `SourceManifest` for the documentary declarations above.
It identifies one source and one adapter version, declares only `lookup` and `batch_fetch`
capabilities, and records normalized output field names. Its endpoint, authentication, fair-use,
cache, refresh, timestamp, failure, fixture, and limitation fields are required documentation, not
runtime configuration. A nullable endpoint supports the networkless fictional test source.

`DataManifest` separately owns one exact `(source_id, dataset_id, release_version)` and must
reference a source in the same validated file set. `AssetManifest` is independent. Phase 0C3 adds
no provider execution policy, records, measurements, units, canonical entities, database storage,
or live source. Runtime timeouts, retries, rate limiting, cache execution, scheduling, status, and
metrics remain Phase 4A.

## 2. Source priority by purpose

### Canonical identity and aliases

1. Curated Lumina identity records
2. SIMBAD cross-identifications for astronomical objects
3. NASA Exoplanet Archive identifiers for exoplanets
4. Gaia source designation for stellar source records
5. Mission/provider-specific identifiers for missions and spacecraft

Identity and measurement are separate. SIMBAD is a heterogeneous compilation, so it is useful for aliases and references but not automatically the final authority for every physical value.

Official:
- https://simbad.cds.unistra.fr/simbad/
- https://simbad.cds.unistra.fr/simbad/sim-tap

### Exoplanets

Primary: NASA Exoplanet Archive TAP.

Use:

- `ps` for individual published solutions;
- `pscomppars` only when composite/best-available values suit the user feature;
- explicit `default_flag=1` or documented selection rule;
- source reference columns where exposed.

Do not:

- infer life;
- collapse unknowns to zero;
- use `potentially_habitable` as a single truth field;
- download all tables on every deployment.

Official:
- https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html
- https://exoplanetarchive.ipac.caltech.edu/docs/API_queries.html

Refresh:
- curated popular systems: weekly;
- discovery counts/current lists: daily or provider-friendly interval;
- individual object refresh: on stale access, rate limited.

### Stars and astrometry

Primary large source: Gaia Archive TAP/TAP+.

Use Gaia for:

- positions;
- parallax;
- proper motion;
- radial velocity where available;
- photometry;
- selected astrophysical parameters;
- provenance and release metadata.

Do not mirror the full catalog. Query targeted objects, cones, or curated samples.

Official:
- https://gea.esac.esa.int/archive/
- https://gea.esac.esa.int/archive/documentation/GDR3/

The adapter must pin the data release/table names. Never silently change from DR3 to a future release.

### Solar System ephemerides

Runtime primary:

- Skyfield;
- a locally cached, documented JPL Development Ephemeris kernel;
- Astropy where suitable.

JPL Horizons:

- validation;
- controlled backend/admin requests;
- special objects not available in local baseline when provider terms allow.

Do not embed SSD APIs directly in the website. JPL SSD fair-use documentation says requests should be serialized and APIs may not be embedded in a website under its CORS policy.

Official:
- https://ssd-api.jpl.nasa.gov/doc/horizons.html
- https://ssd-api.jpl.nasa.gov/doc/index.php

Kernel manifest must store:

- filename;
- source URL;
- checksum;
- time coverage;
- download date;
- licence/usage note;
- algorithm version.

### Satellites

Primary: CelesTrak current GP data in OMM JSON or another documented machine format.

Use curated groups:

- space stations;
- brightest;
- active scientific satellites;
- user-saved catalog numbers.

Store element epoch and warn when predictions use stale elements.

Propagation uses SGP4 locally.

Official:
- https://celestrak.org/NORAD/elements/

Refresh:
- selected active groups: every 4–8 hours, provider-friendly;
- pass predictions are recomputed locally.

Do not promise optical magnitude unless a validated brightness model and source are present.

### Space weather

Primary: NOAA Space Weather Prediction Center machine-readable JSON.

Useful products include:

- alerts;
- NOAA scales;
- planetary K index and forecast;
- solar wind;
- aurora data;
- solar regions;
- flare/event records.

Official:
- https://services.swpc.noaa.gov/products/
- https://services.swpc.noaa.gov/json/

Refresh intervals depend on product, normally 1–15 minutes for live displays. Use cached server polling, never one request per browser.

### NASA daily/media/near-Earth data

NASA APIs may support:

- APOD;
- NeoWs/near-Earth data;
- selected public datasets.

NASA Image and Video Library supports media search.

Rules:

- use a registered free API key for deployed server use;
- never use `DEMO_KEY` in production;
- cache;
- comply with media usage guidelines;
- retain item-specific credits;
- do not assume all NASA-hosted media is unrestricted.

Official:
- https://api.nasa.gov/
- https://images.nasa.gov/

### Launch and event aggregation

Candidate: Launch Library 2 by The Space Devs.

Status: optional provider, not a scientific authority. Use server-side cache, timestamps, and provider attribution. Prefer official agency/mission links for critical details where available.

The adapter must tolerate:

- delays;
- schedule changes;
- null fields;
- duplicate/merged records;
- provider outage.

Official:
- https://ll.thespacedevs.com/

No launch time is displayed without time precision/status. Distinguish exact, window, tentative, and TBD.

### Plate solving

Primary options:

1. Self-hosted Astrometry.net solver
2. Remote Nova Astrometry.net API with server API key and explicit privacy consent

Remote submission defaults:

- `publicly_visible=n`;
- restrictive modification/commercial settings consistent with user choice;
- strip unnecessary EXIF;
- delete temporary files after retention period.

Official:
- https://astrometry.net/doc/net/api.html
- https://astrometry.net/doc/nova.html

The remote service requires an API key/session and asynchronous polling. Implement state machine; do not block a web request.

### Sky/deep-space rendering

WorldWide Telescope WebGL engine is an approved renderer.

It is a rendering dependency, not the canonical truth source. Layer/image credits still apply.

Official:
- https://docs.worldwidetelescope.org/webgl-reference/latest/

### Weather

Weather is optional and must not block astronomical calculations.

A provider can be approved later after licence/quota review. Until then:

- allow manual observing-condition input;
- separate astronomical visibility from weather visibility;
- label “astronomically well placed” versus “weather permitting.”

### Light pollution

Baseline:

- user-selected Bortle class;
- optional locally stored approximate map layer only after dataset/licence review.

Do not fabricate Bortle class from city population.

### Learning references

Use authoritative sources for editorial research, including NASA, ESA, observatories, peer-reviewed/educational institutions, and suitable textbooks.

Do not copy text unless the licence and attribution permit it. OpenStax Astronomy 2e is CC BY-NC-SA; using adapted content may impose non-commercial/share-alike requirements. Lumina should generally write original content and cite references instead of copying.

## 3. Source record model

Every ingested provider row creates or updates a source record:

```text
source_record
- id
- provider_id
- dataset_id
- provider_record_id
- provider_version
- canonical_entity_id nullable
- source_url/reference
- published_at nullable
- observed_at nullable
- fetched_at
- raw_checksum
- raw_payload JSONB only when allowed
- parser_version
- status
```

## 4. Measurement model

Measurements are immutable facts about a source publication/record. A new source value creates a new measurement or source version.

Required:

- quantity code;
- value;
- unit;
- lower/upper uncertainty;
- confidence/quality flags;
- method;
- source record;
- valid/observed epoch;
- original field/value;
- normalization version.

## 5. Canonical value selection

A canonical display value is derived, not destructive.

Selection rule examples:

- explicit archive default solution;
- highest-quality valid measurement;
- newest accepted source;
- curated editorial override with reason;
- weighted combination only when scientifically justified and documented.

Store:

- selected measurement IDs;
- rule ID/version;
- generated time;
- explanation.

## 6. Provider outage behaviour

- Never substitute sample data.
- Return cached data with `is_stale=true` when acceptable.
- Show provider unavailable when no safe cache exists.
- Retry in worker with bounded backoff.
- Expose provider health only in aggregate; do not leak secrets.
- Keep core curated content operational.

## 7. Data freshness classes

- Static authored content: versioned by Git commit/content version
- Slowly changing catalogs: weekly/monthly
- Exoplanet discoveries: daily
- Missions/launches: minutes to hours near event
- Satellite elements: hours
- Space weather: minutes
- APOD: daily
- User image job: live polling/event update

Each endpoint uses explicit timestamps rather than words such as “live” without evidence.

## 8. Attribution

Every provider-backed view must be able to open a source drawer containing:

- source/provider;
- dataset/release;
- record/reference;
- last fetch;
- data date;
- licence/usage note;
- citation text where required;
- link to official source.

Media credit must be visible near the media or in an immediately accessible credit control.
