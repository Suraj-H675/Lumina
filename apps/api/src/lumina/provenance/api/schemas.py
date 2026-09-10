"""Safe public schemas for operational provider visibility."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from lumina.provenance.domain.runtime import CacheState, CircuitState, ProviderFailureCode


class ProviderMetricsResponse(BaseModel):
    """Durable low-cardinality counters for one provider."""

    model_config = ConfigDict(extra="forbid")

    sync_cycles_started: int
    sync_successes: int
    sync_upstream_failures: int
    http_requests: int
    http_retries: int
    schema_failures: int
    quarantines: int
    stale_fallbacks: int
    circuit_openings: int
    disabled_skips: int
    circuit_open_skips: int
    concurrent_lease_skips: int


class ProviderStatusResponse(BaseModel):
    """Safe operational projection with documentary links but no executable endpoint."""

    model_config = ConfigDict(extra="forbid")

    provider_code: str
    source_name: str
    official_documentation_url: str
    terms_or_licence_url: str
    attribution_text: str
    adapter_id: str
    adapter_version: str
    source_schema_version: str
    enabled: bool
    circuit_state: CircuitState
    cache_state: CacheState
    cache_active: bool
    sync_lease_active: bool
    consecutive_failures: int
    last_attempt_at: datetime | None
    last_success_at: datetime | None
    last_failure_at: datetime | None
    last_failure_code: ProviderFailureCode | None
    last_http_status: int | None
    last_sync_duration_ms: int | None
    next_sync_at: datetime | None
    next_probe_at: datetime | None
    cache_fetched_at: datetime | None
    cache_fresh_until: datetime | None
    cache_stale_until: datetime | None
    quarantine_exists: bool
    quarantine_observed_at: datetime | None
    quarantine_failure_code: ProviderFailureCode | None
    quarantine_raw_sha256: str | None
    metrics: ProviderMetricsResponse


class ProviderStatusListResponse(BaseModel):
    """The finite production provider status collection."""

    model_config = ConfigDict(extra="forbid")

    providers: tuple[ProviderStatusResponse, ...]
