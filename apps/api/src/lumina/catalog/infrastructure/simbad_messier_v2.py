"""Offline, checksum-pinned v2 SIMBAD Messier target-semantics adapter.

The v2 artifact keeps the v1 SIMBAD evidence byte-for-byte at the field level,
but records the reviewed modern-observing-target semantics separately.  Runtime
ingestion reads only this immutable artifact; it never consults NASA or SIMBAD
to infer an entity type.
"""

from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from io import StringIO
from pathlib import Path
from typing import Final, NoReturn
from uuid import NAMESPACE_URL, UUID, uuid5

from lumina.catalog.domain.ingestion import (
    IngestReviewedDatasetCommand,
    NormalizedMeasurement,
    NormalizedSourceRecord,
)
from lumina.catalog.domain.reviewed_slice import (
    ReviewedArtifact,
    ReviewedCompatibilityPair,
    ReviewedDataset,
    ReviewedEntity,
    ReviewedExpectedCounts,
    ReviewedProvider,
    ReviewedQuantity,
    ReviewedUnit,
)
from lumina.provenance.domain.manifests import (
    DataManifest,
    SourceManifest,
    parse_manifest_json,
)

REPOSITORY_ROOT: Final = Path(__file__).resolve().parents[6]
ARTIFACT_PATH: Final = "data/seed/simbad-messier-j2000-v2.csv"
ARTIFACT_SHA256: Final = "7d155edba33d1fc89b036da458de8dc40d387a5c898ef0c717f1463d49a38cdc"
ARTIFACT_BYTES: Final = 16889
RETRIEVED_AT: Final = datetime(2026, 8, 30, 8, 19, 30, tzinfo=UTC)
EXPECTED_PROVIDER: Final = "cds-simbad"
EXPECTED_DATASET: Final = "messier-j2000"
EXPECTED_RELEASE: Final = "v2"
EXPECTED_UNIT: Final = "deg"
PROVIDER_VERSION: Final = "SIMBAD4-1.8-2026-07"
DATASET_NAME: Final = "Messier SIMBAD ICRS J2000 reviewed target-semantics snapshot"
SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/cds-simbad.json"
DATA_MANIFEST_PATH: Final = "data/manifests/data/simbad-messier-j2000-v2.json"
SOURCE_MANIFEST_SHA256: Final = "eb45de6ef052d19b415741c8ea34e403c4469a6cfa43d4c5806674e74d5aaccb"
DATA_MANIFEST_SHA256: Final = "83bb27f9dba92a35f421ad43e9c64f4fef45dace5df15a85ed361b7dae38d9a4"
MESSIER_V2_STATE_SHA256: Final = "01e62570fbdc51db2b605c6756a2328cf0516f12faccbe8feead98683531010c"
RIGHT_ASCENSION_QUANTITY: Final = "icrs_right_ascension_j2000"
DECLINATION_QUANTITY: Final = "icrs_declination_j2000"
COORDINATE_ROLE: Final = "provider_record_catalogue_anchor"
COORDINATE_ROLE_DESCRIPTION: Final = (
    "Reviewed ICRS J2000 catalogue anchor/reference position of the resolved SIMBAD provider "
    "record; not an asserted geometric target centre."
)
TARGET_SCOPES: Final = frozenset(
    {"object", "extended", "compound", "region", "system", "apparent_group"}
)
EXPECTED_TYPES: Final = frozenset(
    {
        "?",
        "AGN",
        "As*",
        "err",
        "G",
        "GiC",
        "GiG",
        "GiP",
        "GlC",
        "H2G",
        "HII",
        "LIN",
        "OpC",
        "PN",
        "RNe",
        "SBG",
        "SNR",
        "Sy2",
        "SyG",
    }
)
EXPECTED_CANONICAL_TYPES: Final = frozenset({"cluster", "galaxy", "nebula", "sky_region", "system"})
_COLUMNS: Final = (
    "messier_number",
    "canonical_name",
    "slug",
    "canonical_entity_type",
    "target_scope",
    "coordinate_role",
    "requested_identifier",
    "oid",
    "main_id",
    "otype",
    "ra",
    "dec",
    "coo_qual",
    "coo_bibcode",
)
_RAW_COLUMNS: Final = (
    "requested_identifier",
    "oid",
    "main_id",
    "otype",
    "ra",
    "dec",
    "coo_qual",
    "coo_bibcode",
)


