"""Deterministic NASA NeoWs feed adapter, codec, and science-semantics contracts."""

from __future__ import annotations

import copy
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import httpx
import pytest
from lumina.provenance.composition import nasa_neows_runtime_config
from lumina.provenance.domain.neows import (
    MAX_NEOWS_ENCOUNTERS,
    NEOWS_ENCOUNTER_FIELDS,
    NasaNeowsCodec,
    NasaNeowsNormalized,
    neows_encounter_id,
    neows_object_id,
)
from lumina.provenance.domain.provider import (
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
)
from lumina.provenance.domain.runtime import (
    NEOWS_MAX_RESPONSE_BYTES,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.http import BoundedHttpTransport, FixedHttpRequest
from lumina.provenance.infrastructure.nasa_neows import (
    NasaNeowsAdapter,
    NasaNeowsRequest,
    load_nasa_neows_source_manifest,
)
from pydantic import SecretStr

_NOW = datetime(2026, 9, 12, 0, 0, tzinfo=UTC)
_REQUEST = NasaNeowsRequest(
    start_date="2026-09-12",
    end_date="2026-09-18",
    api_key=SecretStr("fixture-neows-key-2026"),
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
        dict[str, Any],
        json.loads((_FIXTURES / "nasa-neows-feed.json").read_text(encoding="utf-8")),
    )


def _raw(value: object, *, body: bytes | None = None) -> RawProviderResponse:
    encoded = (
        body
        if body is not None
        else json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=encoded,
        raw_complete=True,
        observed_bytes=len(encoded),
        content_type_valid=True,
        max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
    )


def _adapter(
    transport: _ReplayTransport | None = None,
) -> tuple[NasaNeowsAdapter, _ReplayTransport]:
    replay = transport or _ReplayTransport([_raw(_fixture_value())])
    adapter = NasaNeowsAdapter(
        replay,
        api_key=SecretStr("fixture-neows-key-2026"),
        source_manifest=load_nasa_neows_source_manifest(),
        clock=lambda: _NOW,
    )
    return adapter, replay


def test_neows_manifest_and_identity_are_exact() -> None:
    manifest = load_nasa_neows_source_manifest()

    assert manifest.source_id == "nasa-neows"
    assert manifest.source_name == "NASA Asteroids NeoWs"
    assert manifest.adapter_id == "nasa-neows-feed"
    assert manifest.adapter_version == "1"
    assert manifest.source_schema_version == "neows-feed-v1-json-v1"
    assert manifest.endpoint_or_base_url == "https://api.nasa.gov/neo/rest/v1/feed"
    assert manifest.capabilities == ("batch_fetch",)
    assert manifest.source_page_url is None
    assert "uncertainty interval" in " ".join(manifest.known_limitations)
    assert manifest.normalized_fields == (
        "absolute_magnitude_h",
        "approach_date",
        "approach_time_text",
        "estimated_diameter_max_m",
        "estimated_diameter_min_m",
        "is_potentially_hazardous_asteroid",
        "name",
        "neo_reference_id",
        "nominal_distance_km",
        "nominal_distance_lunar",
        "provider_epoch_ms",
        "relative_velocity_km_s",
        "window_end_date",
        "window_start_date",
    )
    assert neows_object_id("3542519") == "nasa-neows-3542519"
    assert neows_encounter_id("3542519", "2026-09-14") == ("nasa-neows-3542519-2026-09-14")


@pytest.mark.asyncio
async def test_request_factory_freezes_one_utc_seven_day_window_and_redacts_key() -> None:
    adapter, transport = _adapter(_ReplayTransport([_raw(_fixture_value())]))

    request = adapter.new_request()
    assert request.start_date == "2026-09-12"
    assert request.end_date == "2026-09-18"
    assert request.operation == "batch_fetch"
    assert "fixture-neows-key-2026" not in repr(request)
    await adapter.fetch(request)

    fixed = transport.requests[0][0]
    assert fixed.url == "https://api.nasa.gov/neo/rest/v1/feed"
    assert fixed.params == (
        ("start_date", "2026-09-12"),
        ("end_date", "2026-09-18"),
        ("api_key", "fixture-neows-key-2026"),
    )
    assert fixed.max_response_bytes == NEOWS_MAX_RESPONSE_BYTES
    assert "fixture-neows-key-2026" not in repr(fixed)


def test_valid_fixture_normalizes_one_event_per_earth_close_approach() -> None:
    adapter, _ = _adapter()
    payload = adapter.validate_payload(_raw(_fixture_value()))
    normalized = adapter.normalize(_REQUEST, payload)

    assert isinstance(normalized, NasaNeowsNormalized)
    assert len(normalized.encounters) == 3
    assert [entry.neo_reference_id for entry in normalized.encounters] == [
        "2000001",
        "3542519",
        "3000002",
    ]
    assert [entry.approach_date for entry in normalized.encounters] == [
        "2026-09-14",
        "2026-09-14",
        "2026-09-17",
    ]
    assert normalized.encounters[0].is_potentially_hazardous_asteroid is True
    assert normalized.encounters[1].is_potentially_hazardous_asteroid is False
    assert normalized.encounters[0].nominal_distance_km == 3_500_000.0
    assert normalized.encounters[0].estimated_diameter_min_m == 180.0
    assert normalized.encounters[0].estimated_diameter_max_m == 410.0
    assert normalized.encounters[1].approach_time_text == "2026-Sep-14 10:20"
    assert {entry.approach_date for entry in normalized.encounters} == {
        "2026-09-14",
        "2026-09-17",
    }


def test_neows_rejects_provider_text_that_would_reflect_the_server_key() -> None:
    value = _fixture_value()
    value["near_earth_objects"]["2026-09-14"][0]["name"] = "fixture-neows-key-2026"
    adapter, _ = _adapter()

    payload = adapter.validate_payload(_raw(value))
    with pytest.raises(ProviderNormalizationFailed):
        adapter.normalize(_REQUEST, payload)


def test_codec_round_trip_is_nested_canonical_and_omits_provider_links_and_sentry() -> None:
    adapter, _ = _adapter()
    normalized = adapter.normalize(_REQUEST, adapter.validate_payload(_raw(_fixture_value())))

    encoded = NasaNeowsCodec().encode(normalized)
    decoded = NasaNeowsCodec().decode(encoded)

    assert decoded == normalized
    assert set(encoded) == {"window_start_date", "window_end_date", "encounters"}
    encounters = encoded["encounters"]
    assert isinstance(encounters, list)
    first_encounter = encounters[0]
    assert isinstance(first_encounter, dict)
    assert set(first_encounter) == set(NEOWS_ENCOUNTER_FIELDS)
    rendered = json.dumps(encoded, sort_keys=True)
    assert "nasa_jpl_url" not in rendered
    assert "is_sentry_object" not in rendered
    assert "api_key" not in rendered


@pytest.mark.parametrize(
    "body",
    [
        b"{not-json",
        b"\xff",
        b"[]",
        b'{"near_earth_objects":{},"near_earth_objects":{}}',
        b'{"near_earth_objects":{"2026-09-12":[]},"extra":NaN}',
    ],
)
def test_neows_rejects_malformed_json_duplicate_keys_and_wrong_top_level(body: bytes) -> None:
    adapter, _ = _adapter()
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_payload(_raw({}, body=body))


@pytest.mark.parametrize(
    "mutator",
    [
        lambda value: value["near_earth_objects"]["2026-09-14"][0].pop("neo_reference_id"),
        lambda value: value["near_earth_objects"]["2026-09-14"][0].update(
            {"neo_reference_id": "3.542519e6"}
        ),
        lambda value: value["near_earth_objects"]["2026-09-14"][0].update(
            {"neo_reference_id": "03542519"}
        ),
        lambda value: value["near_earth_objects"]["2026-09-14"][0]["close_approach_data"].clear(),
        lambda value: value["near_earth_objects"]["2026-09-14"][0]["close_approach_data"][0][
            "miss_distance"
        ].update({"kilometers": "1 km"}),
        lambda value: value["near_earth_objects"]["2026-09-14"][0]["close_approach_data"][0][
            "miss_distance"
        ].update({"kilometers": "-1"}),
        lambda value: value["near_earth_objects"]["2026-09-14"][0]["estimated_diameter"][
            "meters"
        ].update({"estimated_diameter_min": 20.0, "estimated_diameter_max": 10.0}),
        lambda value: value["near_earth_objects"]["2026-09-14"][0].update(
            {"is_potentially_hazardous_asteroid": "false"}
        ),
        lambda value: value["near_earth_objects"].update({"2026-02-30": []}),
    ],
)
def test_neows_rejects_invalid_consumed_fields(mutator: Any) -> None:
    value = _fixture_value()
    mutator(value)
    adapter, _ = _adapter()

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_payload(_raw(value))


def test_neows_rejects_out_of_window_bucket_and_wrong_body_during_normalization() -> None:
    value = _fixture_value()
    moved = value["near_earth_objects"].pop("2026-09-17")
    value["near_earth_objects"]["2026-09-20"] = moved
    adapter, _ = _adapter()
    payload = adapter.validate_payload(_raw(value))
    with pytest.raises(ProviderNormalizationFailed):
        adapter.normalize(_REQUEST, payload)

    value = _fixture_value()
    value["near_earth_objects"]["2026-09-14"][0]["close_approach_data"][0]["orbiting_body"] = "Mars"
    payload = adapter.validate_payload(_raw(value))
    with pytest.raises(ProviderNormalizationFailed):
        adapter.normalize(_REQUEST, payload)


def test_neows_rejects_duplicate_matching_earth_approaches_without_an_ordinal() -> None:
    value = _fixture_value()
    approach = copy.deepcopy(value["near_earth_objects"]["2026-09-14"][0]["close_approach_data"][0])
    value["near_earth_objects"]["2026-09-14"][0]["close_approach_data"].append(approach)
    adapter, _ = _adapter()
    payload = adapter.validate_payload(_raw(value))

    with pytest.raises(ProviderNormalizationFailed):
        adapter.normalize(_REQUEST, payload)


def test_empty_feed_is_a_valid_successful_normalization() -> None:
    adapter, _ = _adapter(_ReplayTransport([_raw({"near_earth_objects": {}})]))
    payload = adapter.validate_payload(_raw({"near_earth_objects": {}}))

    assert adapter.normalize(_REQUEST, payload) == NasaNeowsNormalized(
        window_start_date="2026-09-12",
        window_end_date="2026-09-18",
        encounters=(),
    )


def test_neows_codec_rejects_noncanonical_order_and_duplicate_cached_event() -> None:
    adapter, _ = _adapter()
    normalized = adapter.normalize(_REQUEST, adapter.validate_payload(_raw(_fixture_value())))
    encoded = dict(NasaNeowsCodec().encode(normalized))
    encounters = list(encoded["encounters"])  # type: ignore[arg-type]
    encoded["encounters"] = list(reversed(encounters))
    with pytest.raises(ValueError):
        NasaNeowsCodec().decode(encoded)

    duplicate = list(encounters)
    duplicate.append(copy.deepcopy(duplicate[0]))
    encoded["encounters"] = duplicate
    with pytest.raises(ValueError):
        NasaNeowsCodec().decode(encoded)


def test_neows_codec_enforces_bounded_encounter_count() -> None:
    adapter, _ = _adapter()
    normalized = adapter.normalize(_REQUEST, adapter.validate_payload(_raw(_fixture_value())))
    encounter = normalized.encounters[0]
    oversized = NasaNeowsNormalized(
        window_start_date="2026-09-12",
        window_end_date="2026-09-18",
        encounters=tuple(
            NasaNeowsNormalized(
                window_start_date="2026-09-12",
                window_end_date="2026-09-18",
                encounters=(),
            ).encounters
        )
        + tuple(encounter for _ in range(MAX_NEOWS_ENCOUNTERS + 1)),
    )
    with pytest.raises(ValueError):
        NasaNeowsCodec().encode(oversized)


@pytest.mark.asyncio
async def test_neows_transport_enforces_its_one_megabyte_raw_bound() -> None:
    class OversizedStream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield b"x" * NEOWS_MAX_RESPONSE_BYTES
            yield b"x"

        async def aclose(self) -> None:
            return None

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            stream=OversizedStream(),
            request=request,
        )

    transport = BoundedHttpTransport(
        timeout=nasa_neows_runtime_config().timeout,
        client_factory=lambda *, timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(handler), timeout=timeout
        ),
    )
    request = FixedHttpRequest(
        url="https://api.nasa.gov/neo/rest/v1/feed",
        params=(
            ("start_date", "2026-09-12"),
            ("end_date", "2026-09-18"),
            ("api_key", "fixture-neows-key-2026"),
        ),
        expected_content_type="application/json",
        max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
        user_agent="Lumina/0.0 Phase-4B provider-sync",
    )

    raw = await transport.request(request)

    assert raw.raw_complete is False
    assert raw.observed_bytes == NEOWS_MAX_RESPONSE_BYTES + 1
    assert len(raw.body) == NEOWS_MAX_RESPONSE_BYTES
    assert raw.max_response_bytes == NEOWS_MAX_RESPONSE_BYTES


