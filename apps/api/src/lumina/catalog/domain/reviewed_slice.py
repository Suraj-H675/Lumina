"""Closed, immutable contract for Lumina's reviewed Gaia DR3 seed slice.

The contract is intentionally narrow.  It is not a provider registry or a generic dataset
configuration format: every accepted identity, path, release, and vocabulary member is fixed in
this module and independently represented in the reviewed JSON and manifest files.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Final, NoReturn
from uuid import NAMESPACE_URL, UUID, uuid5

from lumina.provenance.domain.manifests import (
    DataManifest,
    ManifestContractError,
    SourceManifest,
    parse_manifest_json,
    serialize_manifest,
)

REVIEWED_SLICE_ID: Final = "gaia-dr3-exoplanet-host-photometry-v1"
REVIEWED_ARTIFACT_PATH: Final = "data/seed/gaia-dr3-exoplanet-host-photometry-v1.csv"
REVIEWED_ARTIFACT_SHA256: Final = "585efe5379533874906995a84946c1457a1f0442187bdf306e6da68d11d94304"
REVIEWED_ARTIFACT_BYTES: Final = 806
REVIEWED_STATE_SHA256: Final = "05444b36d44bd800ca9fdefbb45d10fbef2e222729cb65c4c919fd0759c61c2c"
MAX_ARTIFACT_BYTES: Final = 4_096
REPOSITORY_ROOT: Final = Path(__file__).resolve().parents[6]

_SLICE_PATH: Final = "data/seed/gaia-dr3-exoplanet-host-photometry-v1.json"
_SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/esa-gaia.json"
_DATA_MANIFEST_PATH: Final = "data/manifests/data/gaia-source-dr3.json"
_REVIEWED_SLICE_SHA256: Final = "955a7bc1cc5f2c63c0e1fd75c03727168412e1988ed9b75fcc7c87e62522444c"
_SOURCE_MANIFEST_SHA256: Final = "2e9296ed9952c95af5783b385c5261b33f8ed2dda6097532d6e8711afc04cede"
_DATA_MANIFEST_SHA256: Final = "30cc21586f12884d1ae13c200ba9c5af7f7492923d04e60e507be06831a8528a"
_CSV_COLUMNS: Final = (
    "source_id",
    "designation",
    "solution_id",
    "phot_g_mean_mag",
    "phot_bp_mean_mag",
    "phot_rp_mean_mag",
    "duplicated_source",
    "phot_proc_mode",
    "phot_bp_n_contaminated_transits",
    "phot_bp_n_blended_transits",
    "phot_rp_n_contaminated_transits",
    "phot_rp_n_blended_transits",
)
_ADQL: Final = (
    "SELECT source_id,designation,solution_id,phot_g_mean_mag,phot_bp_mean_mag,"
    "phot_rp_mean_mag,duplicated_source,phot_proc_mode,"
    "phot_bp_n_contaminated_transits,phot_bp_n_blended_transits,"
    "phot_rp_n_contaminated_transits,phot_rp_n_blended_transits "
    "FROM gaiadr3.gaia_source WHERE source_id IN "
    "(1779546757669063552,2079000330051813504,2079597124345617280,"
    "2835207319109249920,3910747531814692736) ORDER BY source_id"
)
_EXPECTED_ENTITIES: Final = (
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
_EXPECTED_QUANTITIES: Final = (
    (
        "b9532ccd-e769-5d36-9046-b7c1bc138841",
        "gaia_bp_mean_magnitude",
        "Gaia integrated BP mean magnitude (Vega scale)",
        "phot_bp_mean_mag",
    ),
    (
        "2c3626b7-647f-5180-8662-5240238e1acc",
        "gaia_g_mean_magnitude",
        "Gaia G-band mean magnitude (Vega scale)",
        "phot_g_mean_mag",
    ),
    (
        "347f0167-0786-5d34-a4d4-a4da006343eb",
        "gaia_rp_mean_magnitude",
        "Gaia integrated RP mean magnitude (Vega scale)",
        "phot_rp_mean_mag",
    ),
)


class ReviewedSliceError(RuntimeError):
    """Base class for fixed, non-evidentiary reviewed-slice failures."""

    code: str
    safe_message: str

    def __init__(self) -> None:
        super().__init__(self.safe_message)

    def __repr__(self) -> str:
        return f"{type(self).__name__}(code={self.code!r})"


class ReviewedSliceValidationRejected(ReviewedSliceError, ValueError):
    """The immutable reviewed-slice boundary was malformed or did not match approval."""

    code = "catalog.reviewed_slice_validation_rejected"
    safe_message = "The reviewed catalogue slice was rejected."


class ReviewedSlicePolicyRejected(ReviewedSliceError):
    """The selected source content does not meet the closed review policy."""

    code = "catalog.reviewed_slice_policy_rejected"
    safe_message = "The reviewed catalogue slice does not satisfy its data policy."


class _DuplicateJsonKey(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ReviewedProvider:
    code: str
    name: str


@dataclass(frozen=True, slots=True)
class ReviewedDataset:
    code: str
    name: str
    release_version: str


@dataclass(frozen=True, slots=True)
class ReviewedEntity:
    id: UUID
    entity_type: str
    canonical_name: str
    identity_seed: str
    provider_record_id: str


@dataclass(frozen=True, slots=True)
class ReviewedQuantity:
    id: UUID
    code: str
    name: str
    source_fact_key: str


@dataclass(frozen=True, slots=True)
class ReviewedUnit:
    id: UUID
    code: str
    symbol: str
    name: str


@dataclass(frozen=True, slots=True)
class ReviewedCompatibilityPair:
    quantity_id: UUID
    quantity_code: str
    unit_id: UUID
    unit_code: str


@dataclass(frozen=True, slots=True)
class ReviewedArtifact:
    path: str
    byte_length: int
    sha256: str
    adql: str
    columns: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ReviewedQuality:
    designation_prefix: str
    solution_id: str
    duplicated_source: bool
    phot_proc_mode: int
    phot_bp_n_contaminated_transits: int
    phot_bp_n_blended_transits: int
    phot_rp_n_contaminated_transits: int
    phot_rp_n_blended_transits: int


@dataclass(frozen=True, slots=True)
class ReviewedExpectedCounts:
    source_records: int
    measurements: int


@dataclass(frozen=True, slots=True)
class ReviewedSlice:
    """All approved closure values needed for offline parsing and source-only validation."""

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
    quality: ReviewedQuality
    expected: ReviewedExpectedCounts


def _reject() -> NoReturn:
    raise ReviewedSliceValidationRejected()


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateJsonKey()
        result[key] = value
    return result


def _reject_json_constant(value: str) -> NoReturn:
    del value
    _reject()


def _canonical_json_bytes(value: object) -> bytes:
    try:
        return (
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n"
        ).encode("utf-8")
    except (TypeError, UnicodeError, ValueError):
        _reject()


def _checked_relative_path(value: object) -> str:
    if type(value) is not str or not value or value != value.strip() or not value.isascii():
        _reject()
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        _reject()
    return value


def _read_regular_repository_file(
    root: Path,
    relative_path: str,
    *,
    maximum_bytes: int,
) -> bytes:
    relative_path = _checked_relative_path(relative_path)
    root = root.resolve()
    path = root.joinpath(*PurePosixPath(relative_path).parts)
    try:
        if path.is_symlink() or not path.is_file():
            _reject()
        resolved = path.resolve(strict=True)
        resolved.relative_to(root)
        if path.stat().st_size > maximum_bytes:
            _reject()
        with path.open("rb") as handle:
            content = handle.read(maximum_bytes + 1)
    except (OSError, ValueError):
        _reject()
    if len(content) > maximum_bytes:
        _reject()
    return content


def _parse_canonical_object(content: bytes) -> dict[str, object]:
    try:
        decoded = json.loads(
            content.decode("utf-8"),
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_json_constant,
        )
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError):
        _reject()
    if type(decoded) is not dict or _canonical_json_bytes(decoded) != content:
        _reject()
    return decoded


def _require_object(value: object, fields: frozenset[str]) -> dict[str, object]:
    if type(value) is not dict or set(value) != fields:
        _reject()
    return value


def _require_string(value: object) -> str:
    if type(value) is not str or not value:
        _reject()
    return value


def _require_int(value: object) -> int:
    if type(value) is not int:
        _reject()
    return value


def _require_uuid(value: object) -> UUID:
    try:
        parsed = UUID(_require_string(value))
    except ValueError:
        _reject()
    if str(parsed) != value:
        _reject()
    return parsed


def _require_list(value: object, length: int) -> list[object]:
    if type(value) is not list or len(value) != length:
        _reject()
    return value


def _load_manifest(
    root: Path,
    path: str,
    expected: type[SourceManifest] | type[DataManifest],
    approved_sha256: str,
) -> object:
    content = _read_regular_repository_file(root, path, maximum_bytes=32_768)
    try:
        manifest = parse_manifest_json(content)
    except ManifestContractError:
        _reject()
    if (
        type(manifest) is not expected
        or serialize_manifest(manifest) != content
        or hashlib.sha256(content).hexdigest() != approved_sha256
    ):
        _reject()
    return manifest


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
    if [item.provider_record_id for item in entities] != sorted(
        (item.provider_record_id for item in entities), key=int
    ) or len({item.id for item in entities}) != 5:
        _reject()
    return tuple(entities)


def _parse_quantities(value: object) -> tuple[ReviewedQuantity, ...]:
    quantities: list[ReviewedQuantity] = []
    for item in _require_list(value, 3):
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
        [item.code for item in quantities]
        != ["gaia_bp_mean_magnitude", "gaia_g_mean_magnitude", "gaia_rp_mean_magnitude"]
        or len({item.id for item in quantities}) != 3
        or len({item.source_fact_key for item in quantities}) != 3
    ):
        _reject()
    return tuple(quantities)


def _parse_compatibility_pairs(
    value: object,
    quantities: tuple[ReviewedQuantity, ...],
    unit: ReviewedUnit,
) -> tuple[ReviewedCompatibilityPair, ...]:
    pairs: list[ReviewedCompatibilityPair] = []
    for item in _require_list(value, 3):
        record = _require_object(
            item,
            frozenset({"quantity_code", "quantity_id", "unit_code", "unit_id"}),
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
    if actual != expected or len(actual) != 3:
        _reject()
    return tuple(sorted(pairs, key=lambda item: item.quantity_code))


def _manifest_contract_matches(slice_contract: ReviewedSlice) -> bool:
    source = slice_contract.source_manifest
    data = slice_contract.data_manifest
    return (
        source.source_id == slice_contract.provider.code == "esa-gaia"
        and source.source_name == slice_contract.provider.name == "ESA Gaia Archive"
        and source.adapter_id == "esa-gaia-reviewed-csv"
        and source.adapter_version == "1"
        and source.official_documentation_url
        == "https://gea.esac.esa.int/archive/documentation/GDR3/"
        and source.terms_or_licence_url
        == "https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/"
        and source.attribution_text
        == (
            "Data from ESA's Gaia mission, processed by the Gaia Data Processing and Analysis "
            "Consortium (DPAC)."
        )
        and data.source_id == source.source_id
        and data.dataset_id == slice_contract.dataset.code == "gaia-source"
        and data.release_version == slice_contract.dataset.release_version == "dr3"
        and data.official_url == "https://gea.esac.esa.int/archive/"
        and data.documentation_url
        == "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html"
        and data.terms_or_licence
        == "Gaia data are open and free to use with ESA/Gaia/DPAC credit; no inferred SPDX licence."
        and data.citation == "Gaia mission paper and Gaia DR3 release-summary paper."
        and data.local_file == REVIEWED_ARTIFACT_PATH
        and data.checksum == f"sha256:{REVIEWED_ARTIFACT_SHA256}"
        and data.parser_version == "gaia-dr3-photometry-v1"
    )


def load_reviewed_slice(
    slice_id: str,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> ReviewedSlice:
    """Load the sole approved reviewed slice after strict immutable-contract checks."""
    if type(slice_id) is not str or slice_id != REVIEWED_SLICE_ID:
        _reject()
    source = _load_manifest(
        repository_root,
        _SOURCE_MANIFEST_PATH,
        SourceManifest,
        _SOURCE_MANIFEST_SHA256,
    )
    data = _load_manifest(
        repository_root,
        _DATA_MANIFEST_PATH,
        DataManifest,
        _DATA_MANIFEST_SHA256,
    )
    if type(source) is not SourceManifest or type(data) is not DataManifest:
        _reject()
    slice_content = _read_regular_repository_file(
        repository_root,
        _SLICE_PATH,
        maximum_bytes=32_768,
    )
    if hashlib.sha256(slice_content).hexdigest() != _REVIEWED_SLICE_SHA256:
        _reject()
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
                "quality",
                "schema_version",
                "slice_id",
                "source_manifest",
                "unit",
            }
        ),
    )
    if (
        _require_int(root["schema_version"]) != 1
        or _require_string(root["slice_id"]) != REVIEWED_SLICE_ID
        or _checked_relative_path(root["source_manifest"]) != _SOURCE_MANIFEST_PATH
        or _checked_relative_path(root["data_manifest"]) != _DATA_MANIFEST_PATH
        or _require_string(root["provider_version"]) != "1636148068921376768"
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
            _require_string(item) for item in _require_list(artifact_object["columns"], 12)
        ),
    )
    unit_object = _require_object(root["unit"], frozenset({"code", "id", "name", "symbol"}))
    unit = ReviewedUnit(
        id=_require_uuid(unit_object["id"]),
        code=_require_string(unit_object["code"]),
        symbol=_require_string(unit_object["symbol"]),
        name=_require_string(unit_object["name"]),
    )
    quality_object = _require_object(
        root["quality"],
        frozenset(
            {
                "designation_prefix",
                "duplicated_source",
                "phot_bp_n_blended_transits",
                "phot_bp_n_contaminated_transits",
                "phot_proc_mode",
                "phot_rp_n_blended_transits",
                "phot_rp_n_contaminated_transits",
                "solution_id",
            }
        ),
    )
    duplicated_source = quality_object["duplicated_source"]
    if type(duplicated_source) is not bool:
        _reject()
    quality = ReviewedQuality(
        designation_prefix=_require_string(quality_object["designation_prefix"]),
        solution_id=_require_string(quality_object["solution_id"]),
        duplicated_source=duplicated_source,
        phot_proc_mode=_require_int(quality_object["phot_proc_mode"]),
        phot_bp_n_contaminated_transits=_require_int(
            quality_object["phot_bp_n_contaminated_transits"]
        ),
        phot_bp_n_blended_transits=_require_int(quality_object["phot_bp_n_blended_transits"]),
        phot_rp_n_contaminated_transits=_require_int(
            quality_object["phot_rp_n_contaminated_transits"]
        ),
        phot_rp_n_blended_transits=_require_int(quality_object["phot_rp_n_blended_transits"]),
    )
    expected_object = _require_object(
        root["expected"], frozenset({"measurements", "source_records"})
    )
    expected = ReviewedExpectedCounts(
        source_records=_require_int(expected_object["source_records"]),
        measurements=_require_int(expected_object["measurements"]),
    )
    result = ReviewedSlice(
        slice_id=REVIEWED_SLICE_ID,
        source_manifest_path=_SOURCE_MANIFEST_PATH,
        data_manifest_path=_DATA_MANIFEST_PATH,
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
        quality=quality,
        expected=expected,
    )
    pairs = _parse_compatibility_pairs(root["compatibility_pairs"], result.quantities, result.unit)
    result = ReviewedSlice(
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
        quality=result.quality,
        expected=result.expected,
    )
    if (
        result.artifact.path != REVIEWED_ARTIFACT_PATH
        or result.artifact.byte_length != REVIEWED_ARTIFACT_BYTES
        or result.artifact.sha256 != REVIEWED_ARTIFACT_SHA256
        or result.artifact.columns != _CSV_COLUMNS
        or result.artifact.adql != _ADQL
        or result.unit
        != ReviewedUnit(UUID("4e4a920b-dc09-5556-a056-c08ba155c18a"), "mag", "mag", "magnitude")
        or result.expected != ReviewedExpectedCounts(source_records=5, measurements=15)
        or tuple(
            (
                str(entity.id),
                entity.entity_type,
                entity.canonical_name,
                entity.identity_seed,
                entity.provider_record_id,
            )
            for entity in result.entities
        )
        != _EXPECTED_ENTITIES
        or tuple(
            (str(quantity.id), quantity.code, quantity.name, quantity.source_fact_key)
            for quantity in result.quantities
        )
        != _EXPECTED_QUANTITIES
        or not _manifest_contract_matches(result)
    ):
        _reject()
    return result


def read_reviewed_artifact(
    slice_contract: ReviewedSlice,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> bytes:
    """Read the sole approved artifact once after path, size, and checksum verification."""
    if type(slice_contract) is not ReviewedSlice:
        _reject()
    content = _read_regular_repository_file(
        repository_root,
        slice_contract.artifact.path,
        maximum_bytes=MAX_ARTIFACT_BYTES,
    )
    if (
        len(content) != REVIEWED_ARTIFACT_BYTES
        or len(content) != slice_contract.artifact.byte_length
        or hashlib.sha256(content).hexdigest() != REVIEWED_ARTIFACT_SHA256
        or hashlib.sha256(content).hexdigest() != slice_contract.artifact.sha256
    ):
        _reject()
    return content


def reviewed_fetched_at(slice_contract: ReviewedSlice) -> datetime:
    """Return the approved UTC fetch instant after defending the closed slice type."""
    if type(slice_contract) is not ReviewedSlice:
        _reject()
    return slice_contract.data_manifest.retrieved_at


__all__ = [
    "MAX_ARTIFACT_BYTES",
    "REPOSITORY_ROOT",
    "REVIEWED_ARTIFACT_BYTES",
    "REVIEWED_ARTIFACT_PATH",
    "REVIEWED_ARTIFACT_SHA256",
    "REVIEWED_SLICE_ID",
    "REVIEWED_STATE_SHA256",
    "ReviewedArtifact",
    "ReviewedCompatibilityPair",
    "ReviewedDataset",
    "ReviewedEntity",
    "ReviewedExpectedCounts",
    "ReviewedProvider",
    "ReviewedQuality",
    "ReviewedQuantity",
    "ReviewedSlice",
    "ReviewedSliceError",
    "ReviewedSlicePolicyRejected",
    "ReviewedSliceValidationRejected",
    "ReviewedUnit",
    "load_reviewed_slice",
    "read_reviewed_artifact",
    "reviewed_fetched_at",
]
