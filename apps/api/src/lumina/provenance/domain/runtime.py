"""Transport-neutral runtime contracts for the Phase 4A provider framework."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, fields
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from types import MappingProxyType
from typing import Final, Protocol

from .manifests import SourceManifest

PROVIDER_CODE: Final = "nasa-exoplanet-archive"
ADAPTER_ID: Final = "nasa-exoplanet-archive-tap-count"
ADAPTER_VERSION: Final = "1"
CACHE_KEY: Final = "confirmed-planet-count"
SOURCE_SCHEMA_VERSION: Final = "ps-confirmed-count-v1"
FIXED_HOST: Final = "exoplanetarchive.ipac.caltech.edu"
FIXED_PATH: Final = "/TAP/sync"
FIXED_QUERY: Final = "select count(pl_name) from ps where default_flag=1"
FIXED_FORMAT: Final = "csv"
FIXED_USER_AGENT: Final = "Lumina/0.0 Phase-4A provider-sync"

SUCCESS_REFRESH_INTERVAL: Final = timedelta(hours=6)
FRESH_TTL: Final = timedelta(hours=8)
STALE_IF_ERROR_GRACE: Final = timedelta(hours=72)
SYNC_LEASE_SECONDS: Final = 120
PROVIDER_REQUEST_CYCLE_SECONDS: Final = 90
PROVIDER_ATTEMPT_TOTAL_SECONDS: Final = 30
MAX_RESPONSE_BYTES: Final = 65_536


class CircuitState(StrEnum):
    """Durable provider circuit states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CacheState(StrEnum):
    """Computed state of the last-known-good provider cache."""

    MISSING = "missing"
    FRESH = "fresh"
    STALE = "stale"
    EXPIRED = "expired"


class ProviderFailureCode(StrEnum):
    """Value-free stable categories safe for status and structured logs."""

    TRANSPORT_UNAVAILABLE = "provider.transport_unavailable"
    TIMEOUT = "provider.timeout"
    HTTP_RATE_LIMITED = "provider.http_rate_limited"
    HTTP_REJECTED = "provider.http_rejected"
    HTTP_SERVER_ERROR = "provider.http_server_error"
    RESPONSE_TOO_LARGE = "provider.response_too_large"
    PAYLOAD_INVALID = "provider.payload_invalid"
    NORMALIZATION_FAILED = "provider.normalization_failed"
    CIRCUIT_OPEN = "provider.circuit_open"
    DISABLED = "provider.disabled"
    STORAGE = "provider.storage"
    CONCURRENCY = "provider.concurrency"


class ProviderSyncOutcome(StrEnum):
    """Handled outcomes of one provider synchronization cycle."""

    SUCCESS = "success"
    NOT_DUE = "not_due"
    DISABLED = "disabled"
    ALREADY_RUNNING = "already_running"
    CIRCUIT_OPEN = "circuit_open"
    UPSTREAM_FAILURE = "upstream_failure"
    STALE_FALLBACK = "stale_fallback"
    EXPIRED = "expired"


class ProviderClaimOutcome(StrEnum):
    """Result of the atomic pre-network provider lease decision."""

    STARTED = "started"
    NOT_DUE = "not_due"
    DISABLED = "disabled"
    CIRCUIT_OPEN = "circuit_open"
    ALREADY_RUNNING = "already_running"


class CircuitFailureKind(StrEnum):
    """Failure policy selected after one complete sync cycle."""

    TRANSIENT = "transient"
    RATE_LIMIT = "rate_limit"
    CONTRACT = "contract"


class ProviderStorageFailure(RuntimeError):
    """Safe, implementation-neutral failure for provider runtime persistence."""

    def __init__(self) -> None:
        super().__init__("Provider runtime storage failed.")

    def __repr__(self) -> str:
        return "ProviderStorageFailure(<redacted>)"


@dataclass(frozen=True, slots=True)
class HttpTimeoutPolicy:
    """Explicit transport timeout values in seconds."""

    connect_seconds: float = 5.0
    read_seconds: float = 10.0
    write_seconds: float = 5.0
    pool_seconds: float = 5.0


