"""Offline, checksum-pinned SIMBAD Messier catalogue adapter.

The adapter accepts only the reviewed 110-row artifact.  It never contacts SIMBAD, and it keeps
the provider's object type and coordinate evidence in the reviewed artifact while emitting only
the identity and coordinate facts needed by the existing ingestion boundary.
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
from lumina.provenance.domain.manifests import (
    DataManifest,
    SourceManifest,
    parse_manifest_json,
)

REPOSITORY_ROOT: Final = Path(__file__).resolve().parents[6]
ARTIFACT_PATH: Final = "data/seed/simbad-messier-j2000-v1.csv"
ARTIFACT_SHA256: Final = "b29a5c8b3bf58eb3c7649f18f1f64446c6b3b12dbbb3d59c4e639befe2fbf0e9"
ARTIFACT_BYTES: Final = 15068
RETRIEVED_AT: Final = datetime(2026, 8, 30, 8, 19, 30, tzinfo=UTC)
EXPECTED_PROVIDER: Final = "cds-simbad"
EXPECTED_DATASET: Final = "messier-j2000"
EXPECTED_RELEASE: Final = "v1"
EXPECTED_UNIT: Final = "deg"
RIGHT_ASCENSION_QUANTITY: Final = "icrs_right_ascension_j2000"
DECLINATION_QUANTITY: Final = "icrs_declination_j2000"
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
TYPE_MAPPING: Final = {
    "?": "system",
    "AGN": "galaxy",
    "As*": "sky_region",
    "err": "sky_region",
    "G": "galaxy",
    "GiC": "galaxy",
    "GiG": "galaxy",
    "GiP": "galaxy",
    "GlC": "cluster",
    "H2G": "galaxy",
    "HII": "nebula",
    "LIN": "galaxy",
    "OpC": "cluster",
    "PN": "nebula",
    "RNe": "nebula",
    "SBG": "galaxy",
    "SNR": "nebula",
    "Sy2": "galaxy",
    "SyG": "galaxy",
}
_COLUMNS: Final = (
    "messier_number",
    "canonical_name",
    "slug",
    "entity_type",
    "requested_identifier",
    "oid",
    "main_id",
    "otype",
    "ra",
    "dec",
    "coo_qual",
    "coo_bibcode",
)


class MessierArtifactError(ValueError):
    """The immutable reviewed Messier artifact failed closed validation."""


@dataclass(frozen=True, slots=True)
class MessierRow:
    number: int
    canonical_name: str
    slug: str
    entity_type: str
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


def _reject() -> NoReturn:
    raise MessierArtifactError("The reviewed Messier artifact was rejected.")


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


def read_messier_artifact(*, repository_root: Path = REPOSITORY_ROOT) -> tuple[MessierRow, ...]:
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
        text = artifact.decode("utf-8")
        parsed = list(csv.reader(StringIO(text, newline=""), strict=True))
    except (UnicodeDecodeError, csv.Error):
        _reject()
    if len(parsed) != 111 or tuple(parsed[0]) != _COLUMNS:
        _reject()
    rows: list[MessierRow] = []
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
        if record["requested_identifier"] not in {f"M {number}", f"M  {number}", f"M   {number}"}:
            _reject()
        if (
            not record["oid"].isdigit()
            or not record["main_id"]
            or record["otype"] not in EXPECTED_TYPES
        ):
            _reject()
        if TYPE_MAPPING.get(record["otype"]) != record["entity_type"]:
            _reject()
        if record["coo_qual"] not in {"A", "B", "C", "D", "E", "F"}:
            _reject()
        _decimal(record["ra"], minimum=Decimal(0), maximum=Decimal(360), upper_exclusive=True)
        _decimal(record["dec"], minimum=Decimal(-90), maximum=Decimal(90))
        rows.append(
            MessierRow(
                number=number,
                canonical_name=record["canonical_name"],
                slug=record["slug"],
                entity_type=record["entity_type"],
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
    ):
        _reject()
    if len({row.entity_id for row in rows}) != 110:
        _reject()
    return tuple(rows)


def _manifests(*, repository_root: Path) -> tuple[SourceManifest, DataManifest]:
    source = parse_manifest_json(
        (repository_root / "data/manifests/sources/cds-simbad.json").read_bytes()
    )
    data = parse_manifest_json(
        (repository_root / "data/manifests/data/simbad-messier-j2000-v1.json").read_bytes()
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


def build_reviewed_simbad_commands(
    *, repository_root: Path = REPOSITORY_ROOT
) -> tuple[IngestReviewedDatasetCommand, ...]:
    """Build the 110 reviewed, manifest-backed ingestion commands without network access."""
    rows = read_messier_artifact(repository_root=repository_root)
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
                    dataset_name="Messier SIMBAD ICRS J2000 reviewed snapshot",
                    source_record=NormalizedSourceRecord(
                        provider_record_id=row.oid,
                        provider_version="SIMBAD4-1.8-2026-07",
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
