"""Closed contract for Lumina's independently pinned Gaia DR3 sky context.

This product is immutable rendering context. It does not create catalogue
entities, measurements, database records, or a runtime Gaia dependency.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath
from typing import Final, NoReturn

REPOSITORY_ROOT: Final = Path(__file__).resolve().parents[6]
BRIGHT_STAR_DATASET_ID: Final = "gaia-dr3-bright-sky-context-v1"
BRIGHT_STAR_MANIFEST_PATH: Final = "data/sky/gaia-dr3-bright-sky-context-v1.json"
BRIGHT_STAR_MANIFEST_SHA256: Final = (
    "d3645cf73ae7eb47147b8224e0cd6abec7f3696c007ddd21303e521ff6c0923c"
)
BRIGHT_STAR_ARTIFACT_PATH: Final = "apps/web/public/data/gaia-dr3-bright-sky-context-v1.csv"
BRIGHT_STAR_ARTIFACT_SHA256: Final = (
    "a7ed657ea1fef1cbef23b4ebbba493da9fdbcdd51e8ec4e7484ba58d91eb7bb3"
)
BRIGHT_STAR_ARTIFACT_BYTES: Final = 474_384
BRIGHT_STAR_ROW_COUNT: Final = 3_690
BRIGHT_STAR_MAXIMUM_BYTES: Final = 2 * 1024 * 1024
BRIGHT_STAR_MAXIMUM_ROWS: Final = 10_000
BRIGHT_STAR_SOLUTION_ID: Final = "1636148068921376768"
BRIGHT_STAR_REFERENCE_EPOCH: Final = "2016.0"
BRIGHT_STAR_REFERENCE_EPOCH_LABEL: Final = "J2016.0"
BRIGHT_STAR_MAXIMUM_G_MAGNITUDE: Final = Decimal("5.5")
BRIGHT_STAR_COLUMNS: Final = (
    "source_id",
    "solution_id",
    "designation",
    "ref_epoch",
    "ra",
    "dec",
    "phot_g_mean_mag",
    "duplicated_source",
)
BRIGHT_STAR_ADQL: Final = (
    "SELECT source_id, solution_id, designation, ref_epoch, ra, dec, "
    "phot_g_mean_mag, duplicated_source FROM gaiadr3.gaia_source WHERE "
    "phot_g_mean_mag IS NOT NULL AND phot_g_mean_mag <= 5.5 AND ra IS NOT NULL "
    "AND dec IS NOT NULL AND duplicated_source = 'false' ORDER BY "
    "phot_g_mean_mag ASC, source_id ASC"
)

_POSITIVE_INTEGER = re.compile(r"[1-9][0-9]*\Z")
_FINITE_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?\Z")


class BrightStarArtifactRejected(ValueError):
    """Safe failure for any manifest or artifact contract violation."""

    def __init__(self) -> None:
        super().__init__("The Gaia DR3 bright-star context artifact was rejected.")


@dataclass(frozen=True, slots=True)
class BrightStarManifest:
    """Reviewed provenance and closure values for the immutable data product."""

    dataset_id: str
    provider: str
    release: str
    table: str
    adql: str
    artifact_path: str
    artifact_byte_count: int
    artifact_sha256: str
    columns: tuple[str, ...]
    row_count: int
    maximum_g_magnitude: Decimal
    solution_id: str
    reference_epoch: str
    reference_epoch_label: str
    retrieved_at: str


@dataclass(frozen=True, slots=True)
class BrightStarArtifactRow:
    """One validated source row retaining the archive's numeric lexemes."""

    source_id: str
    solution_id: str
    designation: str
    ref_epoch: str
    right_ascension: str
    declination: str
    g_magnitude: str
    duplicated_source: str


@dataclass(frozen=True, slots=True)
class BrightStarArtifactReview:
    """Validated rows plus exact scientific range evidence."""

    rows: tuple[BrightStarArtifactRow, ...]
    minimum_g_magnitude: Decimal
    maximum_g_magnitude: Decimal
    minimum_right_ascension: Decimal
    maximum_right_ascension: Decimal
    minimum_declination: Decimal
    maximum_declination: Decimal


def _reject() -> NoReturn:
    raise BrightStarArtifactRejected()


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            _reject()
        result[key] = value
    return result


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


def _read_regular_file(root: Path, relative_path: str, *, maximum_bytes: int) -> bytes:
    path_text = _checked_relative_path(relative_path)
    resolved_root = root.resolve()
    path = resolved_root.joinpath(*PurePosixPath(path_text).parts)
    try:
        if path.is_symlink() or not path.is_file():
            _reject()
        path.resolve(strict=True).relative_to(resolved_root)
        if path.stat().st_size > maximum_bytes:
            _reject()
        with path.open("rb") as handle:
            content = handle.read(maximum_bytes + 1)
    except (OSError, ValueError):
        _reject()
    if len(content) > maximum_bytes:
        _reject()
    return content


def _require_object(value: object, fields: frozenset[str]) -> dict[str, object]:
    if type(value) is not dict or set(value) != fields:
        _reject()
    return value


