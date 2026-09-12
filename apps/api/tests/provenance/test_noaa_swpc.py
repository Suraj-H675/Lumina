"""Offline NOAA SWPC component, checksum, and strict-normalization contracts."""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Final, cast

import pytest
from lumina.provenance.domain.provider import ProviderPayloadInvalid
from lumina.provenance.domain.request_plan import ProviderComponentResult
from lumina.provenance.domain.runtime import RawProviderResponse
from lumina.provenance.domain.space_weather import (
    SwpcCodec,
    SwpcKpRow,
    SwpcNormalized,
    SwpcNotification,
    SwpcScales,
    SwpcScaleState,
    SwpcSolarWindField,
    SwpcSolarWindSpeed,
    SwpcSourceEvidence,
)
from lumina.provenance.infrastructure.http import FixedHttpRequest
from lumina.provenance.infrastructure.noaa_swpc import (
    NoaaSwpcAdapter,
    SwpcComponentRequest,
    compose_swpc_snapshot,
    load_noaa_swpc_source_manifest,
    noaa_swpc_request_plan,
)

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider" / "noaa-swpc"
_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_COMPONENT_FILES: Final = (
    "scales.json",
    "kp.json",
    "solar-wind-speed.json",
    "solar-wind-field.json",
    "notifications.json",
)
_COMPONENT_IDS: Final = (
    "scales",
    "kp",
    "solar_wind_speed",
    "solar_wind_field",
    "notifications",
)
_COMPONENT_LIMITS: Final = (16_384, 65_536, 8_192, 8_192, 131_072)
_EXPECTED_COMPONENT_SHA: Final = (
    "0445bfe1ab92640e87f879e9e9debbf057ffb8e523062e55f35a9b09f8f46f39",
    "93ea8c14150c4f87f208982d2b5e0018d050dfbb1901db1226151ddc122a2be3",
    "11004e42882430e4b1482738162a79b505f39a689c0daa4d0733164f7249838c",
    "888443279ad685ecb21beebed7f5afd130d24acfc1721244408466907463bcac",
    "65d4acb26dd065e3a6a8341899d3802985b20bd94f73607f0aaf034e3c7fc22d",
)
_EXPECTED_AGGREGATE_SHA = "78b5c384c71ab8d923a8c51231d94b4c0ffdac1951d37828ee92d6023a5dbc6d"


def _body(filename: str) -> bytes:
    return (_FIXTURES / filename).read_bytes()


def _raw(body: bytes, maximum: int, *, content_type_valid: bool = True) -> RawProviderResponse:
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=content_type_valid,
        max_response_bytes=maximum,
    )


@dataclass
class _Transport:
    responses: list[RawProviderResponse]
    requests: list[FixedHttpRequest] = field(default_factory=list)

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        del attempt_deadline
        self.requests.append(request)
        return self.responses.pop(0)


def _adapter(transport: _Transport) -> NoaaSwpcAdapter:
    return NoaaSwpcAdapter(
        transport,
        source_manifest=load_noaa_swpc_source_manifest(_REPOSITORY_ROOT),
    )


def test_request_plan_is_exactly_the_five_fixed_products() -> None:
    plan = noaa_swpc_request_plan()

    assert plan.component_ids == _COMPONENT_IDS
    assert tuple(component.max_response_bytes for component in plan.components) == _COMPONENT_LIMITS
    assert plan.max_total_response_bytes == 262_144
    assert tuple(
        cast(SwpcComponentRequest, component.request).path for component in plan.components
    ) == (
        "/products/noaa-scales.json",
        "/products/noaa-planetary-k-index-forecast.json",
        "/products/summary/solar-wind-speed.json",
        "/products/summary/solar-wind-mag-field.json",
        "/products/alerts.json",
    )


