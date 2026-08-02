"""Determinism and boundary tests for the test-only fake provider."""

from __future__ import annotations

import json
import os
import socket
import time
import urllib.request
from pathlib import Path

import pytest
from fakes.provider import (
    FIXTURE_ADAPTER_ID,
    FIXTURE_ADAPTER_VERSION,
    FIXTURE_DATASET_ID,
    FIXTURE_PAYLOAD_SCHEMA_VERSION,
    FIXTURE_RELEASE_VERSION,
    FIXTURE_SOURCE_ID,
    FakeBatchRequest,
    FakeBatchResult,
    FakeLookupRequest,
    FakeLookupResult,
    FakePayloadEnvelope,
    FakeProviderAdapter,
    FixtureRecordNotFound,
)
from lumina.provenance.domain.manifests import DataManifest, SourceManifest, parse_manifest_json
from lumina.provenance.domain.provider import ProviderPayloadInvalid, ProviderRequestRejected

_TEST_ROOT = Path(__file__).resolve().parents[1]
_MANIFEST_ROOT = _TEST_ROOT / "fixtures" / "manifests"
_PAYLOAD_PATH = _TEST_ROOT / "fixtures" / "provider" / "fictional-payload.json"


def _inputs() -> tuple[SourceManifest, DataManifest, object]:
    source = parse_manifest_json((_MANIFEST_ROOT / "sources/fictional-source.json").read_bytes())
    data = parse_manifest_json((_MANIFEST_ROOT / "data/fictional-data.json").read_bytes())
    assert isinstance(source, SourceManifest)
    assert isinstance(data, DataManifest)
    return source, data, json.loads(_PAYLOAD_PATH.read_bytes())


def _adapter() -> FakeProviderAdapter:
    return FakeProviderAdapter(*_inputs())


async def _execute(
    adapter: FakeProviderAdapter,
    request: FakeLookupRequest | FakeBatchRequest,
) -> FakeLookupResult | FakeBatchResult:
    raw = await adapter.fetch(request)
    payload = adapter.validate_payload(raw)
    return adapter.normalize(request, payload)


@pytest.mark.asyncio
async def test_exact_lookup_pipeline_preserves_scalar_and_provenance() -> None:
    result = await _execute(
        _adapter(),
        FakeLookupRequest(operation="lookup", fixture_id="integer-case"),
    )
    assert type(result) is FakeLookupResult
    assert result.operation == "lookup"
    assert result.test_only is True
    assert result.scientific_data is False
    assert len(result.records) == 1
    record = result.records[0]
    assert record.fixture_id == "integer-case"
    assert record.label == "Fictional integer case"
    assert type(record.value) is int
    assert record.value == 17
    assert (record.source_id, record.dataset_id, record.release_version) == (
        FIXTURE_SOURCE_ID,
        FIXTURE_DATASET_ID,
        FIXTURE_RELEASE_VERSION,
    )


@pytest.mark.asyncio
async def test_batch_order_is_stable_and_strict_scalar_types_survive() -> None:
    first = await _execute(
        _adapter(),
        FakeBatchRequest(
            operation="batch_fetch",
            fixture_ids=("true-case", "string-case", "null-case", "integer-case"),
        ),
    )
    second = await _execute(
        _adapter(),
        FakeBatchRequest(
            operation="batch_fetch",
            fixture_ids=("integer-case", "null-case", "string-case", "true-case"),
        ),
    )
    assert type(first) is FakeBatchResult
    assert first == second
    assert [record.fixture_id for record in first.records] == [
        "integer-case",
        "null-case",
        "string-case",
        "true-case",
    ]
    values = {record.fixture_id: record.value for record in first.records}
    assert type(values["integer-case"]) is int
    assert values["null-case"] is None
    assert type(values["string-case"]) is str
    assert type(values["true-case"]) is bool


class _NormalizeSpy(FakeProviderAdapter):
    normalize_called = False

    def normalize(
        self,
        request: FakeLookupRequest | FakeBatchRequest,
        payload: FakePayloadEnvelope,
    ) -> FakeLookupResult | FakeBatchResult:
        self.normalize_called = True
        return super().normalize(request, payload)


@pytest.mark.asyncio
async def test_malformed_payload_fails_before_normalization() -> None:
    source, data, payload = _inputs()
    assert isinstance(payload, dict)
    payload["unexpected_private_field"] = "private-payload-value"
    adapter = _NormalizeSpy(source, data, payload)
    request = FakeLookupRequest(operation="lookup", fixture_id="integer-case")

    with pytest.raises(ProviderPayloadInvalid) as captured:
        await _execute(adapter, request)
    assert adapter.normalize_called is False
    assert captured.value.code == "provider.payload_invalid"
    assert str(captured.value) == (
        "provider.payload_invalid: The provider payload did not match its declared schema."
    )
    assert "private-payload-value" not in str(captured.value)