def test_neows_fixed_request_rejects_noncanonical_route_query_and_dates() -> None:
    def make_request(params: tuple[tuple[str, str], ...]) -> FixedHttpRequest:
        return FixedHttpRequest(
            url="https://api.nasa.gov/neo/rest/v1/feed",
            params=params,
            expected_content_type="application/json",
            max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
            user_agent="Lumina/0.0 Phase-4B provider-sync",
        )

    with pytest.raises(ValueError):
        make_request(
            params=(
                ("start_date", "2026-09-12"),
                ("end_date", "2026-09-18"),
                ("api_key", "fixture-neows-key-2026"),
                ("unexpected", "1"),
            ),
        )
    with pytest.raises(ValueError):
        make_request(
            params=(
                ("start_date", "2026-٠٩-12"),
                ("end_date", "2026-09-18"),
                ("api_key", "fixture-neows-key-2026"),
            ),
        )
    with pytest.raises(ValueError):
        make_request(
            params=(
                ("start_date", "2026-02-30"),
                ("end_date", "2026-03-06"),
                ("api_key", "fixture-neows-key-2026"),
            ),
        )


@pytest.mark.asyncio
async def test_neows_raw_response_repr_and_quarantine_evidence_redact_key_bearing_links() -> None:
    key = "fixture-neows-key-2026"
    body = (
        '{"near_earth_objects": {}, "links": '
        f'{{"self":"https://api.nasa.gov/neo/rest/v1/feed?api_key={key}"}}}}'
    ).encode()
    adapter, _ = _adapter(_ReplayTransport([_raw({}, body=body)]))

    raw = await adapter.fetch(_REQUEST)

    assert isinstance(raw, RawProviderResponse)
    assert key.encode() in raw.body
    assert raw.quarantine_body is not None
    assert key.encode() not in raw.quarantine_body
    assert b"api_key=<redacted>" in raw.quarantine_body
    assert key not in repr(raw)


