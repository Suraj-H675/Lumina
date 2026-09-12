"""Transport-neutral runtime contracts for the Phase 4A provider framework."""

from __future__ import annotations

import json
import math
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, field, fields
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

APOD_PROVIDER_CODE: Final = "nasa-apod"
APOD_ADAPTER_ID: Final = "nasa-apod-daily-media"
APOD_ADAPTER_VERSION: Final = "1"
APOD_CACHE_KEY: Final = "daily-media"
APOD_SOURCE_SCHEMA_VERSION: Final = "apod-v1-json-v1"
APOD_HOST: Final = "api.nasa.gov"
APOD_PATH: Final = "/planetary/apod"
APOD_FORMAT: Final = "json"
APOD_USER_AGENT: Final = "Lumina/0.0 Phase-4B provider-sync"
APOD_CONTENT_TYPE: Final = "application/json"
APOD_OFFICIAL_HOST: Final = "apod.nasa.gov"
APOD_OFFICIAL_PATH: Final = "/apod/"

NEOWS_PROVIDER_CODE: Final = "nasa-neows"
NEOWS_ADAPTER_ID: Final = "nasa-neows-feed"
NEOWS_ADAPTER_VERSION: Final = "1"
NEOWS_CACHE_KEY: Final = "earth-close-approaches"
NEOWS_SOURCE_SCHEMA_VERSION: Final = "neows-feed-v1-json-v1"
NEOWS_HOST: Final = "api.nasa.gov"
NEOWS_PATH: Final = "/neo/rest/v1/feed"
NEOWS_FORMAT: Final = "json"
NEOWS_USER_AGENT: Final = "Lumina/0.0 Phase-4B provider-sync"
NEOWS_CONTENT_TYPE: Final = "application/json"

SUCCESS_REFRESH_INTERVAL: Final = timedelta(hours=6)
FRESH_TTL: Final = timedelta(hours=8)
STALE_IF_ERROR_GRACE: Final = timedelta(hours=72)
APOD_SUCCESS_REFRESH_INTERVAL: Final = timedelta(hours=4)
APOD_FRESH_TTL: Final = timedelta(hours=6)
APOD_STALE_IF_ERROR_GRACE: Final = timedelta(hours=72)
SYNC_LEASE_SECONDS: Final = 120
PROVIDER_REQUEST_CYCLE_SECONDS: Final = 90
PROVIDER_ATTEMPT_TOTAL_SECONDS: Final = 30
MAX_RESPONSE_BYTES: Final = 65_536
NEOWS_MAX_RESPONSE_BYTES: Final = 1_048_576
FRAMEWORK_MAX_RAW_RESPONSE_BYTES: Final = NEOWS_MAX_RESPONSE_BYTES
MAX_NORMALIZED_PAYLOAD_BYTES: Final = 524_288
MAX_NORMALIZED_JSON_DEPTH: Final = 8
NEOWS_SUCCESS_REFRESH_INTERVAL: Final = timedelta(hours=2)
NEOWS_FRESH_TTL: Final = timedelta(hours=3)
NEOWS_STALE_IF_ERROR_GRACE: Final = timedelta(hours=12)


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
    NOT_CONFIGURED = "provider.not_configured"
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
    NOT_CONFIGURED = "not_configured"


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
    expected_content_type: str = "text/plain"
    user_agent: str = FIXED_USER_AGENT
    max_transient_attempts: int = 3
    retry_delays_seconds: tuple[float, ...] = (1.0, 2.0)
    transient_failure_threshold: int = 3
    transient_open_interval: timedelta = timedelta(hours=1)
    contract_open_interval: timedelta = timedelta(hours=6)
    retry_after_minimum_seconds: int = 60
    retry_after_maximum_seconds: int = 86_400

    def __post_init__(self) -> None:
        if (
            not self.provider_code
            or not self.adapter_id
            or not self.adapter_version
            or not self.cache_key
            or not self.source_schema_version
            or not self.endpoint_host
            or not self.endpoint_path.startswith("/")
            or any(character in self.endpoint_path for character in "?#")
            or not self.output_format
            or self.lease_seconds != SYNC_LEASE_SECONDS
            or not 1 <= self.max_response_bytes <= FRAMEWORK_MAX_RAW_RESPONSE_BYTES
            or self.max_transient_attempts != 3
            or self.retry_delays_seconds != (1.0, 2.0)
            or self.transient_failure_threshold != 3
            or self.transient_open_interval != timedelta(hours=1)
            or self.contract_open_interval != timedelta(hours=6)
            or self.retry_after_minimum_seconds != 60
            or self.retry_after_maximum_seconds != 86_400
            or self.expected_content_type
            not in {"text/plain", APOD_CONTENT_TYPE, NEOWS_CONTENT_TYPE}
            or not self.user_agent
            or any(ord(character) < 32 or ord(character) == 127 for character in self.user_agent)
        ):
            raise ValueError("Provider runtime configuration is outside the approved policy")
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
            or not self.source_manifest.normalized_fields
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


