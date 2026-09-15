"""Launch Library 2 provider, normalization, and timing-honesty contracts."""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import pytest
from lumina.provenance.composition import launch_library_runtime_config
from lumina.provenance.domain.launch_library import (
    Ll2Codec,
    Ll2Normalized,
    launch_calendar_eligible,
    launch_countdown_eligible,
)
from lumina.provenance.domain.provider import ProviderNormalizationFailed, ProviderPayloadInvalid
from lumina.provenance.domain.runtime import LL2_MAX_RESPONSE_BYTES, RawProviderResponse
from lumina.provenance.infrastructure.http import FixedHttpRequest
from lumina.provenance.infrastructure.launch_library import (
    LaunchLibraryAdapter,
    LaunchLibraryRequest,
    load_launch_library_source_manifest,
)

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider"


@dataclass
class _ReplayTransport:
    outcomes: list[RawProviderResponse]
    requests: list[Any] = field(default_factory=list)

    async def request(
        self, request: Any, *, attempt_deadline: float | None = None
    ) -> RawProviderResponse:
        self.requests.append((request, attempt_deadline))
        return self.outcomes.pop(0)


def _fixture_value() -> dict[str, Any]:
    return cast(
        dict[str, Any], json.loads((_FIXTURES / "launch-library-upcoming.json").read_text())
    )


def _raw(value: object, *, body: bytes | None = None) -> RawProviderResponse:
    encoded = (
        body
        if body is not None
        else json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()
    )
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=encoded,
        raw_complete=True,
        observed_bytes=len(encoded),
        content_type_valid=True,
        max_response_bytes=LL2_MAX_RESPONSE_BYTES,
    )


def _adapter() -> tuple[LaunchLibraryAdapter, _ReplayTransport]:
    replay = _ReplayTransport([_raw(_fixture_value())])
    return LaunchLibraryAdapter(
        replay, source_manifest=load_launch_library_source_manifest()
    ), replay


def test_manifest_and_runtime_policy_are_exact() -> None:
    manifest = load_launch_library_source_manifest()
    config = launch_library_runtime_config()
    assert manifest.source_id == "launch-library-2"
    assert manifest.adapter_id == "launch-library-2-upcoming"
    assert manifest.source_schema_version == "ll2-upcoming-v2.3-json-v1"
    assert manifest.endpoint_or_base_url == "https://ll.thespacedevs.com/2.3.0/launches/upcoming/"
    assert manifest.capabilities == ("batch_fetch",)
    assert config.provider_code == "launch-library-2"
    assert config.refresh_interval.total_seconds() == 3600
    assert config.max_response_bytes == LL2_MAX_RESPONSE_BYTES


@pytest.mark.asyncio
async def test_fetch_uses_only_fixed_detailed_upcoming_request() -> None:
    adapter, replay = _adapter()
    request = LaunchLibraryRequest()
    await adapter.fetch(request, attempt_deadline=123.0)
    fixed, deadline = replay.requests[0]
    assert deadline == 123.0
    assert fixed.url == "https://ll.thespacedevs.com/2.3.0/launches/upcoming/"
    assert fixed.params == (
        ("format", "json"),
        ("limit", "20"),
        ("mode", "detailed"),
        ("ordering", "net"),
    )
    assert fixed.max_response_bytes == LL2_MAX_RESPONSE_BYTES


def test_fixture_normalizes_launches_and_preserves_timing_semantics() -> None:
    adapter, _ = _adapter()
    normalized = adapter.normalize(
        LaunchLibraryRequest(), adapter.validate_payload(_raw(_fixture_value()))
    )
    assert isinstance(normalized, Ll2Normalized)
    assert [launch.name for launch in normalized.launches] == [
        "Falcon 9 | Aurora Science 1",
        "Vega-C | Lunar Relay 2",
    ]
    exact, coarse = normalized.launches
    assert exact.status.abbreviation == "Go"
    assert exact.precision.abbreviation == "MIN"
    assert launch_countdown_eligible(exact) is True
    assert launch_calendar_eligible(exact) is True
    assert exact.official_page_url == "https://example.org/official-launch"
    assert exact.official_webcast_url == "https://www.youtube.com/watch?v=fixture"
    assert (
        exact.mission is not None
        and exact.mission.description
        == "A deterministic fixture mission for provider contract testing. Second source paragraph."
    )
    assert coarse.status.abbreviation == "TBC"
    assert coarse.precision.abbreviation == "DAY"
    assert launch_countdown_eligible(coarse) is False
    assert launch_calendar_eligible(coarse) is False
    assert coarse.vehicle is not None and coarse.vehicle.variant is None
    assert normalized.snapshot_latest_updated_utc == "2026-09-15T00:10:00Z"