@pytest.mark.asyncio
async def test_neows_quarantine_redaction_handles_json_escaped_secret_without_growth() -> None:
    key = 'a"b\\c'
    body = json.dumps({"echo": key}, separators=(",", ":")).encode("utf-8")
    replay = _ReplayTransport([_raw({}, body=body)])
    adapter = NasaNeowsAdapter(
        replay,
        api_key=SecretStr(key),
        source_manifest=load_nasa_neows_source_manifest(),
        clock=lambda: _NOW,
    )

    raw = await adapter.fetch(
        NasaNeowsRequest(
            start_date="2026-09-12",
            end_date="2026-09-18",
            api_key=SecretStr(key),
        )
    )

    assert isinstance(raw, RawProviderResponse)
    assert raw.quarantine_body is not None
    assert len(raw.quarantine_body) <= len(body)
    assert json.loads(raw.quarantine_body.decode("utf-8"))["echo"] != key


@pytest.mark.asyncio
async def test_neows_short_key_redaction_stays_within_the_raw_response_bound() -> None:
    key = "x"
    body = key.encode("ascii") * NEOWS_MAX_RESPONSE_BYTES
    replay = _ReplayTransport([_raw({}, body=body)])
    adapter = NasaNeowsAdapter(
        replay,
        api_key=SecretStr(key),
        source_manifest=load_nasa_neows_source_manifest(),
        clock=lambda: _NOW,
    )

    raw = await adapter.fetch(
        NasaNeowsRequest(
            start_date="2026-09-12",
            end_date="2026-09-18",
            api_key=SecretStr(key),
        )
    )

    assert isinstance(raw, RawProviderResponse)
    assert raw.quarantine_body is not None
    assert len(raw.quarantine_body) == NEOWS_MAX_RESPONSE_BYTES
    assert key.encode("ascii") not in raw.quarantine_body