@dataclass(frozen=True, slots=True)
class ProviderRuntimeConfig:
    """Immutable code-owned operational policy, separate from SourceManifest."""

    provider_code: str
    adapter_id: str
    adapter_version: str
    cache_key: str
    source_schema_version: str
    source_manifest: SourceManifest
    endpoint_host: str
    endpoint_path: str
    query: str
    output_format: str
    timeout: HttpTimeoutPolicy
    refresh_interval: timedelta = SUCCESS_REFRESH_INTERVAL
    fresh_ttl: timedelta = FRESH_TTL
    stale_if_error_grace: timedelta = STALE_IF_ERROR_GRACE
    lease_seconds: int = SYNC_LEASE_SECONDS
    max_response_bytes: int = MAX_RESPONSE_BYTES
    max_transient_attempts: int = 3
    retry_delays_seconds: tuple[float, ...] = (1.0, 2.0)
    transient_failure_threshold: int = 3
    transient_open_interval: timedelta = timedelta(hours=1)
    contract_open_interval: timedelta = timedelta(hours=6)
    retry_after_minimum_seconds: int = 60
    retry_after_maximum_seconds: int = 86_400

    def __post_init__(self) -> None:
        if (
            self.provider_code != PROVIDER_CODE
            or self.adapter_id != ADAPTER_ID
            or self.adapter_version != ADAPTER_VERSION
            or self.cache_key != CACHE_KEY
            or self.source_schema_version != SOURCE_SCHEMA_VERSION
            or self.endpoint_host != FIXED_HOST
            or self.endpoint_path != FIXED_PATH
            or self.query != FIXED_QUERY
            or self.output_format != FIXED_FORMAT
            or self.lease_seconds != SYNC_LEASE_SECONDS
            or self.max_response_bytes != MAX_RESPONSE_BYTES
            or self.max_transient_attempts != 3
            or self.retry_delays_seconds != (1.0, 2.0)
            or self.transient_failure_threshold != 3
            or self.refresh_interval != SUCCESS_REFRESH_INTERVAL
            or self.fresh_ttl != FRESH_TTL
            or self.stale_if_error_grace != STALE_IF_ERROR_GRACE
            or self.transient_open_interval != timedelta(hours=1)
            or self.contract_open_interval != timedelta(hours=6)
            or self.retry_after_minimum_seconds != 60
            or self.retry_after_maximum_seconds != 86_400
        ):
            raise ValueError("Provider runtime configuration is not the approved Phase 4A policy")
        if (
            SYNC_LEASE_SECONDS - PROVIDER_REQUEST_CYCLE_SECONDS != 30
            or PROVIDER_ATTEMPT_TOTAL_SECONDS > PROVIDER_REQUEST_CYCLE_SECONDS
        ):
            raise ValueError("Provider timeout hierarchy is not the approved Phase 4A policy")
        if self.source_manifest.source_id != self.provider_code:
            raise ValueError("Provider runtime configuration disagrees with its source manifest")
        if (
            self.source_manifest.adapter_id != self.adapter_id
            or self.source_manifest.adapter_version != self.adapter_version
            or self.source_manifest.source_schema_version != self.source_schema_version
            or self.source_manifest.endpoint_or_base_url
            != f"https://{self.endpoint_host}{self.endpoint_path}"
            or self.source_manifest.capabilities != ("batch_fetch",)
            or self.source_manifest.normalized_fields != ("confirmed_planet_count",)
        ):
            raise ValueError("Provider runtime configuration disagrees with its source manifest")
        if self.fresh_ttl < self.refresh_interval or self.stale_if_error_grace < timedelta(0):
            raise ValueError("Provider freshness policy is invalid")
        if self.timeout != HttpTimeoutPolicy():
            raise ValueError("Provider timeout policy is not the approved Phase 4A policy")

    @property
    def stale_ttl(self) -> timedelta:
        """Return the complete fresh-expiry-to-stale-expiry interval."""
        return self.fresh_ttl + self.stale_if_error_grace