class MessierV2ArtifactError(ValueError):
    """The immutable reviewed v2 Messier artifact failed closed validation."""


@dataclass(frozen=True, slots=True)
class MessierV2Row:
    number: int
    canonical_name: str
    slug: str
    canonical_entity_type: str
    target_scope: str
    coordinate_role: str
    requested_identifier: str
    oid: str
    main_id: str
    otype: str
    ra: str
    dec: str
    coordinate_quality: str
    coordinate_bibcode: str | None

    @property
    def entity_id(self) -> UUID:
        return uuid5(NAMESPACE_URL, f"urn:lumina:catalog-entity:v1:messier:{self.slug}")


@dataclass(frozen=True, slots=True)
class MessierV2SliceContract:
    """Structural reviewed-slice contract used by the generic source-state checker."""

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


def _reject() -> NoReturn:
    raise MessierV2ArtifactError("The reviewed v2 Messier artifact was rejected.")


def _decimal(
    value: str, *, minimum: Decimal, maximum: Decimal, upper_exclusive: bool = False
) -> None:
    try:
        parsed = Decimal(value)
    except InvalidOperation:
        _reject()
    if (
        not parsed.is_finite()
        or parsed < minimum
        or (parsed >= maximum if upper_exclusive else parsed > maximum)
    ):
        _reject()


def read_messier_v2_artifact(
    *, repository_root: Path = REPOSITORY_ROOT
) -> tuple[MessierV2Row, ...]:
    """Read and validate the complete v2 artifact without network access."""
    path = repository_root / ARTIFACT_PATH
    try:
        artifact = path.read_bytes()
    except OSError:
        _reject()
    if len(artifact) != ARTIFACT_BYTES or hashlib.sha256(artifact).hexdigest() != ARTIFACT_SHA256:
        _reject()
    if b"\r" in artifact or not artifact.endswith(b"\n"):
        _reject()
    try:
        parsed = list(csv.reader(StringIO(artifact.decode("utf-8"), newline=""), strict=True))
    except (UnicodeDecodeError, csv.Error):
        _reject()
    if len(parsed) != 111 or tuple(parsed[0]) != _COLUMNS:
        _reject()

    rows: list[MessierV2Row] = []
    for values in parsed[1:]:
        if len(values) != len(_COLUMNS) or any(value != value.strip() for value in values):
            _reject()
        record = dict(zip(_COLUMNS, values, strict=True))
        try:
            number = int(record["messier_number"])
        except ValueError:
            _reject()
        if (
            not 1 <= number <= 110
            or record["canonical_name"] != f"Messier {number}"
            or record["slug"] != f"messier-{number}"
        ):
            _reject()
        if record["requested_identifier"] not in {
            f"M {number}",
            f"M  {number}",
            f"M   {number}",
        }:
            _reject()
        if (
            not record["oid"].isdigit()
            or not record["main_id"]
            or record["otype"] not in EXPECTED_TYPES
            or record["canonical_entity_type"] not in EXPECTED_CANONICAL_TYPES
            or record["target_scope"] not in TARGET_SCOPES
            or record["coordinate_role"] != COORDINATE_ROLE
        ):
            _reject()
        if record["coo_qual"] not in {"A", "B", "C", "D", "E", "F"}:
            _reject()
        _decimal(record["ra"], minimum=Decimal(0), maximum=Decimal(360), upper_exclusive=True)
        _decimal(record["dec"], minimum=Decimal(-90), maximum=Decimal(90))
        rows.append(
            MessierV2Row(
                number=number,
                canonical_name=record["canonical_name"],
                slug=record["slug"],
                canonical_entity_type=record["canonical_entity_type"],
                target_scope=record["target_scope"],
                coordinate_role=record["coordinate_role"],
                requested_identifier=record["requested_identifier"],
                oid=record["oid"],
                main_id=record["main_id"],
                otype=record["otype"],
                ra=record["ra"],
                dec=record["dec"],
                coordinate_quality=record["coo_qual"],
                coordinate_bibcode=record["coo_bibcode"] or None,
            )
        )
    if (
        tuple(row.number for row in rows) != tuple(range(1, 111))
        or len({row.oid for row in rows}) != 110
        or len({row.entity_id for row in rows}) != 110
    ):
        _reject()
    special_types = {
        row.number: row.canonical_entity_type for row in rows if row.number in {8, 16, 17, 20}
    }
    if special_types != {8: "nebula", 16: "nebula", 17: "nebula", 20: "nebula"}:
        _reject()
    special_scopes = {row.number: row.target_scope for row in rows if row.number in {8, 16, 17, 20}}
    if special_scopes != {8: "extended", 16: "compound", 17: "extended", 20: "extended"}:
        _reject()
    return tuple(rows)


