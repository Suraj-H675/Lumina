"""Closed contract for the independently reviewed Gaia DR3 astrometry slice.

This sibling contract deliberately does not broaden the frozen photometry
slice.  It accepts exactly five already-catalogued Gaia source identities and
retains the published reference epoch as evidence for downstream consumers.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Final, NoReturn
from uuid import NAMESPACE_URL, UUID, uuid5

from lumina.catalog.domain.reviewed_contract import (
    checked_relative_path as _checked_relative_path,
)
from lumina.catalog.domain.reviewed_contract import (
    load_manifest as _load_manifest,
)
from lumina.catalog.domain.reviewed_contract import (
    parse_canonical_object as _parse_canonical_object,
)
from lumina.catalog.domain.reviewed_contract import (
    read_regular_repository_file as _read_regular_file,
)
from lumina.catalog.domain.reviewed_contract import (
    require_int as _require_int,
)
from lumina.catalog.domain.reviewed_contract import (
    require_list as _require_list,
)
from lumina.catalog.domain.reviewed_contract import (
    require_object as _require_object,
)
from lumina.catalog.domain.reviewed_contract import (
    require_string as _require_string,
)
from lumina.catalog.domain.reviewed_contract import (
    require_uuid as _require_uuid,
)
from lumina.catalog.domain.reviewed_slice import (
    MAX_ARTIFACT_BYTES,
    REPOSITORY_ROOT,
    ReviewedArtifact,
    ReviewedCompatibilityPair,
    ReviewedDataset,
    ReviewedEntity,
    ReviewedExpectedCounts,
    ReviewedProvider,
    ReviewedQuantity,
    ReviewedSliceValidationRejected,
    ReviewedUnit,
)
from lumina.provenance.domain.manifests import (
    DataManifest,
    SourceManifest,
)

ASTROMETRY_SLICE_ID: Final = "gaia-dr3-exoplanet-host-astrometry-v1"
ASTROMETRY_ARTIFACT_PATH: Final = "data/seed/gaia-dr3-exoplanet-host-astrometry-v1.csv"
ASTROMETRY_ARTIFACT_SHA256: Final = (
    "40f09e01429b58bc9cb86ba1f6fd035d520d856569e2e5bb8a2ab767e37d50ef"
)
ASTROMETRY_ARTIFACT_BYTES: Final = 747
ASTROMETRY_SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/esa-gaia-astrometry.json"
ASTROMETRY_DATA_MANIFEST_PATH: Final = "data/manifests/data/gaia-source-astrometry-dr3.json"
ASTROMETRY_SOURCE_MANIFEST_SHA256: Final = (
    "ec76b30f073ce6aa66d9a3b81ba6fa18b110f382a49c8ec319f9a18a338572b1"
)
ASTROMETRY_DATA_MANIFEST_SHA256: Final = (
    "263ebe81987d469578d924ef696a0eee327c1b24b1608baff842e4e4f89bf1f6"
)
ASTROMETRY_PROVIDER_VERSION: Final = "1636148068921376768"
ASTROMETRY_REFERENCE_EPOCH: Final = "2016.0"
ASTROMETRY_REFERENCE_EPOCH_UNIT: Final = "Julian year"
ASTROMETRY_STATE_SHA256: Final = "b061af30f160370dbc03bb8f37fa5f372644f2e6ee9be12b60f8b7eb76df39fe"

_CSV_COLUMNS: Final = (
    "source_id",
    "solution_id",
    "designation",
    "ref_epoch",
    "ra",
    "ra_error",
    "dec",
    "dec_error",
)
_SOURCE_IDS: Final = (
    "1779546757669063552",
    "2079000330051813504",
    "2079597124345617280",
    "2835207319109249920",
    "3910747531814692736",
)
_ADQL: Final = (
    "SELECT source_id,solution_id,designation,ref_epoch,ra,ra_error,dec,dec_error "
    "FROM gaiadr3.gaia_source WHERE source_id IN "
    "(1779546757669063552,2079000330051813504,2079597124345617280,"
    "2835207319109249920,3910747531814692736) ORDER BY source_id"
)
_ENTITY_ROWS: Final = (
    (
        "26f4b667-ecd9-524d-8121-29508723715a",
        "star",
        "HD 209458",
        "urn:lumina:catalog-entity:v1:star:hd-209458",
        "1779546757669063552",
    ),
    (
        "bbfe8678-81ca-5e70-ac95-c597d7655540",
        "star",
        "Kepler-186",
        "urn:lumina:catalog-entity:v1:star:kepler-186",
        "2079000330051813504",
    ),
    (
        "bfd42670-3013-598e-8eb5-5a1c084dd1a0",
        "star",
        "Kepler-452",
        "urn:lumina:catalog-entity:v1:star:kepler-452",
        "2079597124345617280",
    ),
    (
        "c593bd18-c4bc-5551-8a41-09f1b501f981",
        "star",
        "51 Pegasi",
        "urn:lumina:catalog-entity:v1:star:51-pegasi",
        "2835207319109249920",
    ),
    (
        "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
        "star",
        "K2-18",
        "urn:lumina:catalog-entity:v1:star:k2-18",
        "3910747531814692736",
    ),
)
_QUANTITY_ROWS: Final = (
    (
        "18e12409-5731-5fb0-bb26-8f7033a52621",
        "gaia_icrs_declination",
        "Gaia ICRS declination at reference epoch",
        "dec",
    ),
    (
        "3c034f43-6cac-58b0-863a-c72c01cbbd0f",
        "gaia_icrs_right_ascension",
        "Gaia ICRS right ascension at reference epoch",
        "ra",
    ),
)
_UNIT_ROW: Final = (
    "48176d92-8406-52ae-855a-aa2f48dfd089",
    "deg",
    "deg",
    "degree",
)


@dataclass(frozen=True, slots=True)
class AstrometrySlice:
    """All approved closure values for the fixed astrometry source product."""

    slice_id: str
    source_manifest_path: str
    data_manifest_path: str
    source_manifest: SourceManifest
    data_manifest: DataManifest
    provider: ReviewedProvider
    dataset: ReviewedDataset
    provider_version: str
    artifact: ReviewedArtifact
    entities: tuple[ReviewedEntity, ...]
    quantities: tuple[ReviewedQuantity, ...]
    unit: ReviewedUnit
    compatibility_pairs: tuple[ReviewedCompatibilityPair, ...]
    expected: ReviewedExpectedCounts
    reference_epoch: str
    reference_epoch_unit: str


def _reject() -> NoReturn:
    raise ReviewedSliceValidationRejected()


def _parse_entities(value: object) -> tuple[ReviewedEntity, ...]:
    entities: list[ReviewedEntity] = []
    for item in _require_list(value, 5):
        record = _require_object(
            item,
            frozenset(
                {"canonical_name", "entity_type", "id", "identity_seed", "provider_record_id"}
            ),
        )
        entity = ReviewedEntity(
            id=_require_uuid(record["id"]),
            entity_type=_require_string(record["entity_type"]),
            canonical_name=_require_string(record["canonical_name"]),
            identity_seed=_require_string(record["identity_seed"]),
            provider_record_id=_require_string(record["provider_record_id"]),
        )
        if entity.entity_type != "star" or uuid5(NAMESPACE_URL, entity.identity_seed) != entity.id:
            _reject()
        entities.append(entity)
    if (
        [item.provider_record_id for item in entities]
        != sorted((item.provider_record_id for item in entities), key=int)
        or tuple(item.provider_record_id for item in entities) != _SOURCE_IDS
        or len({item.id for item in entities}) != 5
    ):
        _reject()
    return tuple(entities)


def _parse_quantities(value: object) -> tuple[ReviewedQuantity, ...]:
    quantities: list[ReviewedQuantity] = []
    for item in _require_list(value, 2):
        record = _require_object(item, frozenset({"code", "id", "name", "source_fact_key"}))
        quantities.append(
            ReviewedQuantity(
                id=_require_uuid(record["id"]),
                code=_require_string(record["code"]),
                name=_require_string(record["name"]),
                source_fact_key=_require_string(record["source_fact_key"]),
            )
        )
    if (
        tuple((str(item.id), item.code, item.name, item.source_fact_key) for item in quantities)
        != _QUANTITY_ROWS
    ):
        _reject()
    return tuple(quantities)


def _parse_pairs(
    value: object,
    quantities: tuple[ReviewedQuantity, ...],
    unit: ReviewedUnit,
) -> tuple[ReviewedCompatibilityPair, ...]:
    pairs: list[ReviewedCompatibilityPair] = []
    for item in _require_list(value, 2):
        record = _require_object(
            item, frozenset({"quantity_code", "quantity_id", "unit_code", "unit_id"})
        )
        pairs.append(
            ReviewedCompatibilityPair(
                quantity_id=_require_uuid(record["quantity_id"]),
                quantity_code=_require_string(record["quantity_code"]),
                unit_id=_require_uuid(record["unit_id"]),
                unit_code=_require_string(record["unit_code"]),
            )
        )
    expected = {(item.id, item.code, unit.id, unit.code) for item in quantities}
    actual = {
        (item.quantity_id, item.quantity_code, item.unit_id, item.unit_code) for item in pairs
    }
    if actual != expected:
        _reject()
    return tuple(sorted(pairs, key=lambda item: item.quantity_code))


def load_astrometry_slice(
    slice_id: str,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> AstrometrySlice:
    """Load and verify only the approved five-row astrometry contract."""
    if type(slice_id) is not str or slice_id != ASTROMETRY_SLICE_ID:
        _reject()
    source = _load_manifest(
        repository_root,
        ASTROMETRY_SOURCE_MANIFEST_PATH,
        SourceManifest,
        ASTROMETRY_SOURCE_MANIFEST_SHA256,
    )
    data = _load_manifest(
        repository_root,
        ASTROMETRY_DATA_MANIFEST_PATH,
        DataManifest,
        ASTROMETRY_DATA_MANIFEST_SHA256,
    )
    if type(source) is not SourceManifest or type(data) is not DataManifest:
        _reject()
    slice_path = "data/seed/gaia-dr3-exoplanet-host-astrometry-v1.json"
    slice_content = _read_regular_file(repository_root, slice_path, maximum_bytes=32_768)
    document_hash = hashlib.sha256(slice_content).hexdigest()
    document = _parse_canonical_object(slice_content)
    root = _require_object(
        document,
        frozenset(
            {
                "artifact",
                "compatibility_pairs",
                "data_manifest",
                "dataset",
                "entities",
                "expected",
                "provider",
                "provider_version",
                "quantities",
                "reference_epoch",
                "schema_version",
                "slice_id",
                "source_manifest",
                "unit",
            }
        ),
    )
    if (
        document_hash != "2caad768a619a8e2e1b75e298612ecea6fc32d70d160104f549dba20133dc3e8"
        or _require_int(root["schema_version"]) != 1
        or _require_string(root["slice_id"]) != ASTROMETRY_SLICE_ID
        or _checked_relative_path(root["source_manifest"]) != ASTROMETRY_SOURCE_MANIFEST_PATH
        or _checked_relative_path(root["data_manifest"]) != ASTROMETRY_DATA_MANIFEST_PATH
        or _require_string(root["provider_version"]) != ASTROMETRY_PROVIDER_VERSION
    ):
        _reject()

    provider_object = _require_object(root["provider"], frozenset({"code", "name"}))
    dataset_object = _require_object(
        root["dataset"], frozenset({"code", "name", "release_version"})
    )
    provider = ReviewedProvider(
        code=_require_string(provider_object["code"]), name=_require_string(provider_object["name"])
    )
    dataset = ReviewedDataset(
        code=_require_string(dataset_object["code"]),
        name=_require_string(dataset_object["name"]),
        release_version=_require_string(dataset_object["release_version"]),
    )
    artifact_object = _require_object(
        root["artifact"], frozenset({"adql", "byte_length", "columns", "path", "sha256"})
    )
    artifact = ReviewedArtifact(
        path=_checked_relative_path(artifact_object["path"]),
        byte_length=_require_int(artifact_object["byte_length"]),
        sha256=_require_string(artifact_object["sha256"]),
        adql=_require_string(artifact_object["adql"]),
        columns=tuple(
            _require_string(item) for item in _require_list(artifact_object["columns"], 8)
        ),
    )
    unit_object = _require_object(root["unit"], frozenset({"code", "id", "name", "symbol"}))
    unit = ReviewedUnit(
        id=_require_uuid(unit_object["id"]),
        code=_require_string(unit_object["code"]),
        symbol=_require_string(unit_object["symbol"]),
        name=_require_string(unit_object["name"]),
    )
    expected_object = _require_object(
        root["expected"], frozenset({"measurements", "source_records"})
    )
    expected = ReviewedExpectedCounts(
        source_records=_require_int(expected_object["source_records"]),
        measurements=_require_int(expected_object["measurements"]),
    )
    epoch_object = _require_object(root["reference_epoch"], frozenset({"unit", "value"}))
    reference_epoch = _require_string(epoch_object["value"])
    reference_epoch_unit = _require_string(epoch_object["unit"])
    result = AstrometrySlice(
        slice_id=ASTROMETRY_SLICE_ID,
        source_manifest_path=ASTROMETRY_SOURCE_MANIFEST_PATH,
        data_manifest_path=ASTROMETRY_DATA_MANIFEST_PATH,
        source_manifest=source,
        data_manifest=data,
        provider=provider,
        dataset=dataset,
        provider_version=_require_string(root["provider_version"]),
        artifact=artifact,
        entities=_parse_entities(root["entities"]),
        quantities=_parse_quantities(root["quantities"]),
        unit=unit,
        compatibility_pairs=(),
        expected=expected,
        reference_epoch=reference_epoch,
        reference_epoch_unit=reference_epoch_unit,
    )
    pairs = _parse_pairs(root["compatibility_pairs"], result.quantities, result.unit)
    if (
        result.provider != ReviewedProvider("esa-gaia", "ESA Gaia Archive")
        or result.dataset
        != ReviewedDataset(
            "gaia-source-astrometry",
            "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
            "dr3",
        )
        or result.provider_version != ASTROMETRY_PROVIDER_VERSION
        or result.artifact
        != ReviewedArtifact(
            ASTROMETRY_ARTIFACT_PATH,
            ASTROMETRY_ARTIFACT_BYTES,
            ASTROMETRY_ARTIFACT_SHA256,
            _ADQL,
            _CSV_COLUMNS,
        )
        or result.unit != ReviewedUnit(UUID(_UNIT_ROW[0]), "deg", "deg", "degree")
        or result.expected != ReviewedExpectedCounts(5, 10)
        or result.reference_epoch != ASTROMETRY_REFERENCE_EPOCH
        or result.reference_epoch_unit != ASTROMETRY_REFERENCE_EPOCH_UNIT
        or result.source_manifest.source_id != "esa-gaia"
        or result.source_manifest.adapter_id != "esa-gaia-astrometry-csv"
        or result.data_manifest.dataset_id != "gaia-source-astrometry"
        or result.data_manifest.local_file != ASTROMETRY_ARTIFACT_PATH
        or result.data_manifest.checksum != f"sha256:{ASTROMETRY_ARTIFACT_SHA256}"
        or result.data_manifest.parser_version != "gaia-dr3-astrometry-v1"
    ):
        _reject()
    return AstrometrySlice(
        slice_id=result.slice_id,
        source_manifest_path=result.source_manifest_path,
        data_manifest_path=result.data_manifest_path,
        source_manifest=result.source_manifest,
        data_manifest=result.data_manifest,
        provider=result.provider,
        dataset=result.dataset,
        provider_version=result.provider_version,
        artifact=result.artifact,
        entities=result.entities,
        quantities=result.quantities,
        unit=result.unit,
        compatibility_pairs=pairs,
        expected=result.expected,
        reference_epoch=result.reference_epoch,
        reference_epoch_unit=result.reference_epoch_unit,
    )


def read_astrometry_artifact(
    slice_contract: AstrometrySlice,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> bytes:
    """Read the exact astrometry bytes after path, size, and digest checks."""
    if type(slice_contract) is not AstrometrySlice:
        _reject()
    content = _read_regular_file(
        repository_root,
        slice_contract.artifact.path,
        maximum_bytes=MAX_ARTIFACT_BYTES,
    )
    if (
        len(content) != ASTROMETRY_ARTIFACT_BYTES
        or hashlib.sha256(content).hexdigest() != ASTROMETRY_ARTIFACT_SHA256
        or hashlib.sha256(content).hexdigest() != slice_contract.artifact.sha256
    ):
        _reject()
    return content


def astrometry_fetched_at(slice_contract: AstrometrySlice) -> datetime:
    """Return the approved UTC retrieval instant for source-record provenance."""
    if type(slice_contract) is not AstrometrySlice:
        _reject()
    return slice_contract.data_manifest.retrieved_at


__all__ = [
    "ASTROMETRY_ARTIFACT_BYTES",
    "ASTROMETRY_ARTIFACT_PATH",
    "ASTROMETRY_ARTIFACT_SHA256",
    "ASTROMETRY_DATA_MANIFEST_PATH",
    "ASTROMETRY_DATA_MANIFEST_SHA256",
    "ASTROMETRY_REFERENCE_EPOCH",
    "ASTROMETRY_REFERENCE_EPOCH_UNIT",
    "ASTROMETRY_SLICE_ID",
    "ASTROMETRY_SOURCE_MANIFEST_PATH",
    "ASTROMETRY_SOURCE_MANIFEST_SHA256",
    "ASTROMETRY_STATE_SHA256",
    "AstrometrySlice",
    "astrometry_fetched_at",
    "load_astrometry_slice",
    "read_astrometry_artifact",
]