def test_codec_round_trip_and_canonical_order_are_strict() -> None:
    adapter, _ = _adapter()
    normalized = adapter.normalize(
        LaunchLibraryRequest(), adapter.validate_payload(_raw(_fixture_value()))
    )
    codec = Ll2Codec()
    encoded = codec.encode(normalized)
    assert codec.decode(encoded) == normalized
    tampered = copy.deepcopy(dict(encoded))
    tampered_launches = cast(list[object], tampered["launches"])
    tampered_launches.reverse()
    with pytest.raises(ValueError, match="canonically ordered"):
        codec.decode(tampered)


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("results", 0, "status", "id"), 99),
        (("results", 0, "net_precision", "id"), 99),
        (("results", 0, "name"), "unsafe\u202e name"),
        (("results", 0, "pad", "country", "alpha_2_code"), "USA"),
    ],
)
def test_contract_drift_and_unsafe_text_fail_closed(
    path: tuple[object, ...], value: object
) -> None:
    source: Any = copy.deepcopy(_fixture_value())
    cursor: Any = source
    for key in path[:-1]:
        cursor = cursor[key]
    cursor[path[-1]] = value
    adapter, _ = _adapter()
    payload = adapter.validate_payload(_raw(source))
    with pytest.raises(ProviderNormalizationFailed):
        adapter.normalize(LaunchLibraryRequest(), payload)


def test_duplicate_json_keys_fail_payload_validation() -> None:
    adapter, _ = _adapter()
    body = b'{"count":0,"count":0,"results":[]}'
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_payload(_raw({}, body=body))


def test_untrusted_or_non_https_links_are_dropped_not_promoted() -> None:
    source = copy.deepcopy(_fixture_value())
    source["results"][0]["info_urls"] = [
        {
            "priority": 1,
            "url": "http://example.org/not-secure",
            "type": {"id": 1, "name": "Official Page"},
        },
        {
            "priority": 2,
            "url": "https://example.org/unofficial",
            "type": {"id": 3, "name": "Wikipedia"},
        },
    ]
    source["results"][0]["vid_urls"] = [
        {
            "priority": 1,
            "url": "javascript:alert(1)",
            "type": {"id": 1, "name": "Official Webcast"},
        },
    ]
    adapter, _ = _adapter()
    normalized = adapter.normalize(LaunchLibraryRequest(), adapter.validate_payload(_raw(source)))
    assert normalized.launches[0].official_page_url is None
    assert normalized.launches[0].official_webcast_url is None


def test_fixed_http_request_rejects_any_ll2_request_mutation() -> None:
    params = (("format", "json"), ("limit", "20"), ("mode", "detailed"), ("ordering", "net"))
    FixedHttpRequest(
        url="https://ll.thespacedevs.com/2.3.0/launches/upcoming/",
        params=params,
        expected_content_type="application/json",
        max_response_bytes=LL2_MAX_RESPONSE_BYTES,
        user_agent="Lumina/0.0 Phase-4C provider-sync",
    )
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://example.org/2.3.0/launches/upcoming/",
            params=params,
            expected_content_type="application/json",
            max_response_bytes=LL2_MAX_RESPONSE_BYTES,
            user_agent="Lumina/0.0 Phase-4C provider-sync",
        )
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://ll.thespacedevs.com/2.3.0/launches/upcoming/",
            params=(("limit", "100"),),
            expected_content_type="application/json",
            max_response_bytes=LL2_MAX_RESPONSE_BYTES,
            user_agent="Lumina/0.0 Phase-4C provider-sync",
        )
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://ll.thespacedevs.com/2.3.0/launches/upcoming/",
            params=params,
            expected_content_type="application/json",
            max_response_bytes=LL2_MAX_RESPONSE_BYTES - 1,
            user_agent="Lumina/0.0 Phase-4C provider-sync",
        )