@dataclass(frozen=True, slots=True)
class RawProviderResponse:
    """Bounded exact response evidence returned by one transport attempt."""

    status_code: int
    headers: Mapping[str, str]
    body: bytes
    raw_complete: bool
    observed_bytes: int
    content_type_valid: bool
    retry_after_seconds: int | None = None

    def __post_init__(self) -> None:
        if (
            type(self.status_code) is not int
            or self.status_code < 100
            or self.status_code > 599
            or type(self.observed_bytes) is not int
            or self.observed_bytes < 0
            or len(self.body) > MAX_RESPONSE_BYTES
            or self.raw_complete
            and self.observed_bytes != len(self.body)
            or not self.raw_complete
            and self.observed_bytes <= len(self.body)
        ):
            raise ValueError("Raw provider response is invalid")
        object.__setattr__(self, "headers", MappingProxyType(dict(self.headers)))


@dataclass(frozen=True, repr=False, slots=True)
class ProviderLease:
    """Unpredictable token and mode held by one network-capable sync cycle."""

    token: str
    half_open_probe: bool

    def __repr__(self) -> str:
        return "ProviderLease(<redacted>)"


@dataclass(frozen=True, slots=True)
class ProviderClaim:
    """Atomic lease decision returned before any remote request begins."""

    outcome: ProviderClaimOutcome
    lease: ProviderLease | None = None

    def __post_init__(self) -> None:
        if (self.outcome is ProviderClaimOutcome.STARTED) != (self.lease is not None):
            raise ValueError("Started provider claims require a lease")


@dataclass(frozen=True, slots=True)
class ProviderFailure:
    """Sanitized failure facts needed by durable circuit finalization."""

    code: ProviderFailureCode
    kind: CircuitFailureKind
    http_status: int | None = None
    retry_after_seconds: int | None = None
    raw_response: RawProviderResponse | None = None

    def __post_init__(self) -> None:
        if self.http_status is not None and not 100 <= self.http_status <= 599:
            raise ValueError("Provider HTTP status is invalid")


class ProviderFinalizationOutcome(StrEnum):
    """Lease-fenced result of a post-network state mutation."""

    COMMITTED = "committed"
    FENCED = "fenced"
    DISABLED = "disabled"


@dataclass(frozen=True, slots=True)
class ProviderFinalization:
    """Safe result of cache/state/quarantine finalization."""

    outcome: ProviderFinalizationOutcome
    cache_state: CacheState | None
    stale_fallback: bool = False


class ProviderRuntimeStore(Protocol):
    """Port for durable provider state, cache, quarantine, and counters."""

    async def acquire(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        lease_expires_at: datetime,
    ) -> ProviderClaim:
        """Atomically decide eligibility and acquire the pre-network lease."""
        ...

    async def finalize_success(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        normalized_payload: Mapping[str, int],
        raw_sha256: str,
        attempts: int,
        retries: int,
        duration_ms: int,
    ) -> ProviderFinalization:
        """Atomically commit cache and successful state if the lease still owns the cycle."""
        ...

    async def finalize_failure(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        failure: ProviderFailure,
        attempts: int,
        retries: int,
        duration_ms: int,
    ) -> ProviderFinalization:
        """Atomically commit failure state and optional bounded quarantine evidence."""
        ...

    async def status(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
    ) -> ProviderStatusSnapshot:
        """Read one safe provider status projection."""
        ...

    async def set_enabled(
        self,
        config: ProviderRuntimeConfig,
        *,
        enabled: bool,
        now: datetime,
    ) -> ProviderStatusSnapshot:
        """Apply one explicit operator enable/disable transition."""
        ...


@dataclass(frozen=True, slots=True)
class RuntimeCounters:
    """Durable low-cardinality provider counters."""

    sync_cycles_started: int = 0
    sync_successes: int = 0
    sync_upstream_failures: int = 0
    http_requests: int = 0
    http_retries: int = 0
    schema_failures: int = 0
    quarantines: int = 0
    stale_fallbacks: int = 0
    circuit_openings: int = 0
    disabled_skips: int = 0
    circuit_open_skips: int = 0
    concurrent_lease_skips: int = 0

    def __post_init__(self) -> None:
        if any(
            type(getattr(self, field.name)) is not int or getattr(self, field.name) < 0
            for field in fields(self)
        ):
            raise ValueError("Provider counters must be non-negative integers")


