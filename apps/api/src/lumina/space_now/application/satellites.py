"""Cache-only CelesTrak satellite list and local pass-prediction application services."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, Protocol

from lumina.provenance.application.read import (
    ProviderSnapshot,
    ProviderSnapshotReader,
    ProviderSnapshotReadError,
)
from lumina.provenance.domain.celestrak import (
    CELESTRAK_ELEMENT_WARNING_HOURS,
    CelestrakNormalized,
    CelestrakSatellite,
    parse_element_epoch,
)
from lumina.provenance.domain.runtime import CELESTRAK_PROVIDER_CODE, CacheState
from lumina.satellites.domain.models import (
    SATELLITE_MAX_PROPAGATABLE_CATALOG_NUMBER,
    ObserverLocation,
    SatelliteElements,
    SatellitePassEngine,
    SatellitePassPrediction,
)

SATELLITE_PUBLIC_LIST_LIMIT = 192
SatelliteAvailability = Literal["fresh", "stale", "unavailable"]
SatelliteUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]


class SatelliteNotFoundError(LookupError):
    def __init__(self) -> None:
        super().__init__("Satellite is not present in the current selected-group snapshot.")


class SatelliteDataUnavailableError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Satellite data is unavailable for pass prediction.")


class SatelliteClock(Protocol):
    def now(self) -> datetime: ...


class _SystemSatelliteClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class SatelliteItemProjection:
    catalog_number: int
    name: str
    object_id: str | None
    groups: tuple[str, ...]
    element_epoch_utc: datetime
    element_age_hours: float
    stale_element_warning: bool
    pass_prediction_runtime_supported: bool


@dataclass(frozen=True, slots=True)
class SatelliteFreshnessProjection:
    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None
    snapshot_latest_epoch_utc: datetime | None


@dataclass(frozen=True, slots=True)
class SatelliteSourceProjection:
    name: str
    official_documentation_url: str
    terms_url: str
    attribution_text: str


@dataclass(frozen=True, slots=True)
class SatelliteListProjection:
    availability: SatelliteAvailability
    unavailable_reason: SatelliteUnavailableReason | None
    total_satellite_count: int
    returned_satellite_count: int
    satellites: tuple[SatelliteItemProjection, ...]
    freshness: SatelliteFreshnessProjection
    source: SatelliteSourceProjection


@dataclass(frozen=True, slots=True)
class SatellitePassProjection:
    satellite: SatelliteItemProjection
    requested_start_utc: datetime
    prediction: SatellitePassPrediction
    source: SatelliteSourceProjection


class SatelliteReadService:
    """Project the durable CelesTrak cache without any upstream capability."""

    def __init__(
        self, reader: ProviderSnapshotReader, *, clock: SatelliteClock | None = None
    ) -> None:
        self._reader = reader
        self._clock = clock or _SystemSatelliteClock()

    async def read(self) -> SatelliteListProjection:
        snapshot = await _snapshot(self._reader)
        now = _utc(self._clock.now())
        return _list_projection(snapshot, now)


class SatellitePassService:
    """Resolve one cached satellite and run the injected local deterministic pass engine."""

    def __init__(
        self,
        reader: ProviderSnapshotReader,
        engine: SatellitePassEngine,
        *,
        clock: SatelliteClock | None = None,
    ) -> None:
        self._reader = reader
        self._engine = engine
        self._clock = clock or _SystemSatelliteClock()

    async def predict(
        self,
        *,
        catalog_number: int,
        observer: ObserverLocation,
        start_utc: datetime,
    ) -> SatellitePassProjection:
        snapshot = await _snapshot(self._reader)
        if _unavailable_reason(snapshot) is not None:
            raise SatelliteDataUnavailableError()
        normalized = _normalized(snapshot)
        satellite = next(
            (item for item in normalized.satellites if item.catalog_number == catalog_number),
            None,
        )
        if satellite is None:
            raise SatelliteNotFoundError()
        start = _utc(start_utc)
        prediction = self._engine.predict(_elements(satellite), observer, start)
        return SatellitePassProjection(
            satellite=_item_projection(satellite, _utc(self._clock.now())),
            requested_start_utc=start,
            prediction=prediction,
            source=_source(snapshot),
        )


def _list_projection(snapshot: ProviderSnapshot, now: datetime) -> SatelliteListProjection:
    source = _source(snapshot)
    cache = snapshot.status.cache
    base_freshness = SatelliteFreshnessProjection(
        cache_state=snapshot.status.cache_state,
        retrieved_at=None if cache is None else cache.fetched_at,
        fresh_until=None if cache is None else cache.fresh_until,
        stale_until=None if cache is None else cache.stale_until,
        last_refresh_failure_code=(
            None
            if snapshot.status.state.last_failure_code is None
            else snapshot.status.state.last_failure_code.value
        ),
        snapshot_latest_epoch_utc=None,
    )
    unavailable = _unavailable_reason(snapshot)
    if unavailable is not None:
        return SatelliteListProjection(
            availability="unavailable",
            unavailable_reason=unavailable,
            total_satellite_count=0,
            returned_satellite_count=0,
            satellites=(),
            freshness=base_freshness,
            source=source,
        )
    normalized = _normalized(snapshot)
    public = tuple(
        _item_projection(item, now) for item in normalized.satellites[:SATELLITE_PUBLIC_LIST_LIMIT]
    )
    return SatelliteListProjection(
        availability="fresh" if snapshot.status.cache_state is CacheState.FRESH else "stale",
        unavailable_reason=None,
        total_satellite_count=len(normalized.satellites),
        returned_satellite_count=len(public),
        satellites=public,
        freshness=SatelliteFreshnessProjection(
            cache_state=base_freshness.cache_state,
            retrieved_at=base_freshness.retrieved_at,
            fresh_until=base_freshness.fresh_until,
            stale_until=base_freshness.stale_until,
            last_refresh_failure_code=base_freshness.last_refresh_failure_code,
            snapshot_latest_epoch_utc=parse_element_epoch(normalized.snapshot_latest_epoch_utc),
        ),
        source=source,
    )


async def _snapshot(reader: ProviderSnapshotReader) -> ProviderSnapshot:
    snapshot = await reader.read(CELESTRAK_PROVIDER_CODE)
    if (
        not isinstance(snapshot, ProviderSnapshot)
        or snapshot.config.provider_code != CELESTRAK_PROVIDER_CODE
    ):
        raise ProviderSnapshotReadError()
    return snapshot


def _unavailable_reason(snapshot: ProviderSnapshot) -> SatelliteUnavailableReason | None:
    cache = snapshot.status.cache
    if not snapshot.status.state.enabled:
        return "provider_disabled"
    if cache is None or snapshot.status.cache_state is CacheState.MISSING:
        return "no_cached_content"
    if snapshot.status.cache_state is CacheState.EXPIRED:
        return "cached_content_expired"
    return None


def _normalized(snapshot: ProviderSnapshot) -> CelestrakNormalized:
    cache = snapshot.status.cache
    if cache is None:
        raise ProviderSnapshotReadError()
    if (
        cache.provider_code != snapshot.config.provider_code
        or cache.cache_key != snapshot.config.cache_key
        or cache.schema_version != snapshot.config.source_schema_version
    ):
        raise ProviderSnapshotReadError()
    try:
        decoded = snapshot.payload_codec.decode(cache.normalized_payload)
    except (TypeError, ValueError):
        raise ProviderSnapshotReadError() from None
    if not isinstance(decoded, CelestrakNormalized):
        raise ProviderSnapshotReadError()
    return decoded


def _item_projection(value: CelestrakSatellite, now: datetime) -> SatelliteItemProjection:
    epoch = parse_element_epoch(value.epoch_utc)
    age_hours = abs((now - epoch).total_seconds() / 3600.0)
    return SatelliteItemProjection(
        catalog_number=value.catalog_number,
        name=value.object_name,
        object_id=value.object_id,
        groups=tuple(value.groups),
        element_epoch_utc=epoch,
        element_age_hours=age_hours,
        stale_element_warning=age_hours > CELESTRAK_ELEMENT_WARNING_HOURS,
        pass_prediction_runtime_supported=(
            value.catalog_number <= SATELLITE_MAX_PROPAGATABLE_CATALOG_NUMBER
        ),
    )


def _elements(value: CelestrakSatellite) -> SatelliteElements:
    return SatelliteElements(
        catalog_number=value.catalog_number,
        object_name=value.object_name,
        object_id=value.object_id,
        epoch_utc=parse_element_epoch(value.epoch_utc),
        mean_motion_rev_per_day=value.mean_motion_rev_per_day,
        eccentricity=value.eccentricity,
        inclination_deg=value.inclination_deg,
        ra_of_asc_node_deg=value.ra_of_asc_node_deg,
        arg_of_pericenter_deg=value.arg_of_pericenter_deg,
        mean_anomaly_deg=value.mean_anomaly_deg,
        ephemeris_type=value.ephemeris_type,
        classification_type=value.classification_type,
        element_set_number=value.element_set_number,
        revolution_at_epoch=value.revolution_at_epoch,
        bstar=value.bstar,
        mean_motion_dot=value.mean_motion_dot,
        mean_motion_ddot=value.mean_motion_ddot,
        groups=value.groups,
    )


def _source(snapshot: ProviderSnapshot) -> SatelliteSourceProjection:
    manifest = snapshot.config.source_manifest
    return SatelliteSourceProjection(
        name=manifest.source_name,
        official_documentation_url=str(manifest.official_documentation_url),
        terms_url=str(manifest.terms_or_licence_url),
        attribution_text=manifest.attribution_text,
    )


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("Satellite application timestamps must use UTC")
    return value.astimezone(UTC)


__all__ = [
    "SATELLITE_PUBLIC_LIST_LIMIT",
    "SatelliteAvailability",
    "SatelliteDataUnavailableError",
    "SatelliteFreshnessProjection",
    "SatelliteItemProjection",
    "SatelliteListProjection",
    "SatelliteNotFoundError",
    "SatellitePassProjection",
    "SatellitePassService",
    "SatelliteReadService",
    "SatelliteSourceProjection",
    "SatelliteUnavailableReason",
]
