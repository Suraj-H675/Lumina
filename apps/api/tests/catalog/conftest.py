"""Shared fictional manifest factories for catalogue ingestion tests."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from lumina.provenance.domain.manifests import DataManifest, SourceManifest


@pytest.fixture
def source_manifest() -> SourceManifest:
    """Return one complete fictional reviewed source declaration."""
    return SourceManifest(
        manifest_type="source",
        manifest_schema_version=1,
        source_id="fixture.catalog-source",
        source_name="Fixture Catalogue Source",
        adapter_id="fixture.catalog-adapter",
        adapter_version="fixture-adapter-v1",
        purpose="Fictional catalogue ingestion tests.",
        official_documentation_url="https://fixtures.invalid/catalog/docs",
        terms_or_licence_url="https://fixtures.invalid/catalog/terms",
        attribution_text="Fictional fixture attribution.",
        endpoint_or_base_url=None,
        authentication_method="No authentication for fictional fixtures.",
        contact_or_user_agent_requirement=None,
        rate_or_fair_use_constraints="Fictional fixture-only use.",
        source_schema_version="fixture-source-schema-v1",
        cache_ttl="Not applicable to fixtures.",
        refresh_schedule="Manual fixture execution only.",
        observation_or_publication_time_policy=(
            "Fixture values have no scientific observation time."
        ),
        fetch_time_policy="Caller supplies a UTC fetch timestamp.",
        normalized_fields=("fixture.mass", "fixture.radius"),
        failure_and_fallback_behaviour="Reject invalid fixture input without fallback.",
        fixture_and_checksum_strategy="Fixtures are deterministic and fictional.",
        known_limitations=("No scientific provider execution is present.",),
        last_verified_at=datetime(2026, 8, 1, tzinfo=UTC),
        capabilities=("lookup",),
    )


@pytest.fixture
def data_manifest() -> DataManifest:
    """Return the exact fictional dataset release tied to ``source_manifest``."""
    return DataManifest(
        manifest_type="data",
        manifest_schema_version=1,
        source_id="fixture.catalog-source",
        dataset_id="fixture-catalog-release",
        release_version="fixture-release-v1",
        official_url="https://fixtures.invalid/catalog/release",
        documentation_url="https://fixtures.invalid/catalog/docs",
        terms_or_licence="Fictional fixture licence.",
        citation="Fictional fixture citation.",
        retrieved_at=datetime(2026, 8, 1, tzinfo=UTC),
        coverage="Fictional test coverage only.",
        local_file=None,
        checksum=None,
        parser_version="fixture-parser-v1",
        usage_notes="Only deterministic test inputs are accepted.",
    )