def _manifests(*, repository_root: Path) -> tuple[SourceManifest, DataManifest]:
    source = parse_manifest_json(
        (repository_root / "data/manifests/sources/cds-simbad.json").read_bytes()
    )
    data = parse_manifest_json(
        (repository_root / "data/manifests/data/simbad-messier-j2000-v2.json").read_bytes()
    )
    if not isinstance(source, SourceManifest) or not isinstance(data, DataManifest):
        _reject()
    if (
        source.source_id != EXPECTED_PROVIDER
        or data.dataset_id != EXPECTED_DATASET
        or data.release_version != EXPECTED_RELEASE
    ):
        _reject()
    return source, data


def load_messier_v2_slice(
    slice_id: str = "simbad-messier-j2000-v2",
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> MessierV2SliceContract:
    """Load the v2 reviewed contract for immutable source-state verification."""
    if slice_id != "simbad-messier-j2000-v2":
        _reject()
    source, data = _manifests(repository_root=repository_root)
    if (
        hashlib.sha256((repository_root / SOURCE_MANIFEST_PATH).read_bytes()).hexdigest()
        != SOURCE_MANIFEST_SHA256
        or hashlib.sha256((repository_root / DATA_MANIFEST_PATH).read_bytes()).hexdigest()
        != DATA_MANIFEST_SHA256
        or data.local_file != ARTIFACT_PATH
        or data.checksum != f"sha256:{ARTIFACT_SHA256}"
        or data.parser_version != "simbad-messier-j2000-v2"
    ):
        _reject()
    rows = read_messier_v2_artifact(repository_root=repository_root)
    entities = tuple(
        ReviewedEntity(
            id=row.entity_id,
            entity_type=row.canonical_entity_type,
            canonical_name=row.canonical_name,
            identity_seed=f"urn:lumina:catalog-entity:v1:messier:{row.slug}",
            provider_record_id=row.oid,
        )
        for row in rows
    )
    quantities = (
        ReviewedQuantity(
            id=UUID("8354f911-f6fd-5b7c-90d8-6f9e5300982a"),
            code=RIGHT_ASCENSION_QUANTITY,
            name="ICRS right ascension (J2000.0)",
            source_fact_key="ra",
        ),
        ReviewedQuantity(
            id=UUID("3cf0863b-ed7a-5970-a147-bc6323479e5a"),
            code=DECLINATION_QUANTITY,
            name="ICRS declination (J2000.0)",
            source_fact_key="dec",
        ),
    )
    unit = ReviewedUnit(
        id=UUID("48176d92-8406-52ae-855a-aa2f48dfd089"),
        code=EXPECTED_UNIT,
        symbol="deg",
        name="degree",
    )
    identifiers = ",".join(f"'{row.requested_identifier}'" for row in rows)
    query = (
        "SELECT i.id AS requested_identifier,b.oid,b.main_id,b.otype,b.ra,b.dec,b.coo_qual,"
        "b.coo_bibcode FROM ident AS i JOIN basic AS b ON b.oid=i.oidref "
        f"WHERE i.id IN ({identifiers})"
    )
    return MessierV2SliceContract(
        slice_id="simbad-messier-j2000-v2",
        source_manifest_path=SOURCE_MANIFEST_PATH,
        data_manifest_path=DATA_MANIFEST_PATH,
        source_manifest=source,
        data_manifest=data,
        provider=ReviewedProvider(EXPECTED_PROVIDER, source.source_name),
        dataset=ReviewedDataset(EXPECTED_DATASET, DATASET_NAME, EXPECTED_RELEASE),
        provider_version=PROVIDER_VERSION,
        artifact=ReviewedArtifact(
            path=ARTIFACT_PATH,
            byte_length=ARTIFACT_BYTES,
            sha256=ARTIFACT_SHA256,
            adql=query,
            columns=_COLUMNS,
        ),
        entities=entities,
        quantities=quantities,
        unit=unit,
        compatibility_pairs=tuple(
            ReviewedCompatibilityPair(quantity.id, quantity.code, unit.id, unit.code)
            for quantity in quantities
        ),
        expected=ReviewedExpectedCounts(source_records=110, measurements=220),
    )


def build_reviewed_simbad_v2_commands(
    *, repository_root: Path = REPOSITORY_ROOT
) -> tuple[IngestReviewedDatasetCommand, ...]:
    """Build v2 commands from the reviewed artifact, without provider access."""
    rows = read_messier_v2_artifact(repository_root=repository_root)
    source_manifest, data_manifest = _manifests(repository_root=repository_root)
    commands: list[IngestReviewedDatasetCommand] = []
    for row in rows:
        try:
            measurements = (
                NormalizedMeasurement(
                    source_fact_key="ra",
                    quantity_code=RIGHT_ASCENSION_QUANTITY,
                    unit_code=EXPECTED_UNIT,
                    value_numeric=Decimal(row.ra),
                    original_value=row.ra,
                    original_unit=EXPECTED_UNIT,
                ),
                NormalizedMeasurement(
                    source_fact_key="dec",
                    quantity_code=DECLINATION_QUANTITY,
                    unit_code=EXPECTED_UNIT,
                    value_numeric=Decimal(row.dec),
                    original_value=row.dec,
                    original_unit=EXPECTED_UNIT,
                ),
            )
            commands.append(
                IngestReviewedDatasetCommand(
                    source_manifest=source_manifest,
                    data_manifest=data_manifest,
                    dataset_name=DATASET_NAME,
                    source_record=NormalizedSourceRecord(
                        provider_record_id=row.oid,
                        provider_version=PROVIDER_VERSION,
                        canonical_entity_id=row.entity_id,
                        source_url="https://simbad.cds.unistra.fr/simbad/sim-tap",
                        fetched_at=RETRIEVED_AT,
                        measurements=measurements,
                    ),
                )
            )
        except (TypeError, ValueError):
            _reject()
    return tuple(commands)


__all__ = [
    "ARTIFACT_BYTES",
    "ARTIFACT_PATH",
    "ARTIFACT_SHA256",
    "COORDINATE_ROLE",
    "COORDINATE_ROLE_DESCRIPTION",
    "DECLINATION_QUANTITY",
    "EXPECTED_DATASET",
    "EXPECTED_PROVIDER",
    "EXPECTED_RELEASE",
    "EXPECTED_UNIT",
    "DATASET_NAME",
    "DATA_MANIFEST_PATH",
    "DATA_MANIFEST_SHA256",
    "MESSIER_V2_STATE_SHA256",
    "MessierV2SliceContract",
    "MessierV2ArtifactError",
    "MessierV2Row",
    "RIGHT_ASCENSION_QUANTITY",
    "SOURCE_MANIFEST_PATH",
    "SOURCE_MANIFEST_SHA256",
    "PROVIDER_VERSION",
    "build_reviewed_simbad_v2_commands",
    "load_messier_v2_slice",
    "read_messier_v2_artifact",
]
