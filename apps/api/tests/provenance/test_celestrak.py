"""CelesTrak selected-group provider and OMM normalization contracts."""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any, cast

import pytest
from lumina.provenance.composition import celestrak_runtime_config
from lumina.provenance.domain.celestrak import (
    CelestrakCodec,
    CelestrakNormalized,
    CelestrakSatellite,
)
from lumina.provenance.domain.provider import ProviderNormalizationFailed, ProviderPayloadInvalid
from lumina.provenance.domain.request_plan import ProviderComponentResult
from lumina.provenance.domain.runtime import (
    CELESTRAK_STATIONS_MAX_RESPONSE_BYTES,
    CELESTRAK_VISUAL_MAX_RESPONSE_BYTES,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.celestrak import (
    CelestrakAdapter,
    CelestrakComponentRequest,
    celestrak_request_plan,
    compose_celestrak_snapshot,
    load_celestrak_source_manifest,
)
from lumina.provenance.infrastructure.http import FixedHttpRequest

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider" / "celestrak"


@dataclass
class _ReplayTransport:
    outcomes: list[RawProviderResponse]
    requests: list[Any] = field(default_factory=list)

    async def request(
        self, request: Any, *, attempt_deadline: float | None = None
    ) -> RawProviderResponse:
        self.requests.append((request, attempt_deadline))
        return self.outcomes.pop(0)


def _fixture(name: str) -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], json.loads((_FIXTURES / name).read_text()))


def _raw(value: object, maximum: int, *, body: bytes | None = None) -> RawProviderResponse:
    encoded = body or json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=encoded,
        raw_complete=True,
        observed_bytes=len(encoded),
        content_type_valid=True,
        max_response_bytes=maximum,
    )


def _adapter() -> CelestrakAdapter:
    return CelestrakAdapter(_ReplayTransport([]), source_manifest=load_celestrak_source_manifest())


def _component(component_id: str) -> CelestrakComponentRequest:
    plan = celestrak_request_plan()
    for component in plan.components:
        if component.component_id == component_id:
            return cast(CelestrakComponentRequest, component.request)
    raise AssertionError(component_id)


def _normalized(component_id: str, fixture: str) -> tuple[CelestrakSatellite, ...]:
    request = _component(component_id)
    adapter = _adapter()
    maximum = request.max_response_bytes
    payload = adapter.validate_component_payload(request, _raw(_fixture(fixture), maximum))
    return cast(tuple[CelestrakSatellite, ...], adapter.normalize_component(request, payload))


def test_manifest_runtime_and_plan_are_exact() -> None:
    manifest = load_celestrak_source_manifest()
    config = celestrak_runtime_config()
    plan = celestrak_request_plan()
    assert manifest.source_id == "celestrak-gp"
    assert manifest.adapter_id == "celestrak-gp-selected-groups"
    assert manifest.source_schema_version == "celestrak-omm-json-v1"
    assert manifest.terms_or_licence_url == "https://celestrak.org/usage-policy.php"
    assert config.refresh_interval.total_seconds() == 7200
    assert config.fresh_ttl.total_seconds() == 10800
    assert config.stale_if_error_grace.total_seconds() == 75600
    assert plan.component_ids == ("stations", "visual")
    assert [cast(CelestrakComponentRequest, item.request).group for item in plan.components] == [
        "STATIONS",
        "VISUAL",
    ]


@pytest.mark.asyncio
async def test_fetch_uses_only_fixed_group_and_json_query() -> None:
    raw = _raw([], CELESTRAK_STATIONS_MAX_RESPONSE_BYTES)
    replay = _ReplayTransport([raw])
    adapter = CelestrakAdapter(replay, source_manifest=load_celestrak_source_manifest())
    request = _component("stations")
    await adapter.fetch(request, attempt_deadline=123.0)
    fixed, deadline = replay.requests[0]
    assert deadline == 123.0
    assert fixed.url == "https://celestrak.org/NORAD/elements/gp.php"
    assert fixed.params == (("GROUP", "STATIONS"), ("FORMAT", "JSON"))
    assert fixed.max_response_bytes == CELESTRAK_STATIONS_MAX_RESPONSE_BYTES


def test_fixtures_normalize_and_merge_identical_group_membership() -> None:
    stations = _normalized("stations", "stations.json")
    visual = _normalized("visual", "visual.json")
    assert stations[0].catalog_number == 25544
    assert stations[0].epoch_utc == "2026-06-19T12:16:41.638656Z"
    assert visual[1].catalog_number == 123456
    plan = celestrak_request_plan()
    snapshot = compose_celestrak_snapshot(
        plan,
        (
            ProviderComponentResult("stations", stations, "1" * 64),
            ProviderComponentResult("visual", visual, "2" * 64),
        ),
    )
    assert isinstance(snapshot, CelestrakNormalized)
    assert [item.catalog_number for item in snapshot.satellites] == [25544, 123456]
    assert snapshot.satellites[0].groups == ("STATIONS", "VISUAL")
    assert snapshot.satellites[1].groups == ("VISUAL",)
    assert CelestrakCodec().decode(CelestrakCodec().encode(snapshot)) == snapshot


