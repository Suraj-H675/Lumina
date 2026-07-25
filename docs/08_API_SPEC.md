# API Specification

## 1. General

Base: `/api/v1`

Content type: `application/json`

All timestamps: ISO 8601 UTC. User time-zone presentation belongs in the client unless an endpoint explicitly returns localized values.

Values with variable units use:

```json
{
  "value": 42.0,
  "unit": "ly",
  "uncertainty": {
    "lower": 1.0,
    "upper": 2.0
  }
}
```

## 2. Success envelope

Single resources may be direct typed resources. Aggregated/live responses use:

```json
{
  "data": {},
  "meta": {
    "request_id": "uuid",
    "generated_at": "timestamp",
    "source_freshness": [],
    "warnings": []
  }
}
```

Do not wrap every simple object unnecessarily if OpenAPI remains clear.

## 3. Error envelope

```json
{
  "error": {
    "code": "catalog.entity_not_found",
    "message": "No matching object was found.",
    "details": {},
    "request_id": "uuid"
  }
}
```

Rules:

- stable machine code;
- safe user-facing message;
- structured validation details;
- no stack trace;
- no provider secret;
- appropriate HTTP status.

Phase 0B1 normalizes framework validation, HTTP, and unexpected server failures through this
envelope. `details` is always an object. Validation details contain only safe field-location
categories and stable validation codes; raw input, Pydantic context, documentation URLs,
exception text, and reflected request values are never returned.

Common codes:

- `request.validation_failed`
- `request.rate_limited`
- `catalog.entity_not_found`
- `catalog.ambiguous_identifier`
- `provider.unavailable`
- `provider.stale_data`
- `astronomy.outside_supported_range`
- `astronomy.invalid_location`
- `job.not_found`
- `job.failed`
- `upload.invalid_type`
- `upload.too_large`
- `identification.unsolved`
- `feature.not_available`

## 4. Pagination

Cursor response:

```json
{
  "items": [],
  "page": {
    "next_cursor": null,
    "has_more": false,
    "limit": 20
  }
}
```

Cursor is opaque. Maximum limits are endpoint-specific.

## 5. Health

### `GET /health/live`

Process is running. No dependency checks.

### `GET /health/ready`

Checks required dependencies. Returns non-200 when not ready.

Phase 0B2 probes PostgreSQL with a bounded parameter-free `SELECT 1`. It returns exactly
`{"status":"ready"}` with HTTP 200 or the standard safe `database.unavailable` envelope with
HTTP 503; neither response exposes database connection details.

### `GET /api/v1/meta`

Phase 0B1 returns exactly:

```json
{
  "application_name": "Lumina",
  "application_version": "installed package version",
  "api_version": "v1",
  "feature_flags": {},
  "build_commit": null
}
```

`application_version` comes from installed `lumina-api` package metadata. `build_commit` is null
unless a validated `LUMINA_BUILD_COMMIT` is configured. The response never exposes environment,
host, process, dependency, path, or infrastructure details.

### `GET /status/providers`

Public safe aggregate status, freshness, and last successful sync. No internal URLs/secrets.

## 6. Catalog

### `GET /catalog/entities/{id-or-slug}`

Returns common entity, type-specific data, canonical measurements, related entities, media, and source summary.

Query:

- `include=relationships,media,sources`
- `mode=explorer|student|deep-dive`

Mode changes content payload selection, not scientific values.

### `GET /catalog/entities`

Filters:

- `type`
- `constellation`
- `distance_min/max`
- domain-specific approved fields
- `cursor`
- `limit`
- `sort`

### `GET /catalog/entities/{id}/measurements`

Deep-dive measurement list with source records.

### `GET /catalog/entities/{id}/relationships`

### `GET /catalog/entities/{id}/media`

## 7. Search

### `GET /search?q=...`

Parameters:

- `q`
- `types`
- `limit`
- `cursor`
- optional structured filters

Response item:

- entity/content ID;
- result type;
- title;
- slug;
- snippet;
- match type;
- matched alias/field;
- confidence/rank category, not a fake scientific probability;
- image credit summary.

### `GET /search/suggest?q=...`

Small prefix/alias suggestions; aggressively cached; no expensive remote providers.

## 8. Compare

