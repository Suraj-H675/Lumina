"""Offline Zooniverse Panoptes request, parsing, and cache contracts."""

from __future__ import annotations

import asyncio
import hashlib
import json
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Final, cast

import pytest
from lumina.provenance.domain.citizen_science import (
    PANOPTES_COMPONENT_IDS,
    PanoptesCodec,
    PanoptesNormalized,
    PanoptesProjectStatus,
)
from lumina.provenance.domain.provider import (
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from lumina.provenance.domain.request_plan import ProviderComponentResult
from lumina.provenance.domain.runtime import NormalizedJsonValue, RawProviderResponse
from lumina.provenance.infrastructure.http import FixedHttpRequest
from lumina.provenance.infrastructure.zooniverse_panoptes import (
    PanoptesComponentRequest,
    ZooniversePanoptesAdapter,
    compose_panoptes_snapshot,
    load_zooniverse_panoptes_source_manifest,
    zooniverse_panoptes_request_plan,
)

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider" / "zooniverse-panoptes"
_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_EXPECTED_COMPONENT_SHA: Final = (
    "49bf7f739dc739cc3addba61b57dbbdb3fe90e2153bd0f3695674d07d4cbd423",
    "3684f6e3c21748c01eff2098c549e2030b4473277c55819440456f401144cb79",
    "94cba9644a669baa909a7f670f68e247c3c23f24093870cc4b05ff11b51b171e",
    "c9d0e986482d09ef0653587b3604ab4def45bc4f7a496c1bcb7ca3c19c111777",
    "59982005dd7b65658cc72f9ec5b6ac990b8c3cfef0b8b8dbaa10f979c4653f63",
    "6111823ab48631d4ba18d333c180f12f148903c7510c7fda7115027c4e2ffc6b",
)
_EXPECTED_AGGREGATE_SHA: Final = "a6121ddfb4369ffbc8cdc151c3d1865da5aa59e86f871854796ada2c649e2873"
_EXPECTED_PATHS: Final = (
    "/api/projects/5733",
    "/api/projects/7929",
    "/api/projects/19413",
    "/api/projects/13175",
    "/api/projects/6801",
    "/api/projects/13718",
)


def _body(component_id: str) -> bytes:
    return (_FIXTURES / f"{component_id}.json").read_bytes()


def _raw(body: bytes, *, content_type_valid: bool = True) -> RawProviderResponse:
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/vnd.api+json; charset=utf-8"},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=content_type_valid,
        max_response_bytes=32_768,
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


def _adapter(transport: _Transport) -> ZooniversePanoptesAdapter:
    return ZooniversePanoptesAdapter(
        transport,
        source_manifest=load_zooniverse_panoptes_source_manifest(_REPOSITORY_ROOT),
    )


def test_request_plan_is_exactly_six_direct_project_gets() -> None:
    plan = zooniverse_panoptes_request_plan()

    assert plan.component_ids == PANOPTES_COMPONENT_IDS
    assert len(plan.components) == 6
    assert tuple(component.max_response_bytes for component in plan.components) == (32_768,) * 6
    assert plan.max_total_response_bytes == 196_608
    assert (
        tuple(
            cast(PanoptesComponentRequest, component.request).path for component in plan.components
        )
        == _EXPECTED_PATHS
    )
    assert tuple(
        cast(PanoptesComponentRequest, component.request).project_id
        for component in plan.components
    ) == (5733, 7929, 19413, 13175, 6801, 13718)


def test_adapter_uses_exact_versioned_accept_header_and_fixed_paths() -> None:
    transport = _Transport([_raw(_body("galaxy-zoo"))])
    adapter = _adapter(transport)
    request = zooniverse_panoptes_request_plan().components[0].request

    asyncio.run(adapter.fetch(request))

    assert len(transport.requests) == 1
    sent = transport.requests[0]
    assert sent.url == "https://www.zooniverse.org/api/projects/5733"
    assert sent.params == ()
    assert sent.expected_content_type == "application/vnd.api+json"
    assert sent.accept_header == "application/vnd.api+json; version=1"
    assert sent.max_response_bytes == 32_768
    assert sent.user_agent == "Lumina/0.0 Phase-8A provider-sync"


def test_adapter_normalizes_all_components_and_discards_provider_prose() -> None:
    plan = zooniverse_panoptes_request_plan()
    transport = _Transport([_raw(_body(component_id)) for component_id in plan.component_ids])
    adapter = _adapter(transport)
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
    snapshot = compose_panoptes_snapshot(plan, tuple(results))
    assert isinstance(snapshot, PanoptesNormalized)
    assert [item.project_id for item in snapshot.projects] == [
        5733,
        7929,
        19413,
        13175,
        6801,
        13718,
    ]
    assert all(item.live is True and item.private is False for item in snapshot.projects)
    assert tuple(item.raw_sha256 for item in snapshot.source_evidence) == _EXPECTED_COMPONENT_SHA

    encoded = PanoptesCodec().encode(snapshot)
    decoded = PanoptesCodec().decode(encoded)
    assert decoded == snapshot
    serialized = json.dumps(encoded, sort_keys=True)
    for forbidden in (
        "display_name",
        "description",
        "classifications_count",
        "users_count",
        "urls",
        "tags",
        "provider-controlled",
    ):
        assert forbidden not in serialized
    assert plan.aggregate_sha256(tuple(_body(item) for item in plan.component_ids)) == (
        _EXPECTED_AGGREGATE_SHA
    )


def test_private_and_not_live_are_preserved_as_source_status_facts() -> None:
    body = json.loads(_body("galaxy-zoo"))
    body["projects"][0]["private"] = True
    body["projects"][0]["live"] = False
    raw = _raw(json.dumps(body).encode())
    adapter = _adapter(_Transport([raw]))
    request = zooniverse_panoptes_request_plan().components[0].request

    parsed = adapter.validate_component_payload(request, raw)

    assert isinstance(parsed, PanoptesProjectStatus)
    assert parsed.private is True
    assert parsed.live is False


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("id", "999999"),
        ("slug", "invented/project"),
        ("private", "false"),
        ("live", 1),
        ("updated_at", "not-a-date"),
    ],
)
def test_adapter_rejects_project_identity_or_status_drift(
    field: str,
    replacement: object,
) -> None:
    body = json.loads(_body("galaxy-zoo"))
    body["projects"][0][field] = replacement
    raw = _raw(json.dumps(body).encode())
    adapter = _adapter(_Transport([raw]))
    request = zooniverse_panoptes_request_plan().components[0].request

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(request, raw)