def test_conflicting_duplicate_catalog_state_fails_atomic_snapshot() -> None:
    stations = _normalized("stations", "stations.json")
    visual = list(_normalized("visual", "visual.json"))
    visual[0] = replace(visual[0], mean_anomaly_deg=154.0)
    with pytest.raises(ProviderNormalizationFailed):
        compose_celestrak_snapshot(
            celestrak_request_plan(),
            (
                ProviderComponentResult("stations", stations, "1" * 64),
                ProviderComponentResult("visual", tuple(visual), "2" * 64),
            ),
        )


def test_duplicate_catalog_within_one_group_fails_payload_validation() -> None:
    value = _fixture("stations.json")
    value.append(copy.deepcopy(value[0]))
    adapter = _adapter()
    request = _component("stations")
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            request, _raw(value, CELESTRAK_STATIONS_MAX_RESPONSE_BYTES)
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("EPHEMERIS_TYPE", 1),
        ("ECCENTRICITY", 1.2),
        ("INCLINATION", 181.0),
        ("NORAD_CAT_ID", 1_000_000_000),
        ("OBJECT_NAME", "unsafe\u202e name"),
    ],
)
def test_unsupported_omm_contract_fails_closed(field: str, value: object) -> None:
    source = _fixture("stations.json")
    source[0][field] = value
    adapter = _adapter()
    request = _component("stations")
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            request, _raw(source, CELESTRAK_STATIONS_MAX_RESPONSE_BYTES)
        )


def test_duplicate_json_keys_and_nonfinite_values_fail_closed() -> None:
    adapter = _adapter()
    request = _component("stations")
    duplicate = b'[{"NORAD_CAT_ID":25544,"NORAD_CAT_ID":25544}]'
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            request,
            _raw([], CELESTRAK_STATIONS_MAX_RESPONSE_BYTES, body=duplicate),
        )
    body = json.dumps(_fixture("stations.json")).replace("15.49315858", "NaN").encode()
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            request, _raw([], CELESTRAK_STATIONS_MAX_RESPONSE_BYTES, body=body)
        )


def test_codec_rejects_snapshot_and_per_satellite_epoch_regression() -> None:
    stations = _normalized("stations", "stations.json")
    visual = _normalized("visual", "visual.json")
    current = compose_celestrak_snapshot(
        celestrak_request_plan(),
        (
            ProviderComponentResult("stations", stations, "1" * 64),
            ProviderComponentResult("visual", visual, "2" * 64),
        ),
    )
    codec = CelestrakCodec()
    encoded = codec.encode(current)
    regressed_satellites = tuple(
        replace(item, epoch_utc="2026-06-18T12:00:00.000000Z")
        if item.catalog_number == 25544
        else item
        for item in current.satellites
    )
    regressed = CelestrakNormalized(
        snapshot_latest_epoch_utc=max(
            regressed_satellites, key=lambda item: item.epoch_utc
        ).epoch_utc,
        satellites=regressed_satellites,
    )
    assert codec.accepts_replacement(encoded, codec.encode(regressed)) is False


def test_fixed_http_request_rejects_mutated_celestrak_queries() -> None:
    FixedHttpRequest(
        url="https://celestrak.org/NORAD/elements/gp.php",
        params=(("GROUP", "VISUAL"), ("FORMAT", "JSON")),
        expected_content_type="application/json",
        max_response_bytes=CELESTRAK_VISUAL_MAX_RESPONSE_BYTES,
        user_agent="Lumina/0.0 Phase-4D provider-sync",
    )
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://celestrak.org/NORAD/elements/gp.php",
            params=(("CATNR", "25544"), ("FORMAT", "JSON")),
            expected_content_type="application/json",
            max_response_bytes=CELESTRAK_VISUAL_MAX_RESPONSE_BYTES,
            user_agent="Lumina/0.0 Phase-4D provider-sync",
        )
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://celestrak.org/NORAD/elements/gp.php",
            params=(("GROUP", "STATIONS"), ("FORMAT", "CSV")),
            expected_content_type="application/json",
            max_response_bytes=CELESTRAK_STATIONS_MAX_RESPONSE_BYTES,
            user_agent="Lumina/0.0 Phase-4D provider-sync",
        )