def test_adapter_normalizes_all_components_and_preserves_science_statuses() -> None:
    transport = _Transport(
        [
            _raw(_body(filename), maximum)
            for filename, maximum in zip(_COMPONENT_FILES, _COMPONENT_LIMITS, strict=True)
        ]
    )
    adapter = _adapter(transport)
    plan = noaa_swpc_request_plan()
    results: list[ProviderComponentResult] = []

    async def collect() -> None:
        for component in plan.components:
            raw = await adapter.fetch(component.request)
            assert isinstance(raw, RawProviderResponse)
            validated = adapter.validate_component_payload(component.request, raw)
            normalized = adapter.normalize_component(component.request, validated)
            results.append(
                ProviderComponentResult(
                    component_id=component.component_id,
                    normalized=normalized,
                    raw_sha256=hashlib.sha256(raw.body).hexdigest(),
                )
            )

    asyncio.run(collect())
    snapshot = compose_swpc_snapshot(plan, tuple(results))
    assert isinstance(snapshot, SwpcNormalized)
    assert snapshot.scales.radio_blackout.level == 2
    assert snapshot.scales.solar_radiation.level == 1
    assert snapshot.scales.geomagnetic.level == 3
    assert [row.status for row in snapshot.kp_rows] == [
        "observed",
        "estimated",
        "predicted",
        "predicted",
    ]
    assert snapshot.kp_rows[1].noaa_scale is None
    assert snapshot.solar_wind_speed.proton_speed_km_s == 404.0
    assert snapshot.solar_wind_field.bt_nt == 6.0
    assert snapshot.solar_wind_field.bz_gsm_nt == -3.0
    assert snapshot.notifications[0].message.startswith("CONTINUED ALERT:")

    encoded = SwpcCodec().encode(snapshot)
    decoded = SwpcCodec().decode(encoded)
    assert decoded == snapshot
    assert (
        tuple(
            getattr(snapshot.source_evidence, f"{component_id}_sha256")
            for component_id in (
                "scales",
                "kp",
                "solar_wind_speed",
                "solar_wind_field",
                "notifications",
            )
        )
        == _EXPECTED_COMPONENT_SHA
    )
    assert plan.aggregate_sha256(tuple(_body(filename) for filename in _COMPONENT_FILES)) == (
        _EXPECTED_AGGREGATE_SHA
    )


def _canonical_ordering_fixture() -> SwpcNormalized:
    return SwpcNormalized(
        scales=SwpcScales(
            date_text="2026-09-12",
            time_text="06:57:00",
            radio_blackout=SwpcScaleState(0, "quiet"),
            solar_radiation=SwpcScaleState(0, "quiet"),
            geomagnetic=SwpcScaleState(0, "quiet"),
        ),
        kp_rows=(
            SwpcKpRow("2026-09-12T00:00:00", 1.0, "observed", None),
            SwpcKpRow("2026-09-12T06:00:00", 2.0, "observed", None),
            SwpcKpRow("2026-09-12T09:00:00", 3.0, "estimated", "G1"),
        ),
        solar_wind_speed=SwpcSolarWindSpeed(None, None),
        solar_wind_field=SwpcSolarWindField(None, None, None),
        notifications=(
            SwpcNotification("NEW", "2026-09-12 06:00:00", "newest"),
            SwpcNotification("OLD", "2026-09-12 05:00:00", "older"),
        ),
        source_evidence=SwpcSourceEvidence(*(["a" * 64] * 5)),
    )


def test_swpc_codec_accepts_canonical_order_and_rejects_reordered_storage() -> None:
    codec = SwpcCodec()
    canonical = _canonical_ordering_fixture()
    encoded = codec.encode(canonical)

    assert codec.decode(encoded).kp_rows[1].time_text == "2026-09-12T06:00:00"
    assert codec.decode(encoded).notifications[0].product_id == "NEW"

    unicode_value = replace(
        canonical,
        scales=replace(
            canonical.scales,
            radio_blackout=SwpcScaleState(0, "activité — quiet"),
        ),
        notifications=(
            SwpcNotification("NEW", "2026-09-12 06:00:00", "Aurora – activité"),
            canonical.notifications[1],
        ),
    )
    assert codec.decode(codec.encode(unicode_value)) == unicode_value

    reordered = dict(encoded)
    kp_rows = encoded["kp_rows"]
    notifications = encoded["notifications"]
    assert isinstance(kp_rows, list)
    assert isinstance(notifications, list)
    reordered["kp_rows"] = [kp_rows[1], kp_rows[0], kp_rows[2]]
    reordered["notifications"] = [notifications[1], notifications[0]]

    # Before the codec assertion, these persisted positions would have made
    # the public "latest" and first-notification projections select old data.
    assert reordered["kp_rows"][1]["time_text"] == "2026-09-12T00:00:00"
    assert reordered["notifications"][0]["product_id"] == "OLD"

    with pytest.raises(ValueError, match="canonically ordered"):
        codec.decode(reordered)