### `POST /compare`

Request:

```json
{
  "entity_ids": ["uuid", "uuid"],
  "quantity_codes": ["radius", "mass", "temperature"]
}
```

Response includes compatible values, normalized units, missing reasons, source summaries, and comparison ratios with safe handling of zero/unknown.

## 9. Observe

### `POST /observe/tonight`

Request:

```json
{
  "location": {
    "latitude_deg": 12.9716,
    "longitude_deg": 77.5946,
    "elevation_m": 920
  },
  "time_zone": "Asia/Kolkata",
  "date": "2026-07-25",
  "equipment_profile": {
    "type": "naked_eye"
  },
  "preferences": {
    "minimum_altitude_deg": 20,
    "minimum_moon_separation_deg": 30,
    "categories": ["planet", "star", "deep_sky"]
  }
}
```

Response:

- twilight;
- Moon;
- candidates;
- scoring breakdown;
- best windows;
- warnings;
- ephemeris and algorithm versions.

### `POST /observe/entity/{entityId}`

Time series and rise/transit/set for one entity.

### `POST /observe/altaz`

Batch coordinate transformation with strict maximum batch size.

### `POST /observe/plan`

Creates a deterministic proposed schedule. Does not persist by default.

### `GET /observe/events`

Astronomical event list for date/location where applicable.

## 10. Missions and live data

### `GET /missions`
### `GET /missions/{id-or-slug}`
### `GET /now/launches`
### `GET /now/space-weather`
### `GET /now/near-earth`
### `GET /now/satellites`
### `POST /now/satellites/passes`

Every live response includes provider/freshness metadata and precision/status.

## 11. Content and learning

### `GET /content/concepts/{slug}`
### `GET /learning/paths`
### `GET /learning/paths/{slug}`
### `GET /learning/lessons/{slug}`
### `GET /learning/quizzes/{id}`

Correct answers may be returned only when the client needs local evaluation and the content model accepts that exposure. Otherwise use a deterministic evaluation endpoint.

### `POST /learning/quizzes/{id}/evaluate`

No server-side user profile required. Returns authored feedback and correctness.

## 12. Simulations

Most simulations run client-side. Backend endpoints are allowed for:

- authoritative initial constants;
- validated presets;
- heavy batch computations;
- export/verification.

### `GET /simulations`
### `GET /simulations/{slug}/definition`
### `POST /simulations/{slug}/compute`

Each response includes model and version.

## 13. Identification

### `POST /identification/submissions`

Multipart upload.

Required:

- file;
- remote-processing consent when remote solver is configured;
- optional approximate scale/coordinates.

Returns `202 Accepted` with job ID.

### `GET /identification/submissions/{id}`

Status and progress.

### `GET /identification/submissions/{id}/solution`

Returns WCS/annotations after success.

### `DELETE /identification/submissions/{id}`

Deletes stored user data and requests best-effort upstream deletion where supported. Explain limitations.

## 14. Sources

### `GET /sources/{sourceRecordId}`
### `GET /sources/providers`
### `GET /sources/datasets`

These power the source drawer and public attribution.

## 15. CORS, security, and rate limits

- CORS origins are environment-configured.
- No wildcard with credentials.
- Read endpoints use sensible IP/session limits.
- Upload/job endpoints use stricter limits.
- Provider quota protection is independent from user API limiting.
- OpenAPI docs are enabled in development and configurable in production.

Phase 0B1 permits no cross-origin browser origin by default. Configured origins are exact
HTTP/HTTPS origins, credentials remain disabled, allowed methods are currently `GET`, and
`X-Request-ID` is an allowed and exposed header. API documentation defaults on in development and
test and off in staging and production; an explicit strict Boolean override controls `/docs`,
`/redoc`, and `/openapi.json` together. When enabled, only `/docs` and `/redoc` receive the
route-local CSP allowances needed by FastAPI's generated development documentation HTML;
`/openapi.json` and every API/error response keep the strict API CSP.

## 16. API compatibility

- Breaking changes require `/api/v2` or an explicit migration plan.
- Additive fields are allowed.
- Enum expansion must be handled defensively by generated clients.
- Deprecations include headers and documentation.
- Provider schema changes do not automatically alter public contracts.