def _require_string(value: object) -> str:
    if type(value) is not str or not value:
        _reject()
    return value


def _require_integer(value: object) -> int:
    if type(value) is not int:
        _reject()
    return value


def _require_string_list(value: object, *, length: int) -> tuple[str, ...]:
    if type(value) is not list or len(value) != length:
        _reject()
    return tuple(_require_string(item) for item in value)


def load_bright_star_manifest(*, repository_root: Path = REPOSITORY_ROOT) -> BrightStarManifest:
    """Load only the canonical, checksum-pinned bright-sky manifest."""
    content = _read_regular_file(repository_root, BRIGHT_STAR_MANIFEST_PATH, maximum_bytes=32_768)
    if hashlib.sha256(content).hexdigest() != BRIGHT_STAR_MANIFEST_SHA256:
        _reject()
    try:
        document = json.loads(
            content.decode("utf-8"),
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=lambda _value: _reject(),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        _reject()
    if type(document) is not dict or _canonical_json_bytes(document) != content:
        _reject()
    root = _require_object(
        document,
        frozenset(
            {
                "adql",
                "artifact",
                "attribution",
                "brightness_selection",
                "dataset_id",
                "documentation_url",
                "limitations",
                "ordering",
                "official_url",
                "provider",
                "reference_epoch_policy",
                "release",
                "retrieved_at",
                "schema_version",
                "solution_id",
                "table",
                "terms_url",
                "usage_purpose",
            }
        ),
    )
    artifact = _require_object(
        root["artifact"],
        frozenset({"byte_count", "columns", "path", "row_count", "sha256"}),
    )
    selection = _require_object(
        root["brightness_selection"],
        frozenset({"field", "maximum_inclusive", "photometric_scale", "quantity"}),
    )
    epoch = _require_object(
        root["reference_epoch_policy"],
        frozenset({"catalogue_epoch", "field_value", "proper_motion_propagated", "time_scale"}),
    )
    manifest = BrightStarManifest(
        dataset_id=_require_string(root["dataset_id"]),
        provider=_require_string(root["provider"]),
        release=_require_string(root["release"]),
        table=_require_string(root["table"]),
        adql=_require_string(root["adql"]),
        artifact_path=_checked_relative_path(artifact["path"]),
        artifact_byte_count=_require_integer(artifact["byte_count"]),
        artifact_sha256=_require_string(artifact["sha256"]),
        columns=_require_string_list(artifact["columns"], length=8),
        row_count=_require_integer(artifact["row_count"]),
        maximum_g_magnitude=Decimal(_require_string(selection["maximum_inclusive"])),
        solution_id=_require_string(root["solution_id"]),
        reference_epoch=_require_string(epoch["field_value"]),
        reference_epoch_label=_require_string(epoch["catalogue_epoch"]),
        retrieved_at=_require_string(root["retrieved_at"]),
    )
    if (
        _require_integer(root["schema_version"]) != 1
        or manifest.dataset_id != BRIGHT_STAR_DATASET_ID
        or manifest.provider != "ESA Gaia Archive"
        or manifest.release != "Gaia DR3"
        or manifest.table != "gaiadr3.gaia_source"
        or manifest.adql != BRIGHT_STAR_ADQL
        or manifest.artifact_path != BRIGHT_STAR_ARTIFACT_PATH
        or manifest.artifact_byte_count != BRIGHT_STAR_ARTIFACT_BYTES
        or manifest.artifact_sha256 != BRIGHT_STAR_ARTIFACT_SHA256
        or manifest.columns != BRIGHT_STAR_COLUMNS
        or manifest.row_count != BRIGHT_STAR_ROW_COUNT
        or manifest.maximum_g_magnitude != BRIGHT_STAR_MAXIMUM_G_MAGNITUDE
        or manifest.solution_id != BRIGHT_STAR_SOLUTION_ID
        or manifest.reference_epoch != BRIGHT_STAR_REFERENCE_EPOCH
        or manifest.reference_epoch_label != BRIGHT_STAR_REFERENCE_EPOCH_LABEL
        or selection
        != {
            "field": "phot_g_mean_mag",
            "maximum_inclusive": "5.5",
            "photometric_scale": "Vega",
            "quantity": "Gaia G-band mean magnitude",
        }
        or epoch
        != {
            "catalogue_epoch": "J2016.0",
            "field_value": "2016.0",
            "proper_motion_propagated": False,
            "time_scale": "TCB",
        }
        or root["ordering"] != ["phot_g_mean_mag ASC", "source_id ASC"]
        or root["usage_purpose"]
        != "All-sky bounded Gaia DR3 bright-star context for the Lumina Sky Finder."
        or type(root["limitations"]) is not list
        or len(root["limitations"]) != 6
    ):
        _reject()
    return manifest


def _decimal(lexeme: str) -> Decimal:
    if _FINITE_DECIMAL.fullmatch(lexeme) is None:
        _reject()
    try:
        value = Decimal(lexeme)
    except InvalidOperation:
        _reject()
    if not value.is_finite():
        _reject()
    return value


def parse_bright_star_artifact(
    content: bytes,
    *,
    expected_row_count: int = BRIGHT_STAR_ROW_COUNT,
) -> BrightStarArtifactReview:
    """Strictly parse a complete artifact; malformed input yields no partial result."""
    if (
        type(content) is not bytes
        or len(content) > BRIGHT_STAR_MAXIMUM_BYTES
        or not content.endswith(b"\n")
        or b"\r" in content
        or b"\x00" in content
    ):
        _reject()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        _reject()
    physical_lines = text.splitlines()
    if (
        len(physical_lines) != expected_row_count + 1
        or len(physical_lines) > BRIGHT_STAR_MAXIMUM_ROWS + 1
        or any(not line for line in physical_lines)
    ):
        _reject()
    try:
        csv_rows = list(csv.reader(io.StringIO(text, newline=""), strict=True))
    except (csv.Error, UnicodeError):
        _reject()
    if not csv_rows or tuple(csv_rows[0]) != BRIGHT_STAR_COLUMNS:
        _reject()

    rows: list[BrightStarArtifactRow] = []
    seen_source_ids: set[str] = set()
    previous_order: tuple[Decimal, int] | None = None
    right_ascensions: list[Decimal] = []
    declinations: list[Decimal] = []
    magnitudes: list[Decimal] = []
    for fields in csv_rows[1:]:
        if len(fields) != len(BRIGHT_STAR_COLUMNS):
            _reject()
        source_id, solution_id, designation, ref_epoch, ra, dec, magnitude, duplicated = fields
        if (
            _POSITIVE_INTEGER.fullmatch(source_id) is None
            or source_id in seen_source_ids
            or solution_id != BRIGHT_STAR_SOLUTION_ID
            or designation != f"Gaia DR3 {source_id}"
            or ref_epoch != BRIGHT_STAR_REFERENCE_EPOCH
            or duplicated != "false"
        ):
            _reject()
        ra_value = _decimal(ra)
        dec_value = _decimal(dec)
        magnitude_value = _decimal(magnitude)
        if (
            not Decimal(0) <= ra_value < Decimal(360)
            or not Decimal(-90) <= dec_value <= Decimal(90)
            or magnitude_value > BRIGHT_STAR_MAXIMUM_G_MAGNITUDE
        ):
            _reject()
        order = (magnitude_value, int(source_id))
        if previous_order is not None and order < previous_order:
            _reject()
        previous_order = order
        seen_source_ids.add(source_id)
        right_ascensions.append(ra_value)
        declinations.append(dec_value)
        magnitudes.append(magnitude_value)
        rows.append(
            BrightStarArtifactRow(
                source_id=source_id,
                solution_id=solution_id,
                designation=designation,
                ref_epoch=ref_epoch,
                right_ascension=ra,
                declination=dec,
                g_magnitude=magnitude,
                duplicated_source=duplicated,
            )
        )
    if len(rows) != expected_row_count or not rows:
        _reject()
    return BrightStarArtifactReview(
        rows=tuple(rows),
        minimum_g_magnitude=min(magnitudes),
        maximum_g_magnitude=max(magnitudes),
        minimum_right_ascension=min(right_ascensions),
        maximum_right_ascension=max(right_ascensions),
        minimum_declination=min(declinations),
        maximum_declination=max(declinations),
    )


def validate_bright_star_artifact(
    *, repository_root: Path = REPOSITORY_ROOT
) -> BrightStarArtifactReview:
    """Verify exact repository bytes and every reviewed Gaia row."""
    manifest = load_bright_star_manifest(repository_root=repository_root)
    content = _read_regular_file(
        repository_root,
        manifest.artifact_path,
        maximum_bytes=BRIGHT_STAR_MAXIMUM_BYTES,
    )
    if (
        len(content) != manifest.artifact_byte_count
        or hashlib.sha256(content).hexdigest() != manifest.artifact_sha256
    ):
        _reject()
    return parse_bright_star_artifact(content, expected_row_count=manifest.row_count)


__all__ = [
    "BRIGHT_STAR_ADQL",
    "BRIGHT_STAR_ARTIFACT_BYTES",
    "BRIGHT_STAR_ARTIFACT_PATH",
    "BRIGHT_STAR_ARTIFACT_SHA256",
    "BRIGHT_STAR_COLUMNS",
    "BRIGHT_STAR_DATASET_ID",
    "BRIGHT_STAR_MANIFEST_PATH",
    "BRIGHT_STAR_MANIFEST_SHA256",
    "BRIGHT_STAR_REFERENCE_EPOCH",
    "BRIGHT_STAR_REFERENCE_EPOCH_LABEL",
    "BRIGHT_STAR_ROW_COUNT",
    "BRIGHT_STAR_SOLUTION_ID",
    "BrightStarArtifactRejected",
    "BrightStarArtifactReview",
    "BrightStarArtifactRow",
    "BrightStarManifest",
    "load_bright_star_manifest",
    "parse_bright_star_artifact",
    "validate_bright_star_artifact",
]