def test_swpc_codec_keeps_status_and_tie_break_order_deterministic() -> None:
    codec = SwpcCodec()
    fixture = _canonical_ordering_fixture()
    canonical = replace(
        fixture,
        kp_rows=(
            SwpcKpRow("2026-09-12T06:00:00", 1.0, "observed", None),
            SwpcKpRow("2026-09-12T06:00:00", 2.0, "estimated", None),
            SwpcKpRow("2026-09-12T06:00:00", 3.0, "predicted", "G1"),
        ),
        notifications=(
            SwpcNotification("B", "2026-09-12 06:00:00", "same time, B"),
            SwpcNotification("A", "2026-09-12 06:00:00", "same time, A"),
        ),
    )
    encoded = codec.encode(canonical)
    assert codec.decode(encoded) == canonical

    reordered = dict(encoded)
    kp_rows = encoded["kp_rows"]
    notifications = encoded["notifications"]
    assert isinstance(kp_rows, list)
    assert isinstance(notifications, list)
    reordered["kp_rows"] = [kp_rows[1], kp_rows[0], kp_rows[2]]
    reordered["notifications"] = [notifications[1], notifications[0]]

    with pytest.raises(ValueError, match="canonically ordered"):
        codec.decode(reordered)


@pytest.mark.parametrize(
    ("component_index", "mutator"),
    [
        (0, lambda value: {**value, "0": {**value["0"], "R": {"Scale": "6"}}}),
        (1, lambda value: [{**value[0], "observed": "unknown"}]),
        (2, lambda value: [{**value[0], "proton_speed": -1}]),
        (3, lambda value: [{**value[0], "bt": -1}]),
        (4, lambda value: [{**value[0], "message": "x" * 16_385}]),
    ],
)
def test_component_contract_failures_are_rejected(
    component_index: int,
    mutator: object,
) -> None:
    value = json.loads(_body(_COMPONENT_FILES[component_index]))
    mutated = mutator(value)  # type: ignore[operator]
    body = json.dumps(mutated, separators=(",", ":")).encode()
    adapter = _adapter(_Transport([]))
    component = noaa_swpc_request_plan().components[component_index]

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            component.request,
            _raw(body, component.max_response_bytes),
        )


@pytest.mark.parametrize(
    ("component_index", "mutator"),
    [
        (
            0,
            lambda value: {
                **value,
                "0": {**value["0"], "R": {**value["0"]["R"], "Text": "safe\u202ecod.exe"}},
            },
        ),
        (
            4,
            lambda value: [{**value[0], "message": "safe\u2066notification"}],
        ),
    ],
)
def test_swpc_rejects_unicode_format_controls_in_provider_text(
    component_index: int,
    mutator: object,
) -> None:
    value = json.loads(_body(_COMPONENT_FILES[component_index]))
    mutated = mutator(value)  # type: ignore[operator]
    body = json.dumps(mutated, separators=(",", ":")).encode()
    adapter = _adapter(_Transport([]))
    component = noaa_swpc_request_plan().components[component_index]

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            component.request,
            _raw(body, component.max_response_bytes),
        )


def test_duplicate_keys_and_nonfinite_numbers_are_rejected() -> None:
    adapter = _adapter(_Transport([]))
    plan = noaa_swpc_request_plan()
    scales = plan.components[0]
    kp = plan.components[1]

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            scales.request,
            _raw(
                b'{"0":{"DateStamp":"2026-09-12","TimeStamp":"06:57:00",'
                b'"R":{"Scale":"0","Text":"none"},"R":{"Scale":"1"},'
                b'"S":{"Scale":"0"},"G":{"Scale":"0"}}}',
                scales.max_response_bytes,
            ),
        )
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            kp.request,
            _raw(
                b'[{"time_tag":"2026-09-12T00:00:00","kp":NaN,'
                b'"observed":"observed","noaa_scale":null}]',
                kp.max_response_bytes,
            ),
        )
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(
            kp.request,
            _raw(
                json.dumps(
                    [
                        {
                            "time_tag": "2026-09-12T00:00:00",
                            "kp": int("9" * 309),
                            "observed": "observed",
                            "noaa_scale": None,
                        }
                    ],
                    separators=(",", ":"),
                ).encode(),
                kp.max_response_bytes,
            ),
        )


def test_swpc_fixed_http_boundary_rejects_arbitrary_paths() -> None:
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://services.swpc.noaa.gov/products/not-approved.json",
            params=(),
            expected_content_type="application/json",
            max_response_bytes=16_384,
            user_agent="Lumina/0.0 Phase-4B provider-sync",
        )
