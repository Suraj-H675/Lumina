# Canonical Data Model

This is the conceptual schema. SQL migrations are authoritative once implemented, but must preserve these semantics.

## 1. Shared conventions

- Canonical IDs: UUID
- Public slugs: unique lowercase kebab-case
- Time: UTC `timestamptz`
- Coordinates: ICRS degrees unless a field explicitly declares another frame
- Units: documented canonical unit plus original measurement unit
- Soft delete only where recovery/audit is required
- Provider records are never used as canonical primary keys
- Unknown values are `NULL`, never `0`, empty string, or false

## 2. Core identity

### `entity`

- `id UUID PK`
- `entity_type enum`
- `canonical_name text`
- `slug text unique`
- `short_description text`
- `status enum(active, historical, proposed, disputed, retired)`
- `visibility enum(public, internal)`
- `created_at`
- `updated_at`

Entity types:

- star
- planet
- dwarf_planet
- moon
- asteroid
- comet
- exoplanet
- galaxy
- nebula
- cluster
- black_hole
- compact_object
- system
- constellation
- mission
- spacecraft
- launch_vehicle
- observatory
- person
- concept
- event

### `entity_alias`

- `id`
- `entity_id`
- `alias`
- `normalized_alias`
- `alias_type`
- `catalog_name nullable`
- `language nullable`
- `is_preferred`
- `source_record_id nullable`

Unique index: normalized alias + entity.

### `entity_relationship`

- `id`
- `from_entity_id`
- `relationship_type`
- `to_entity_id`
- `valid_from/to nullable`
- `source_record_id nullable`
- `confidence nullable`
- `metadata JSONB`

Examples: orbits, host_star, member_of, destination_of, discovered_by, related_concept.

## 3. Astronomical coordinates

### `celestial_position`

- `id`
- `entity_id`
- `ra_deg`
- `dec_deg`
- `frame` default ICRS
- `epoch`
- `proper_motion_ra_mas_per_year nullable`
- `proper_motion_dec_mas_per_year nullable`
- `parallax_mas nullable`
- `radial_velocity_km_s nullable`
- `healpix_order`
- `healpix_cell`
- `source_record_id`
- `valid_at/observed_at nullable`
- uncertainty fields

An entity can have multiple positions from different sources/epochs. A canonical-position projection points to selected measurements.

## 4. Measurements and provenance

### `provider`

- `id`
- `code unique`
- `name`
- `documentation_url`
- `terms_url`
- `attribution_text`
- `enabled`
- `configuration JSONB non-secret`

### `dataset`

- `id`
- `provider_id`
- `code`
- `name`
- `release_version`
- `source_url`
- `licence`
- `citation`
- `valid_from/to`
- `metadata`

### `source_record`

As defined in data-source specification.

### `measurement`

- `id`
- `entity_id`
- `quantity_code`
- `value_numeric nullable`
- `value_text nullable`
- `unit nullable`
- `uncertainty_lower nullable`
- `uncertainty_upper nullable`
- `quality_code nullable`
- `method nullable`
- `observed_at/epoch nullable`
- `source_record_id`
- `original_field`
- `original_value JSONB`
- `normalization_version`
- `created_at`

Constraint: exactly one of numeric/text appropriate to quantity.

### `canonical_measurement`

- `entity_id`
- `quantity_code`
- `measurement_id nullable`
- `selection_rule`
- `selection_version`
- `explanation`
- `computed_at`

## 5. Type-specific tables

### `star`

- `entity_id PK/FK`
- `spectral_type`
- `luminosity_class`
- canonical temperature, mass, radius, luminosity references
- variability type
- evolutionary_stage
- binary/multiple flag
- Gaia source reference nullable

### `solar_system_body`

- `entity_id`
- `body_class`
- `naif_id nullable`
- `parent_entity_id nullable`
- `mean_radius_km`
- `mass_kg`
- `surface_gravity_m_s2`
- `rotation_period_hours`
- `orbital_period_days`
- atmosphere summary/reference
- albedo
- discovery fields

### `exoplanet`

- `entity_id`
- `host_star_entity_id`
- `archive_planet_name`
- `confirmation_status`
- `discovery_method`
- `discovery_year`
- `discovery_facility`
- `orbital_period_days`
- `semi_major_axis_au`
- `eccentricity`
- `radius_earth`
- `mass_earth`
- `equilibrium_temperature_k`
- `insolation_earth`
- `transit_flag`
- selection provenance for each displayed field

Do not store “habitable=true” as canonical science.