def _mutated_payload(case: str) -> object:
    payload = json.loads(_PAYLOAD_PATH.read_bytes())
    assert isinstance(payload, dict)
    records = payload["records"]
    assert isinstance(records, list)
    first = records[0]
    assert isinstance(first, dict)
    if case == "top_unknown":
        payload["unexpected"] = "private"
    elif case == "record_unknown":
        first["unexpected"] = "private"
    elif case == "changed_type":
        first["fictional_value"] = 1.5
    elif case == "schema":
        payload["source_schema_version"] = "fixture-payload-v2"
    elif case == "test_marker":
        payload["test_only"] = False
    elif case == "science_marker":
        payload["scientific_data"] = True
    elif case == "duplicate":
        records.append(dict(first))
    elif case == "source":
        first["source_id"] = "private-other-source"
    elif case == "dataset":
        first["dataset_id"] = "private-other-dataset"
    elif case == "release":
        first["release_version"] = "private-other-release"
    else:
        raise AssertionError("unknown mutation")
    return payload


@pytest.mark.parametrize(
    "case",
    [
        "top_unknown",
        "record_unknown",
        "changed_type",
        "schema",
        "test_marker",
        "science_marker",
        "duplicate",
        "source",
        "dataset",
        "release",
    ],
)
def test_payload_validation_is_strict_and_provenance_bound(case: str) -> None:
    with pytest.raises(ProviderPayloadInvalid) as captured:
        _adapter().validate_payload(_mutated_payload(case))
    assert captured.value.code == "provider.payload_invalid"
    assert "private" not in str(captured.value)


@pytest.mark.asyncio
async def test_missing_lookup_and_batch_ids_use_one_fixed_safe_failure() -> None:
    requests = (
        FakeLookupRequest(operation="lookup", fixture_id="missing-private-id"),
        FakeBatchRequest(
            operation="batch_fetch",
            fixture_ids=("missing-z", "integer-case", "missing-a"),
        ),
    )
    for request in requests:
        with pytest.raises(FixtureRecordNotFound) as captured:
            await _execute(_adapter(), request)
        assert captured.value.code == "fixture.record_not_found"
        assert str(captured.value) == (
            "fixture.record_not_found: The requested fixture record was not found."
        )
        assert "missing" not in str(captured.value)


@pytest.mark.asyncio
async def test_payload_copies_and_instances_share_no_mutable_state() -> None:
    source, data, injected = _inputs()
    first_adapter = FakeProviderAdapter(source, data, injected)
    second_adapter = FakeProviderAdapter(source, data, injected)
    assert isinstance(injected, dict)
    injected["test_only"] = False

    request = FakeLookupRequest(operation="lookup", fixture_id="string-case")
    first_raw = await first_adapter.fetch(request)
    assert isinstance(first_raw, dict)
    first_raw["scientific_data"] = True
    next_raw = await first_adapter.fetch(request)
    other_raw = await second_adapter.fetch(request)
    assert isinstance(next_raw, dict)
    assert isinstance(other_raw, dict)
    assert next_raw["scientific_data"] is False
    assert other_raw["scientific_data"] is False
    assert await _execute(first_adapter, request) == await _execute(second_adapter, request)


@pytest.mark.asyncio
async def test_irrelevant_process_environment_and_network_entry_points_do_not_affect_output(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    expected = await _execute(
        _adapter(),
        FakeLookupRequest(operation="lookup", fixture_id="true-case"),
    )

    def forbidden(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("forbidden ambient dependency was consulted")

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("TZ", "Pacific/Kiritimati")
    monkeypatch.setenv("LC_ALL", "C")
    monkeypatch.setenv("IRRELEVANT_PROVIDER_SECRET", "private-secret-value")
    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket, "gethostname", forbidden)
    monkeypatch.setattr(urllib.request, "urlopen", forbidden)
    monkeypatch.setattr(os, "getpid", forbidden)
    monkeypatch.setattr(time, "time", forbidden)

    actual = await _execute(
        _adapter(),
        FakeLookupRequest(operation="lookup", fixture_id="true-case"),
    )
    assert actual == expected


@pytest.mark.asyncio
async def test_source_manifest_is_the_only_capability_declaration() -> None:
    source, data, payload = _inputs()
    assert source.capabilities == ("batch_fetch", "lookup")
    operation_literals = {
        FakeLookupRequest(operation="lookup", fixture_id="integer-case").operation,
        FakeBatchRequest(operation="batch_fetch", fixture_ids=("integer-case",)).operation,
    }
    assert operation_literals == set(source.capabilities)
    assert (source.source_id, source.adapter_id, source.adapter_version) == (
        FIXTURE_SOURCE_ID,
        FIXTURE_ADAPTER_ID,
        FIXTURE_ADAPTER_VERSION,
    )
    assert data.dataset_id == FIXTURE_DATASET_ID
    assert data.release_version == FIXTURE_RELEASE_VERSION
    assert source.source_schema_version == FIXTURE_PAYLOAD_SCHEMA_VERSION

    no_capabilities = source.model_copy(update={"capabilities": ()})
    adapter = FakeProviderAdapter(no_capabilities, data, payload)
    with pytest.raises(ProviderRequestRejected):
        await adapter.fetch(FakeLookupRequest(operation="lookup", fixture_id="integer-case"))


def test_manifest_timestamps_are_fixed_and_results_have_no_runtime_timestamp_fields() -> None:
    source, data, _payload = _inputs()
    assert source.last_verified_at.isoformat() == "2026-01-15T00:00:00+00:00"
    assert data.retrieved_at.isoformat() == "2026-01-15T00:00:00+00:00"
    result_fields = set(FakeLookupResult.model_fields) | set(FakeBatchResult.model_fields)
    assert not {field for field in result_fields if field.endswith("_at")}
