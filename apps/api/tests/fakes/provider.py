"""Deterministic, filesystem-independent fake provider for provenance tests only."""

from __future__ import annotations

import copy
import json
import re
import unicodedata
from typing import Annotated, Literal

from lumina.provenance.domain.manifests import DataManifest, SourceManifest
from lumina.provenance.domain.provider import (
    ProviderContractError,
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    StrictBool,
    StrictInt,
    StrictStr,
    TypeAdapter,
    ValidationError,
    field_validator,
)

FIXTURE_SOURCE_ID = "lumina-fixture-source"
FIXTURE_ADAPTER_ID = "lumina-fixture-adapter"
FIXTURE_ADAPTER_VERSION = "fixture-v1"
FIXTURE_DATASET_ID = "fictional-scalar-fixtures"
FIXTURE_RELEASE_VERSION = "fixture-release-v1"
FIXTURE_PAYLOAD_SCHEMA_VERSION = "fixture-payload-v1"

_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,128}", re.ASCII)


def _validate_token(value: str) -> str:
    if _TOKEN_PATTERN.fullmatch(value) is None:
        raise ValueError("invalid fixture token")
    return value


def _validate_label(value: str) -> str:
    if (
        not value
        or value != value.strip()
        or any(unicodedata.category(character) in {"Cc", "Cs"} for character in value)
    ):
        raise ValueError("invalid fixture label")
    return value


FixtureToken = Annotated[StrictStr, AfterValidator(_validate_token)]
FixtureLabel = Annotated[StrictStr, AfterValidator(_validate_label)]
FakeScalar = StrictStr | StrictInt | StrictBool | None


class _FakeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class FakeLookupRequest(_FakeModel):
    operation: Literal["lookup"]
    fixture_id: FixtureToken


class FakeBatchRequest(_FakeModel):
    operation: Literal["batch_fetch"]
    fixture_ids: tuple[FixtureToken, ...]

    @field_validator("fixture_ids")
    @classmethod
    def _validate_fixture_ids(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if not value or len(value) != len(set(value)):
            raise ValueError("fixture IDs must be non-empty and unique")
        return value


class FakePayloadRecord(_FakeModel):
    fixture_id: FixtureToken
    fictional_label: FixtureLabel
    fictional_value: FakeScalar
    source_id: FixtureToken
    dataset_id: FixtureToken
    release_version: FixtureToken


class FakePayloadEnvelope(_FakeModel):
    source_schema_version: Literal["fixture-payload-v1"]
    test_only: Literal[True]
    scientific_data: Literal[False]
    records: tuple[FakePayloadRecord, ...]

    @field_validator("records")
    @classmethod
    def _validate_record_ids(
        cls,
        value: tuple[FakePayloadRecord, ...],
    ) -> tuple[FakePayloadRecord, ...]:
        fixture_ids = [record.fixture_id for record in value]
        if len(fixture_ids) != len(set(fixture_ids)):
            raise ValueError("fixture payload record IDs must be unique")
        return value


class FakeNormalizedRecord(_FakeModel):
    fixture_id: FixtureToken
    label: FixtureLabel
    value: FakeScalar
    source_id: FixtureToken
    dataset_id: FixtureToken
    release_version: FixtureToken


class FakeLookupResult(_FakeModel):
    operation: Literal["lookup"]
    test_only: Literal[True]
    scientific_data: Literal[False]
    records: tuple[FakeNormalizedRecord, ...]


class FakeBatchResult(_FakeModel):
    operation: Literal["batch_fetch"]
    test_only: Literal[True]
    scientific_data: Literal[False]
    records: tuple[FakeNormalizedRecord, ...]


FakeRequest = FakeLookupRequest | FakeBatchRequest
FakeResult = FakeLookupResult | FakeBatchResult
_PAYLOAD_ADAPTER = TypeAdapter(FakePayloadEnvelope)


class FixtureRecordNotFound(ProviderContractError):
    """A requested fictional record is absent from the injected payload."""

    code = "fixture.record_not_found"
    safe_message = "The requested fixture record was not found."


class FakeProviderAdapter:
    """A deterministic adapter over one already-decoded fictional payload object."""

    def __init__(
        self,
        source_manifest: SourceManifest,
        data_manifest: DataManifest,
        raw_payload: object,
    ) -> None:
        self._source_manifest = source_manifest
        self._data_manifest = data_manifest
        self._raw_payload = copy.deepcopy(raw_payload)

    @property
    def source_manifest(self) -> SourceManifest:
        return self._source_manifest

    async def fetch(self, request: FakeRequest) -> object:
        """Return a fresh copy after checking the typed operation declaration."""
        if type(request) not in {FakeLookupRequest, FakeBatchRequest}:
            raise ProviderRequestRejected()
        if request.operation not in self._source_manifest.capabilities:
            raise ProviderRequestRejected()
        return copy.deepcopy(self._raw_payload)

    def validate_payload(self, payload: object) -> FakePayloadEnvelope:
        """Strictly validate the untrusted object and its fictional provenance shape."""
        try:
            encoded = json.dumps(
                payload,
                allow_nan=False,
                ensure_ascii=False,
                separators=(",", ":"),
            )
            validated = _PAYLOAD_ADAPTER.validate_json(encoded, strict=True)
        except (TypeError, ValueError, ValidationError) as error:
            raise ProviderPayloadInvalid() from error

        if (
            validated.source_schema_version != self._source_manifest.source_schema_version
            or self._data_manifest.source_id != self._source_manifest.source_id
            or any(
                record.source_id != self._source_manifest.source_id
                or record.dataset_id != self._data_manifest.dataset_id
                or record.release_version != self._data_manifest.release_version
                for record in validated.records
            )
        ):
            raise ProviderPayloadInvalid() from None
        return validated

    def normalize(self, request: FakeRequest, payload: FakePayloadEnvelope) -> FakeResult:
        """Select requested fictional records and rename fields deterministically."""
        if type(request) not in {FakeLookupRequest, FakeBatchRequest}:
            raise ProviderNormalizationFailed()
        if type(payload) is not FakePayloadEnvelope:
            raise ProviderNormalizationFailed()

        records_by_id = {record.fixture_id: record for record in payload.records}
        requested_ids = (
            (request.fixture_id,)
            if isinstance(request, FakeLookupRequest)
            else tuple(sorted(request.fixture_ids))
        )
        for fixture_id in sorted(requested_ids):
            if fixture_id not in records_by_id:
                raise FixtureRecordNotFound()

        normalized = tuple(
            FakeNormalizedRecord(
                fixture_id=record.fixture_id,
                label=record.fictional_label,
                value=record.fictional_value,
                source_id=record.source_id,
                dataset_id=record.dataset_id,
                release_version=record.release_version,
            )
            for record in sorted(
                (records_by_id[fixture_id] for fixture_id in requested_ids),
                key=lambda record: record.fixture_id,
            )
        )
        if isinstance(request, FakeLookupRequest):
            return FakeLookupResult(
                operation="lookup",
                test_only=True,
                scientific_data=False,
                records=normalized,
            )
        return FakeBatchResult(
            operation="batch_fetch",
            test_only=True,
            scientific_data=False,
            records=normalized,
        )