### `deep_sky_object`

- `entity_id`
- `object_class`
- `constellation_entity_id`
- `distance_pc nullable`
- `apparent_magnitude nullable`
- `angular_major_arcmin nullable`
- `angular_minor_arcmin nullable`
- `position_angle_deg nullable`
- `surface_brightness nullable`

### `mission`

- `entity_id`
- `mission_type`
- `status`
- `lead_agency_entity_id`
- `start_date`
- `end_date nullable`
- `official_url`
- `objective_summary`
- `current_status_summary`
- `status_updated_at`

### `spacecraft`

- `entity_id`
- `operator_entity_id`
- `mission_entity_id nullable`
- `launch_mass_kg nullable`
- `dry_mass_kg nullable`
- `power_w nullable`
- `status`
- `international_designator nullable`
- `norad_catalog_number nullable`

### `launch_event`

- `id`
- `mission_entity_id nullable`
- `vehicle_entity_id nullable`
- `name`
- `window_start/end nullable`
- `precision/status`
- `launch_site_entity_id nullable`
- `provider/source`
- `last_updated_at`

## 6. Content

### `content_item`

Metadata index for version-controlled files:

- `id`
- `content_type`
- `slug`
- `title`
- `version`
- `language`
- `status`
- `source_path`
- `checksum`
- `reviewed_by`
- `reviewed_at`
- `published_at`
- `updated_at`

Types: concept, lesson, path, quiz, myth, story, activity, discovery.

### `content_entity_link`

Links content to catalog entities/concepts with relation type and display order.

## 7. Media

### `media_asset`

- `id`
- `entity_id nullable`
- `media_type`
- `title`
- `description`
- `source_url`
- `download_url nullable`
- `credit`
- `licence`
- `usage_notes`
- `is_artist_concept`
- `wavelength nullable`
- `captured_at nullable`
- `width/height nullable`
- `checksum nullable`
- `local_path nullable`
- `cache_allowed`
- `review_status`

## 8. Provider cache

### `provider_cache`

- `provider_id`
- `cache_key`
- `response_status`
- `payload/checksum according to policy`
- `fetched_at`
- `expires_at`
- `etag`
- `last_modified`
- `schema_version`
- `error_count`

Unique: provider + cache key.

## 9. Jobs

### `job`

- `id UUID`
- `job_type`
- `status`
- `idempotency_key unique nullable`
- `priority`
- `payload JSONB`
- `result JSONB nullable`
- `progress 0..1`
- `attempts`
- `max_attempts`
- `available_at`
- `claimed_at`
- `heartbeat_at`
- `completed_at`
- `error_code/message nullable`
- `created_at`

Job payload/result may not contain secrets.

## 10. Identification

### `identification_submission`

- `id`
- `job_id`
- `storage_object_key`
- `original_filename sanitized`
- `mime_type`
- `byte_size`
- `width/height nullable`
- `sha256`
- `solver_type`
- `external_submission_id nullable`
- `external_job_id nullable`
- `retention_until`
- `deleted_at nullable`
- `consent_remote_processing`

### `plate_solution`

- `submission_id`
- `center_ra_deg`
- `center_dec_deg`
- `pixel_scale_arcsec`
- `orientation_deg`
- `radius_deg`
- `parity`
- `wcs_storage_key nullable`
- `solver_version`
- `solved_at`
- `quality_metadata`

### `plate_annotation`

- `solution_id`
- `entity_id nullable`
- `provider_name`
- `provider_object_name`
- `pixel_x`
- `pixel_y`
- `annotation_type`
- `radius nullable`

## 11. Local-first browser schema

IndexedDB stores:

- settings;
- presentation preferences;
- interests;
- locations;
- equipment profiles;
- collections;
- saved entities;
- progress;
- quiz attempts;
- observation plans;
- journal entries;
- local image references where supported;
- dashboard configuration.

Every record includes:

- local UUID;
- schema version;
- created/updated timestamps;
- optional entity IDs;
- import provenance.

Export:

```json
{
  "format": "lumina-personal-data",
  "schema_version": 1,
  "exported_at": "...",
  "sections": {},
  "checksums": {}
}
```

Import validates schema and reports conflicts. Never silently overwrite newer local records.

## 12. Search representation

A materialized/search table may include:

- entity ID;
- canonical/alias normalized text;
- type;
- short description;
- tags;
- catalog identifiers;
- popularity/editorial rank;
- visibility;
- searchable document vector for PostgreSQL full-text only.

No embedding/vector representation.