@dataclass(frozen=True, slots=True)
class ProviderRuntimeState:
    """Safe projection of one durable provider runtime row."""

    provider_code: str
    enabled: bool
    circuit_state: CircuitState
    consecutive_failures: int
    next_sync_at: datetime | None
    next_probe_at: datetime | None
    last_attempt_at: datetime | None
    last_success_at: datetime | None
    last_failure_at: datetime | None
    last_failure_code: ProviderFailureCode | None
    last_http_status: int | None
    last_sync_duration_ms: int | None
    sync_lease_active: bool
    lease_expires_at: datetime | None
    counters: RuntimeCounters
    updated_at: datetime


type NormalizedPayload = Mapping[str, int]


@dataclass(frozen=True, slots=True)
class ProviderCacheEntry:
    """Last-known-good normalized cache row."""

    provider_code: str
    cache_key: str
    normalized_payload: NormalizedPayload
    schema_version: str
    raw_sha256: str
    fetched_at: datetime
    fresh_until: datetime
    stale_until: datetime

    def state_at(self, now: datetime) -> CacheState:
        """Compute the exact cache state using the supplied UTC instant."""
        _require_utc(now)
        if now <= self.fresh_until:
            return CacheState.FRESH
        if now <= self.stale_until:
            return CacheState.STALE
        return CacheState.EXPIRED


@dataclass(frozen=True, slots=True)
class ProviderQuarantineEntry:
    """Latest bounded unacceptable response for one provider/cache identity."""

    provider_code: str
    cache_key: str
    failure_code: ProviderFailureCode
    observed_at: datetime
    raw_complete: bool
    observed_bytes: int
    raw_sha256: str | None
    raw_body: bytes | None
    http_status: int | None

    def __post_init__(self) -> None:
        if self.raw_complete:
            if self.raw_body is None or len(self.raw_body) > MAX_RESPONSE_BYTES:
                raise ValueError("Complete quarantine evidence must be bounded")
            if self.raw_sha256 is None:
                raise ValueError("Complete quarantine evidence requires a checksum")
        elif self.raw_sha256 is not None or self.raw_body is not None:
            raise ValueError("Incomplete quarantine evidence cannot claim complete raw bytes")


@dataclass(frozen=True, slots=True)
class ProviderStatusSnapshot:
    """Read-only operational projection used by the API and operator CLI."""

    state: ProviderRuntimeState
    cache: ProviderCacheEntry | None
    cache_state: CacheState
    quarantine_exists: bool
    quarantine_observed_at: datetime | None
    quarantine_failure_code: ProviderFailureCode | None
    quarantine_raw_sha256: str | None


def _require_utc(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("Provider runtime timestamps must use UTC")


__all__ = [
    "ADAPTER_ID",
    "ADAPTER_VERSION",
    "CACHE_KEY",
    "CacheState",
    "CircuitFailureKind",
    "CircuitState",
    "FIXED_FORMAT",
    "FIXED_HOST",
    "FIXED_PATH",
    "FIXED_QUERY",
    "FIXED_USER_AGENT",
    "FRESH_TTL",
    "HttpTimeoutPolicy",
    "MAX_RESPONSE_BYTES",
    "NormalizedPayload",
    "PROVIDER_ATTEMPT_TOTAL_SECONDS",
    "PROVIDER_CODE",
    "PROVIDER_REQUEST_CYCLE_SECONDS",
    "ProviderCacheEntry",
    "ProviderClaim",
    "ProviderClaimOutcome",
    "ProviderFailure",
    "ProviderFailureCode",
    "ProviderFinalization",
    "ProviderFinalizationOutcome",
    "ProviderLease",
    "ProviderQuarantineEntry",
    "ProviderRuntimeConfig",
    "ProviderRuntimeStore",
    "ProviderRuntimeState",
    "ProviderStorageFailure",
    "ProviderStatusSnapshot",
    "ProviderSyncOutcome",
    "RawProviderResponse",
    "RuntimeCounters",
    "SOURCE_SCHEMA_VERSION",
    "STALE_IF_ERROR_GRACE",
    "SUCCESS_REFRESH_INTERVAL",
    "SYNC_LEASE_SECONDS",
]