@dataclass(frozen=True, repr=False, slots=True)
class RawProviderResponse:
    """Bounded exact response evidence returned by one transport attempt."""

    status_code: int
    headers: Mapping[str, str]
    body: bytes
    raw_complete: bool
    observed_bytes: int
    content_type_valid: bool
    max_response_bytes: int = MAX_RESPONSE_BYTES
    retry_after_seconds: int | None = None
    quarantine_body: bytes | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if (
            type(self.status_code) is not int
            or self.status_code < 100
            or self.status_code > 599
            or type(self.observed_bytes) is not int
            or self.observed_bytes < 0
            or type(self.max_response_bytes) is not int
            or not 1 <= self.max_response_bytes <= FRAMEWORK_MAX_RAW_RESPONSE_BYTES
            or len(self.body) > self.max_response_bytes
            or self.quarantine_body is not None
            and (
                type(self.quarantine_body) is not bytes
                or len(self.quarantine_body) > self.max_response_bytes
            )
            or self.raw_complete
            and self.observed_bytes != len(self.body)
            or not self.raw_complete
            and self.observed_bytes <= len(self.body)
        ):
            raise ValueError("Raw provider response is invalid")
        object.__setattr__(self, "headers", MappingProxyType(dict(self.headers)))

    def __repr__(self) -> str:
        """Keep response bytes and provider metadata out of diagnostics."""
        return "RawProviderResponse(<redacted>)"


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
        normalized_payload: NormalizedPayload,
        payload_codec: ProviderPayloadCodec,
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
        payload_codec: ProviderPayloadCodec,
    ) -> ProviderStatusSnapshot:
        """Read one safe provider status projection."""
        ...

    async def set_enabled(
        self,
        config: ProviderRuntimeConfig,
        *,
        enabled: bool,
        now: datetime,
        payload_codec: ProviderPayloadCodec,
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


type NormalizedScalar = str | int | float | bool | None
type NormalizedJsonValue = (
    None | bool | int | float | str | list[NormalizedJsonValue] | dict[str, NormalizedJsonValue]
)
type NormalizedPayload = Mapping[str, NormalizedJsonValue]


def validate_normalized_payload(value: object) -> NormalizedPayload:
    """Validate the bounded recursive JSON representation used by provider caches."""

    active_containers: set[int] = set()

    def visit(candidate: object, depth: int) -> NormalizedJsonValue:
        if depth > MAX_NORMALIZED_JSON_DEPTH:
            raise ValueError("Normalized payload nesting is too deep")
        if candidate is None or type(candidate) is bool:
            return candidate
        if type(candidate) is int:
            if not -(2**63) <= candidate <= 2**63 - 1:
                raise ValueError("Normalized integer is outside the signed 64-bit range")
            return candidate
        if type(candidate) is float:
            if not math.isfinite(candidate):
                raise ValueError("Normalized number is not finite")
            return candidate
        if type(candidate) is str:
            if any(unicodedata.category(character) == "Cs" for character in candidate):
                raise ValueError("Normalized text contains a surrogate")
            return candidate
        if type(candidate) is list:
            marker = id(candidate)
            if marker in active_containers:
                raise ValueError("Normalized payload contains a cycle")
            active_containers.add(marker)
            try:
                return [visit(item, depth + 1) for item in candidate]
            finally:
                active_containers.remove(marker)
        if type(candidate) is dict:
            marker = id(candidate)
            if marker in active_containers:
                raise ValueError("Normalized payload contains a cycle")
            active_containers.add(marker)
            try:
                normalized: dict[str, NormalizedJsonValue] = {}
                for key, item in candidate.items():
                    if type(key) is not str:
                        raise ValueError("Normalized object keys must be strings")
                    if any(unicodedata.category(character) == "Cs" for character in key):
                        raise ValueError("Normalized object key contains a surrogate")
                    normalized[key] = visit(item, depth + 1)
                return normalized
            finally:
                active_containers.remove(marker)
        raise ValueError("Normalized payload contains a non-JSON value")

    normalized = visit(value, 0)
    if not isinstance(normalized, dict):
        raise ValueError("Normalized payload must be a JSON object")
    try:
        encoded = json.dumps(
            normalized,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError):
        raise ValueError("Normalized payload is not canonical JSON") from None
    if len(encoded) > MAX_NORMALIZED_PAYLOAD_BYTES:
        raise ValueError("Normalized payload exceeds the storage bound")
    return normalized


class ProviderPayloadCodec(Protocol):
    """Typed codec guarding one provider's normalized JSONB payload shape."""

    def encode(self, normalized: object) -> NormalizedPayload:
        """Validate a typed normalized result and encode its storage shape."""
        ...

    def decode(self, stored: object) -> object:
        """Validate one value loaded from generic JSONB storage."""
        ...

    def accepts_replacement(
        self,
        current: NormalizedPayload | None,
        candidate: NormalizedPayload,
    ) -> bool:
        """Decide whether a valid candidate may replace the current cache entry."""
        ...


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
            if self.raw_body is None or len(self.raw_body) > FRAMEWORK_MAX_RAW_RESPONSE_BYTES:
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
    "APOD_ADAPTER_ID",
    "APOD_ADAPTER_VERSION",
    "APOD_CACHE_KEY",
    "APOD_CONTENT_TYPE",
    "APOD_FORMAT",
    "APOD_FRESH_TTL",
    "APOD_HOST",
    "APOD_OFFICIAL_HOST",
    "APOD_OFFICIAL_PATH",
    "APOD_PATH",
    "APOD_PROVIDER_CODE",
    "APOD_SOURCE_SCHEMA_VERSION",
    "APOD_STALE_IF_ERROR_GRACE",
    "APOD_SUCCESS_REFRESH_INTERVAL",
    "APOD_USER_AGENT",
    "CACHE_KEY",
    "CacheState",
    "CircuitFailureKind",
    "CircuitState",
    "FIXED_FORMAT",
    "FIXED_HOST",
    "FIXED_PATH",
    "FIXED_QUERY",
    "FIXED_USER_AGENT",
    "FRAMEWORK_MAX_RAW_RESPONSE_BYTES",
    "FRESH_TTL",
    "HttpTimeoutPolicy",
    "MAX_NORMALIZED_JSON_DEPTH",
    "MAX_NORMALIZED_PAYLOAD_BYTES",
    "MAX_RESPONSE_BYTES",
    "NEOWS_ADAPTER_ID",
    "NEOWS_ADAPTER_VERSION",
    "NEOWS_CACHE_KEY",
    "NEOWS_CONTENT_TYPE",
    "NEOWS_FORMAT",
    "NEOWS_FRESH_TTL",
    "NEOWS_HOST",
    "NEOWS_MAX_RESPONSE_BYTES",
    "NEOWS_PATH",
    "NEOWS_PROVIDER_CODE",
    "NEOWS_SOURCE_SCHEMA_VERSION",
    "NEOWS_STALE_IF_ERROR_GRACE",
    "NEOWS_SUCCESS_REFRESH_INTERVAL",
    "NEOWS_USER_AGENT",
    "NormalizedJsonValue",
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
    "ProviderPayloadCodec",
    "ProviderQuarantineEntry",
    "ProviderRuntimeConfig",
    "ProviderRuntimeStore",
    "ProviderRuntimeState",
    "ProviderStorageFailure",
    "ProviderStatusSnapshot",
    "ProviderSyncOutcome",
    "RawProviderResponse",
    "NormalizedScalar",
    "RuntimeCounters",
    "SOURCE_SCHEMA_VERSION",
    "STALE_IF_ERROR_GRACE",
    "SUCCESS_REFRESH_INTERVAL",
    "SYNC_LEASE_SECONDS",
    "validate_normalized_payload",
]