def test_adapter_rejects_duplicate_keys_or_non_single_project_envelope() -> None:
    adapter = _adapter(_Transport([]))
    request = zooniverse_panoptes_request_plan().components[0].request
    duplicate = _raw(
        b'{"projects":[{"id":"5733","id":"5733","slug":"zookeeper/galaxy-zoo",'
        b'"private":false,"live":true,"updated_at":"2026-09-19T07:52:56.026Z"}]}'
    )
    multiple = json.loads(_body("galaxy-zoo"))
    multiple["projects"].append(dict(multiple["projects"][0]))

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(request, duplicate)
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_component_payload(request, _raw(json.dumps(multiple).encode()))


def test_adapter_rejects_transport_contract_drift() -> None:
    adapter = _adapter(_Transport([]))
    request = zooniverse_panoptes_request_plan().components[0].request
    good = _raw(_body("galaxy-zoo"))

    for raw in (
        replace(good, status_code=404),
        replace(good, content_type_valid=False),
        RawProviderResponse(
            status_code=200,
            headers={},
            body=good.body,
            raw_complete=False,
            observed_bytes=len(good.body) + 1,
            content_type_valid=False,
            max_response_bytes=32_768,
        ),
    ):
        with pytest.raises(ProviderPayloadInvalid):
            adapter.validate_component_payload(request, raw)


def test_component_request_and_fixed_http_request_reject_unapproved_paths() -> None:
    with pytest.raises(ProviderRequestRejected):
        PanoptesComponentRequest(
            component_id="galaxy-zoo",
            project_id=5733,
            slug="zookeeper/galaxy-zoo",
            path="/api/projects/999999",
            max_response_bytes=32_768,
        )
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://www.zooniverse.org/api/projects/999999",
            params=(),
            expected_content_type="application/vnd.api+json",
            max_response_bytes=32_768,
            user_agent="Lumina/0.0 Phase-8A provider-sync",
            accept_header="application/vnd.api+json; version=1",
        )
    with pytest.raises(ValueError):
        FixedHttpRequest(
            url="https://www.zooniverse.org/api/projects/5733",
            params=(),
            expected_content_type="application/vnd.api+json",
            max_response_bytes=32_768,
            user_agent="Lumina/0.0 Phase-8A provider-sync",
            accept_header=None,
        )


def test_codec_and_composer_reject_identity_order_or_incomplete_snapshots() -> None:
    plan = zooniverse_panoptes_request_plan()
    statuses = [
        PanoptesProjectStatus(
            component_id=component.component_id,
            project_id=cast(PanoptesComponentRequest, component.request).project_id,
            slug=cast(PanoptesComponentRequest, component.request).slug,
            private=False,
            live=True,
            updated_at="2026-09-19T00:00:00Z",
        )
        for component in plan.components
    ]
    evidence_hash = "0" * 64
    results = tuple(
        ProviderComponentResult(
            component_id=status.component_id,
            normalized=status,
            raw_sha256=evidence_hash,
        )
        for status in statuses
    )
    snapshot = compose_panoptes_snapshot(plan, results)
    encoded = PanoptesCodec().encode(snapshot)

    reordered = dict(encoded)
    reordered["projects"] = list(reversed(cast(list[NormalizedJsonValue], encoded["projects"])))
    with pytest.raises(ValueError):
        PanoptesCodec().decode(reordered)
    with pytest.raises(ProviderNormalizationFailed):
        compose_panoptes_snapshot(plan, results[:-1])


def test_source_manifest_matches_adapter_contract() -> None:
    manifest = load_zooniverse_panoptes_source_manifest(_REPOSITORY_ROOT)

    assert manifest.source_id == "zooniverse-panoptes"
    assert manifest.adapter_id == "zooniverse-panoptes-project-status"
    assert manifest.adapter_version == "1"
    assert manifest.source_schema_version == "panoptes-project-status-v1"
    assert manifest.endpoint_or_base_url == "https://www.zooniverse.org/api/projects/"
    assert manifest.capabilities == ("batch_fetch",)
    assert manifest.normalized_fields == ("projects", "source_evidence")
