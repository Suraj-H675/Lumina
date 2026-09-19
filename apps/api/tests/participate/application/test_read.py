from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from lumina.participate.application.read import ParticipateProjection, ParticipateReadService
from lumina.provenance.application.read import ProviderSnapshot, ProviderSnapshotReadError
from lumina.provenance.composition import zooniverse_panoptes_runtime_config
from lumina.provenance.domain.citizen_science import (
    PANOPTES_PROJECT_IDENTITIES,
    PanoptesCodec,
    PanoptesNormalized,
    PanoptesProjectStatus,
    PanoptesSourceEvidence,
)
from lumina.provenance.domain.runtime import (
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderFailureCode,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
_NOW = datetime(2026, 9, 19, 8, 0, tzinfo=UTC)


def _normalized() -> PanoptesNormalized:
    projects = tuple(
        PanoptesProjectStatus(
            component_id=component_id,
            project_id=project_id,
            slug=slug,
            private=False,
            live=True,
            updated_at=f"2026-09-{13 + index:02d}T07:00:00Z",
        )
        for index, (component_id, project_id, slug) in enumerate(PANOPTES_PROJECT_IDENTITIES)
    )
    evidence = tuple(
        PanoptesSourceEvidence(component_id=component_id, raw_sha256=f"{index:x}" * 64)
        for index, (component_id, _project_id, _slug) in enumerate(PANOPTES_PROJECT_IDENTITIES)
    )
    return PanoptesNormalized(projects=projects, source_evidence=evidence)


def _state(*, enabled: bool = True) -> ProviderRuntimeState:
    return ProviderRuntimeState(
        provider_code="zooniverse-panoptes",
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=None,
        next_probe_at=None,
        last_attempt_at=_NOW,
        last_success_at=_NOW,
        last_failure_at=None,
        last_failure_code=None,
        last_http_status=200,
        last_sync_duration_ms=10,
        sync_lease_active=False,
        lease_expires_at=None,
        counters=RuntimeCounters(sync_cycles_started=1, sync_successes=1, http_requests=6),
        updated_at=_NOW,
    )


def _cache(
    normalized: PanoptesNormalized,
    *,
    state: CacheState,
) -> ProviderCacheEntry:
    if state is CacheState.FRESH:
        fresh_until = _NOW + timedelta(hours=1)
        stale_until = _NOW + timedelta(hours=73)
    elif state is CacheState.STALE:
        fresh_until = _NOW - timedelta(hours=1)
        stale_until = _NOW + timedelta(hours=71)
    elif state is CacheState.EXPIRED:
        fresh_until = _NOW - timedelta(hours=80)
        stale_until = _NOW - timedelta(hours=1)
    else:
        raise AssertionError("missing cache has no cache entry")
    return ProviderCacheEntry(
        provider_code="zooniverse-panoptes",
        cache_key="citizen-science-project-status",
        normalized_payload=PanoptesCodec().encode(normalized),
        schema_version="panoptes-project-status-v1",
        raw_sha256="a" * 64,
        fetched_at=_NOW - timedelta(hours=2),
        fresh_until=fresh_until,
        stale_until=stale_until,
    )


def _snapshot(
    *,
    cache_state: CacheState = CacheState.FRESH,
    enabled: bool = True,
    normalized: PanoptesNormalized | None = None,
) -> ProviderSnapshot:
    config = zooniverse_panoptes_runtime_config(repository_root=_REPOSITORY_ROOT)
    cache = (
        None
        if cache_state is CacheState.MISSING
        else _cache(normalized or _normalized(), state=cache_state)
    )
    return ProviderSnapshot(
        config=config,
        payload_codec=PanoptesCodec(),
        status=ProviderStatusSnapshot(
            state=_state(enabled=enabled),
            cache=cache,
            cache_state=cache_state,
            quarantine_exists=False,
            quarantine_observed_at=None,
            quarantine_failure_code=None,
            quarantine_raw_sha256=None,
        ),
    )


class _Reader:
    def __init__(self, snapshot: ProviderSnapshot) -> None:
        self.snapshot = snapshot
        self.codes: list[str] = []

    async def read(self, provider_code: str) -> ProviderSnapshot:
        self.codes.append(provider_code)
        return self.snapshot


def _read(snapshot: ProviderSnapshot) -> ParticipateProjection:
    reader = _Reader(snapshot)
    projection = asyncio.run(ParticipateReadService(reader).read())
    assert reader.codes == ["zooniverse-panoptes"]
    return projection


def test_fresh_projection_combines_reviewed_metadata_with_exact_dynamic_status() -> None:
    normalized = _normalized()
    projects = list(normalized.projects)
    projects[0] = replace(projects[0], live=False)
    projects[1] = replace(projects[1], private=True)
    projection = _read(
        _snapshot(
            normalized=replace(normalized, projects=tuple(projects)),
            cache_state=CacheState.FRESH,
        )
    )

    assert projection.model_version == "participate-v1"
    assert projection.schema_version == 1
    assert projection.freshness.availability == "fresh"
    assert projection.freshness.cache_state is CacheState.FRESH
    assert len(projection.projects) == 6
    assert [project.status for project in projection.projects] == [
        "inactive",
        "inactive",
        "active",
        "active",
        "active",
        "active",
    ]
    assert all(project.status_stale is False for project in projection.projects)
    assert all(project.source_updated_at is not None for project in projection.projects)
    assert projection.projects[0].title == "Galaxy Zoo"
    assert "provider-controlled" not in str(projection)
    assert len(projection.challenges) == 12
    assert len(projection.activities) == 7
    assert len(projection.sources) == 19


def test_stale_projection_labels_each_cached_project_without_changing_status() -> None:
    projection = _read(_snapshot(cache_state=CacheState.STALE))

    assert projection.freshness.availability == "stale"
    assert projection.freshness.cache_state is CacheState.STALE
    assert all(project.status == "active" for project in projection.projects)
    assert all(project.status_stale is True for project in projection.projects)
    assert all(project.source_updated_at is not None for project in projection.projects)


@pytest.mark.parametrize(
    ("snapshot", "expected_cache_state"),
    [
        (_snapshot(enabled=False), CacheState.FRESH),
        (_snapshot(cache_state=CacheState.MISSING), CacheState.MISSING),
        (_snapshot(cache_state=CacheState.EXPIRED), CacheState.EXPIRED),
    ],
)
def test_disabled_missing_or_expired_provider_never_fabricates_current_status(
    snapshot: ProviderSnapshot,
    expected_cache_state: CacheState,
) -> None:
    projection = _read(snapshot)

    assert projection.freshness.availability == "unavailable"
    assert projection.freshness.cache_state is expected_cache_state
    assert all(project.status == "unavailable" for project in projection.projects)
    assert all(project.status_stale is False for project in projection.projects)
    assert all(project.source_updated_at is None for project in projection.projects)
    assert len(projection.challenges) == 12
    assert len(projection.activities) == 7


def test_malformed_fresh_cache_fails_closed() -> None:
    snapshot = _snapshot()
    assert snapshot.status.cache is not None
    malformed = replace(
        snapshot.status.cache,
        normalized_payload={"projects": [], "source_evidence": []},
    )
    broken = replace(
        snapshot,
        status=replace(snapshot.status, cache=malformed),
    )

    with pytest.raises(ProviderSnapshotReadError):
        asyncio.run(ParticipateReadService(_Reader(broken)).read())


def test_cache_identity_or_schema_mismatch_fails_closed() -> None:
    snapshot = _snapshot()
    assert snapshot.status.cache is not None
    for cache in (
        replace(snapshot.status.cache, provider_code="wrong"),
        replace(snapshot.status.cache, cache_key="wrong"),
        replace(snapshot.status.cache, schema_version="wrong"),
    ):
        broken = replace(snapshot, status=replace(snapshot.status, cache=cache))
        with pytest.raises(ProviderSnapshotReadError):
            asyncio.run(ParticipateReadService(_Reader(broken)).read())


def test_last_refresh_failure_code_is_exposed_only_as_stable_provider_code() -> None:
    snapshot = _snapshot(cache_state=CacheState.STALE)
    state = replace(
        snapshot.status.state,
        last_failure_at=_NOW,
        last_failure_code=ProviderFailureCode.TRANSPORT_UNAVAILABLE,
        consecutive_failures=1,
    )
    projection = _read(replace(snapshot, status=replace(snapshot.status, state=state)))

    assert projection.freshness.last_refresh_failure_code == "provider.transport_unavailable"
