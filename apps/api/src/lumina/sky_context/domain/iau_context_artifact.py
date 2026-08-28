"""Closed validators for Lumina's Phase 2E sky-context artifacts.

The named-star and constellation products are immutable, same-origin rendering
context.  They are deliberately kept outside the catalogue schema and are
validated as closed JSON documents before publication or use in the browser.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from io import StringIO
from pathlib import Path, PurePosixPath
from typing import Final, NoReturn

from lumina.sky_context.domain.bright_star_artifact import (
    BRIGHT_STAR_ARTIFACT_PATH,
    BRIGHT_STAR_ARTIFACT_SHA256,
    BRIGHT_STAR_DATASET_ID,
    BRIGHT_STAR_ROW_COUNT,
    BrightStarArtifactRejected,
    BrightStarArtifactReview,
    validate_bright_star_artifact,
)

from .bright_star_artifact import REPOSITORY_ROOT

NAMED_ANCHOR_DATASET_ID: Final = "iau-named-gaia-bright-anchors-v1"
NAMED_ANCHOR_MANIFEST_PATH: Final = "data/sky/iau-named-gaia-bright-anchors-v1.json"
NAMED_ANCHOR_MANIFEST_SHA256: Final = (
    "e3b0d74a5fd137f790d7ec01d7b4383c5dcb4e61d314f342dea2f6a58a6043c0"
)
NAMED_ANCHOR_ARTIFACT_PATH: Final = (
    "apps/web/public/data/iau-named-gaia-bright-anchors-v1.json"
)
NAMED_ANCHOR_ARTIFACT_SHA256: Final = (
    "68097843437fe7eea89f1b577b4ed3fd7956238fd84d2c7fcb2d8de1696d1aa7"
)
NAMED_ANCHOR_ARTIFACT_BYTES: Final = 79_245
NAMED_ANCHOR_ROW_COUNT: Final = 236
NAMED_ANCHOR_MAXIMUM_BYTES: Final = 512 * 1024
NAMED_ANCHOR_COLUMNS: Final = (
    "iau_name",
    "hip_id",
    "iau_constellation_abbreviation",
    "date_approved",
    "gaia_source_id",
    "gaia_crossmatch_angular_distance_arcsec",
    "gaia_crossmatch_neighbour_count",
    "gaia_crossmatch_flag",
)

CONSTELLATION_DATASET_ID: Final = "iau-constellation-context-v1"
CONSTELLATION_MANIFEST_PATH: Final = "data/sky/iau-constellation-context-v1.json"
CONSTELLATION_MANIFEST_SHA256: Final = (
    "9b48bea5bfade55326368e4abb20b3039397798a98032118535871b319652c5c"
)
CONSTELLATION_ARTIFACT_PATH: Final = "apps/web/public/data/iau-constellation-context-v1.json"
CONSTELLATION_ARTIFACT_SHA256: Final = (
    "c4c4710f1f57ec9575e658d7a9a6c9b003bb1d61c6fed6797def5f4b6f78795e"
)
CONSTELLATION_ARTIFACT_BYTES: Final = 236_885
CONSTELLATION_ROW_COUNT: Final = 88
CONSTELLATION_PART_COUNT: Final = 89
CONSTELLATION_VERTEX_COUNT: Final = 1_565
CONSTELLATION_MAXIMUM_BYTES: Final = 512 * 1024
CONSTELLATION_COLUMNS: Final = (
    "latin_name",
    "abbreviation",
    "english_name",
    "boundary_parts",
    "target_memberships",
)

_TARGET_ASTROMETRY_MANIFEST_PATH: Final = "data/seed/gaia-dr3-exoplanet-host-astrometry-v1.json"
_TARGET_ASTROMETRY_ARTIFACT_PATH: Final = "data/seed/gaia-dr3-exoplanet-host-astrometry-v1.csv"
_TARGET_ASTROMETRY_COLUMNS: Final = (
    "source_id",
    "solution_id",
    "designation",
    "ref_epoch",
    "ra",
    "ra_error",
    "dec",
    "dec_error",
)

_POSITIVE_INTEGER = re.compile(r"[1-9][0-9]*\Z")
_DATE_APPROVED = re.compile(r"[0-9]{4}/[0-9]{2}/[0-9]{2}\Z")
_TARGET_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")

# This is the exact identity set published on the IAU constellation page.  It
# protects the 88-region contract from accepting a same-sized fictional set.
_OFFICIAL_CONSTELLATIONS: Final = {
    "And": ("Andromeda", "the Chained Maiden"),
    "Ant": ("Antlia", "the Air Pump"),
    "Aps": ("Apus", "the Bird of Paradise"),
    "Aql": ("Aquila", "the Eagle"),
    "Aqr": ("Aquarius", "the Water Bearer"),
    "Ara": ("Ara", "the Altar"),
    "Ari": ("Aries", "the Ram"),
    "Aur": ("Auriga", "the Charioteer"),
    "Boo": ("Boötes", "the Herdsman"),
    "CMa": ("Canis Major", "the Great Dog"),
    "CMi": ("Canis Minor", "the Lesser Dog"),
    "CVn": ("Canes Venatici", "the Hunting Dogs"),
    "Cae": ("Caelum", "the Engraving Tool"),
    "Cam": ("Camelopardalis", "the Giraffe"),
    "Cap": ("Capricornus", "the Sea Goat"),
    "Car": ("Carina", "the Keel"),
    "Cas": ("Cassiopeia", "the Seated Queen"),
    "Cen": ("Centaurus", "the Centaur"),
    "Cep": ("Cepheus", "the King"),
    "Cet": ("Cetus", "the Sea Monster"),
    "Cha": ("Chamaeleon", "the Chameleon"),
    "Cir": ("Circinus", "the Drawing Compass"),
    "Cnc": ("Cancer", "the Crab"),
    "Col": ("Columba", "the Dove"),
    "Com": ("Coma Berenices", "the Bernice's Hair"),
    "CrA": ("Corona Australis", "the Southern Crown"),
    "CrB": ("Corona Borealis", "the Northern Crown"),
    "Crt": ("Crater", "the Cup"),
    "Cru": ("Crux", "the Southern Cross"),
    "Crv": ("Corvus", "the Crow"),
    "Cyg": ("Cygnus", "the Swan"),
    "Del": ("Delphinus", "the Dolphin"),
    "Dor": ("Dorado", "the Swordfish"),
    "Dra": ("Draco", "the Dragon"),
    "Equ": ("Equuleus", "the Little Horse"),
    "Eri": ("Eridanus", "the River"),
    "For": ("Fornax", "the Furnace"),
    "Gem": ("Gemini", "the Twins"),
    "Gru": ("Grus", "the Crane"),
    "Her": ("Hercules", "the Hercules"),
    "Hor": ("Horologium", "the Clock"),
    "Hya": ("Hydra", "the Female Water Snake"),
    "Hyi": ("Hydrus", "the Male Water Snake"),
    "Ind": ("Indus", "the Indian"),
    "LMi": ("Leo Minor", "the Lesser Lion"),
    "Lac": ("Lacerta", "the Lizard"),
    "Leo": ("Leo", "the Lion"),
    "Lep": ("Lepus", "the Hare"),
    "Lib": ("Libra", "the Scales"),
    "Lup": ("Lupus", "the Wolf"),
    "Lyn": ("Lynx", "the Lynx"),
    "Lyr": ("Lyra", "the Lyre"),
    "Men": ("Mensa", "the Table Mountain"),
    "Mic": ("Microscopium", "the Microscope"),
    "Mon": ("Monoceros", "the Unicorn"),
    "Mus": ("Musca", "the Fly"),
    "Nor": ("Norma", "the Carpenter's Square"),
    "Oct": ("Octans", "the Octant"),
    "Oph": ("Ophiuchus", "the Serpent Bearer"),
    "Ori": ("Orion", "the Hunter"),
    "Pav": ("Pavo", "the Peacock"),
    "Peg": ("Pegasus", "the Winged Horse"),
    "Per": ("Perseus", "the Hero"),
    "Phe": ("Phoenix", "the Phoenix"),
    "Pic": ("Pictor", "the Painter's Easel"),
    "PsA": ("Piscis Austrinus", "the Southern Fish"),
    "Psc": ("Pisces", "the Fishes"),
    "Pup": ("Puppis", "the Stern"),
    "Pyx": ("Pyxis", "the Mariner Compass"),
    "Ret": ("Reticulum", "the Reticle"),
    "Scl": ("Sculptor", "the Sculptor"),
    "Sco": ("Scorpius", "the Scorpion"),
    "Sct": ("Scutum", "the Shield"),
    "Ser": ("Serpens", "the Serpent"),
    "Sex": ("Sextans", "the Sextant"),
    "Sge": ("Sagitta", "the Arrow"),
    "Sgr": ("Sagittarius", "the Archer"),
    "Tau": ("Taurus", "the Bull"),
    "Tel": ("Telescopium", "the Telescope"),
    "TrA": ("Triangulum Australe", "the Southern Triangle"),
    "Tri": ("Triangulum", "the Triangle"),
    "Tuc": ("Tucana", "the Toucan"),
    "UMa": ("Ursa Major", "the Great Bear"),
    "UMi": ("Ursa Minor", "the Little Bear"),
    "Vel": ("Vela", "the Sails"),
    "Vir": ("Virgo", "the Maiden"),
    "Vol": ("Volans", "the Flying Fish"),
    "Vul": ("Vulpecula", "the Fox"),
}


class IAUContextArtifactRejected(ValueError):
    """Safe failure for any Phase 2E manifest or artifact violation."""

    def __init__(self) -> None:
        super().__init__("The Phase 2E IAU sky-context artifact was rejected.")


@dataclass(frozen=True, slots=True)
class NamedAnchorArtifactRow:
    """One accepted official name and its auditable Gaia cross-match evidence."""

    iau_name: str
    hip_id: int
    iau_constellation_abbreviation: str
    date_approved: str
    gaia_source_id: str
    gaia_crossmatch_angular_distance_arcsec: float
    gaia_crossmatch_neighbour_count: int
    gaia_crossmatch_flag: int


@dataclass(frozen=True, slots=True)
class NamedAnchorArtifactReview:
    """Validated named anchors, separated from the browser's bright-star rows."""

    rows: tuple[NamedAnchorArtifactRow, ...]


@dataclass(frozen=True, slots=True)
class BoundaryVertex:
    """A normalized IAU J2000 boundary vertex in degrees."""

    right_ascension_degrees: float
    declination_degrees: float


@dataclass(frozen=True, slots=True)
class BoundaryPart:
    """One ordered boundary part; the final vertex joins back to the first."""

    source_file: str
    vertices: tuple[BoundaryVertex, ...]


@dataclass(frozen=True, slots=True)
class ConstellationArtifactRow:
    """One official constellation identity and its region geometry."""

    abbreviation: str
    latin_name: str
    english_name: str
    boundary_parts: tuple[BoundaryPart, ...]


@dataclass(frozen=True, slots=True)
class TargetMembership:
    """Frozen bounded target-to-region evidence for current Lumina targets."""

    target_slug: str
    target_name: str
    gaia_source_id: str
    right_ascension_degrees: float
    declination_degrees: float
    constellation_abbreviation: str


@dataclass(frozen=True, slots=True)
class ConstellationArtifactReview:
    """Validated official regions and bounded target membership evidence."""

    constellations: tuple[ConstellationArtifactRow, ...]
    target_memberships: tuple[TargetMembership, ...]


def _reject() -> NoReturn:
    raise IAUContextArtifactRejected()


def _canonical_json_bytes(value: object) -> bytes:
    try:
        return (
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n"
        ).encode("utf-8")
    except (TypeError, UnicodeError, ValueError):
        _reject()


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            _reject()
        result[key] = value
    return result


def _parse_document(content: bytes) -> dict[str, object]:
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
    return document


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


def _load_pinned_document(
    root: Path,
    relative_path: str,
    expected_sha256: str,
    *,
    maximum_bytes: int,
) -> dict[str, object]:
    content = _read_regular_file(root, relative_path, maximum_bytes=maximum_bytes)
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        _reject()
    return _parse_document(content)


def _require_object(value: object, fields: frozenset[str]) -> dict[str, object]:
    if type(value) is not dict or set(value) != fields:
        _reject()
    return value


def _require_string(value: object) -> str:
    if type(value) is not str or not value or value != value.strip() or "\x00" in value:
        _reject()
    return value


def _require_string_list(value: object, *, length: int) -> tuple[str, ...]:
    if type(value) is not list or len(value) != length:
        _reject()
    return tuple(_require_string(item) for item in value)


def _require_positive_integer(value: object) -> int:
    if type(value) is not int or value <= 0:
        _reject()
    return value


def _require_nonnegative_integer(value: object) -> int:
    if type(value) is not int or value < 0:
        _reject()
    return value


def _require_finite_number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _reject()
    number = float(value)
    if not math.isfinite(number):
        _reject()
    return number


def _require_date_approved(value: object) -> str:
    text = _require_string(value)
    if _DATE_APPROVED.fullmatch(text) is None:
        _reject()
    try:
        year, month, day = (int(part) for part in text.split("/"))
        date(year, month, day)
    except (TypeError, ValueError):
        _reject()
    return text


def _require_gaia_source_id(value: object) -> str:
    text = _require_string(value)
    if _POSITIVE_INTEGER.fullmatch(text) is None:
        _reject()
    return text


def _validate_named_manifest(document: dict[str, object]) -> None:
    root = _require_object(
        document,
        frozenset(
            {
                "artifact",
                "attribution",
                "bright_context_dependency",
                "catalogue_snapshot",
                "crossmatch",
                "dataset_id",
                "limitations",
                "rejection_counts",
                "schema_version",
                "source_authority",
                "source_catalogue_url",
                "source_guidelines_url",
                "terms_url",
                "usage_purpose",
            }
        ),
    )
    if root["dataset_id"] != NAMED_ANCHOR_DATASET_ID or root["schema_version"] != 1:
        _reject()
    artifact = _require_object(
        root["artifact"], frozenset({"byte_count", "columns", "path", "row_count", "sha256"})
    )
    if (
        artifact["byte_count"] != NAMED_ANCHOR_ARTIFACT_BYTES
        or artifact["path"] != NAMED_ANCHOR_ARTIFACT_PATH
        or artifact["row_count"] != NAMED_ANCHOR_ROW_COUNT
        or artifact["sha256"] != NAMED_ANCHOR_ARTIFACT_SHA256
        or tuple(_require_string_list(artifact["columns"], length=len(NAMED_ANCHOR_COLUMNS)))
        != NAMED_ANCHOR_COLUMNS
    ):
        _reject()

    dependency = _require_object(
        root["bright_context_dependency"],
        frozenset({"artifact_path", "artifact_sha256", "dataset_id", "row_count"}),
    )
    if dependency != {
        "artifact_path": BRIGHT_STAR_ARTIFACT_PATH,
        "artifact_sha256": BRIGHT_STAR_ARTIFACT_SHA256,
        "dataset_id": BRIGHT_STAR_DATASET_ID,
        "row_count": BRIGHT_STAR_ROW_COUNT,
    }:
        _reject()

    catalogue = _require_object(
        root["catalogue_snapshot"],
        frozenset(
            {
                "catalogue",
                "raw_row_count",
                "retrieved_at",
                "rows_with_numeric_hip",
                "source_fields_used",
                "source_url",
                "unique_numeric_hip",
            }
        ),
    )
    if (
        catalogue["catalogue"] != "IAU Catalog of Star Names (CSN)"
        or catalogue["raw_row_count"] != 627
        or catalogue["rows_with_numeric_hip"] != 553
        or catalogue["unique_numeric_hip"] != 552
        or tuple(_require_string_list(catalogue["source_fields_used"], length=4))
        != ("proper names", "HIP", "Constellation", "Date of Adoption")
        or catalogue["source_url"] != "https://exopla.net/star-names/modern-iau-star-names/"
    ):
        _reject()
    _require_string(catalogue["retrieved_at"])

    crossmatch = _require_object(
        root["crossmatch"],
        frozenset(
            {
                "accepted_flag_distribution",
                "ambiguity_policy",
                "candidate_rows_intersecting_bright_context",
                "documentation_url",
                "fields",
                "hip_id_input_count",
                "hip_id_input_sha256",
                "query",
                "rejected_rows",
                "returned_row_count",
                "table",
            }
        ),
    )
    if (
        crossmatch["candidate_rows_intersecting_bright_context"] != NAMED_ANCHOR_ROW_COUNT + 1
        or crossmatch["documentation_url"]
        != "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_cross-matches/ssec_dm_hipparcos2_best_neighbour.html"
        or tuple(_require_string_list(crossmatch["fields"], length=5)) != (
            "source_id",
            "original_ext_source_id",
            "angular_distance",
            "number_of_neighbours",
            "xm_flag",
        )
        or crossmatch["hip_id_input_count"] != 552
        or crossmatch["returned_row_count"] != 346
        or crossmatch["table"] != "gaiadr3.hipparcos2_best_neighbour"
    ):
        _reject()
    _require_string(crossmatch["hip_id_input_sha256"])
    _require_string(crossmatch["query"])
    distributions = crossmatch["accepted_flag_distribution"]
    if type(distributions) is not list:
        _reject()
    for item in distributions:
        entry = _require_object(item, frozenset({"flag", "row_count"}))
        _require_nonnegative_integer(entry["flag"])
        _require_positive_integer(entry["row_count"])
    policy = _require_object(
        crossmatch["ambiguity_policy"],
        frozenset(
            {
                "duplicate_iau_hip_identity",
                "gaia_xm_flag_ambiguous_bits_mask",
                "number_of_neighbours",
                "note",
            }
        ),
    )
    if (
        policy["duplicate_iau_hip_identity"] != "reject the affected name path"
        or policy["gaia_xm_flag_ambiguous_bits_mask"] != 3
        or policy["number_of_neighbours"] != 1
    ):
        _reject()
    _require_string(policy["note"])
    rejected_rows = crossmatch["rejected_rows"]
    if type(rejected_rows) is not list or len(rejected_rows) != 1:
        _reject()
    rejected = _require_object(
        rejected_rows[0],
        frozenset(
            {
                "gaia_crossmatch_flag",
                "gaia_crossmatch_neighbour_count",
                "gaia_source_id",
                "hip_id",
                "iau_name",
                "reason",
            }
        ),
    )
    if (
        rejected["iau_name"] != "Guansuo"
        or rejected["hip_id"] != 76127
        or rejected["reason"] != "multiple-gaia-neighbours"
        or rejected["gaia_source_id"] != "1274286186493145728"
        or rejected["gaia_crossmatch_neighbour_count"] != 2
        or rejected["gaia_crossmatch_flag"] != 8
    ):
        _reject()

    if root["rejection_counts"] != {
        "missing-numeric-hip": 74,
        "no-gaia-crossmatch": 206,
        "outside-phase-2d-bright-context": 110,
        "multiple-gaia-neighbours": 1,
    }:
        _reject()
    for key in (
        "attribution",
        "source_authority",
        "source_catalogue_url",
        "source_guidelines_url",
        "terms_url",
        "usage_purpose",
    ):
        _require_string(root[key])
    if root["source_authority"] != "International Astronomical Union Working Group on Star Names":
        _reject()
    if root["source_catalogue_url"] != catalogue["source_url"]:
        _reject()
    limitations = root["limitations"]
    if type(limitations) is not list or not limitations or any(
        type(item) is not str or not item for item in limitations
    ):
        _reject()


def parse_named_anchor_artifact(
    content: bytes,
    *,
    expected_row_count: int = NAMED_ANCHOR_ROW_COUNT,
) -> NamedAnchorArtifactReview:
    """Parse a complete named-anchor artifact without allowing partial rows."""
    if not isinstance(expected_row_count, int) or expected_row_count <= 0:
        _reject()
    root = _parse_document(content)
    document = _require_object(
        root,
        frozenset({"anchors", "columns", "dataset_id", "row_count", "schema_version"}),
    )
    if (
        document["dataset_id"] != NAMED_ANCHOR_DATASET_ID
        or document["schema_version"] != 1
        or document["row_count"] != expected_row_count
        or tuple(_require_string_list(document["columns"], length=len(NAMED_ANCHOR_COLUMNS)))
        != NAMED_ANCHOR_COLUMNS
    ):
        _reject()
    anchors = document["anchors"]
    if type(anchors) is not list or len(anchors) != expected_row_count:
        _reject()
    rows: list[NamedAnchorArtifactRow] = []
    names: set[str] = set()
    source_ids: set[str] = set()
    previous_name: str | None = None
    for value in anchors:
        anchor = _require_object(value, frozenset(NAMED_ANCHOR_COLUMNS))
        name = _require_string(anchor["iau_name"])
        if name in names or (previous_name is not None and name <= previous_name):
            _reject()
        names.add(name)
        previous_name = name
        hip_id = _require_positive_integer(anchor["hip_id"])
        abbreviation = _require_string(anchor["iau_constellation_abbreviation"])
        if abbreviation not in _OFFICIAL_CONSTELLATIONS:
            _reject()
        date_approved = _require_date_approved(anchor["date_approved"])
        source_id = _require_gaia_source_id(anchor["gaia_source_id"])
        if source_id in source_ids:
            _reject()
        source_ids.add(source_id)
        distance = _require_finite_number(anchor["gaia_crossmatch_angular_distance_arcsec"])
        if distance < 0:
            _reject()
        neighbour_count = _require_positive_integer(anchor["gaia_crossmatch_neighbour_count"])
        if neighbour_count != 1:
            _reject()
        flag = _require_nonnegative_integer(anchor["gaia_crossmatch_flag"])
        if flag > 32_767 or flag & 3:
            _reject()
        rows.append(
            NamedAnchorArtifactRow(
                iau_name=name,
                hip_id=hip_id,
                iau_constellation_abbreviation=abbreviation,
                date_approved=date_approved,
                gaia_source_id=source_id,
                gaia_crossmatch_angular_distance_arcsec=distance,
                gaia_crossmatch_neighbour_count=neighbour_count,
                gaia_crossmatch_flag=flag,
            )
        )
    return NamedAnchorArtifactReview(rows=tuple(rows))


def _validate_named_anchor_bright_intersection(
    review: NamedAnchorArtifactReview,
    bright_review: BrightStarArtifactReview,
) -> None:
    bright_ids = {row.source_id for row in bright_review.rows}
    if any(row.gaia_source_id not in bright_ids for row in review.rows):
        _reject()
    if len({row.gaia_source_id for row in review.rows}) != len(review.rows):
        _reject()


def validate_named_anchor_artifact(
    *, repository_root: Path = REPOSITORY_ROOT
) -> NamedAnchorArtifactReview:
    """Validate the exact named-anchor manifest, artifact, and Phase 2D join."""
    manifest = _load_pinned_document(
        repository_root,
        NAMED_ANCHOR_MANIFEST_PATH,
        NAMED_ANCHOR_MANIFEST_SHA256,
        maximum_bytes=32_768,
    )
    _validate_named_manifest(manifest)
    artifact = _read_regular_file(
        repository_root,
        NAMED_ANCHOR_ARTIFACT_PATH,
        maximum_bytes=NAMED_ANCHOR_MAXIMUM_BYTES,
    )
    if (
        len(artifact) != NAMED_ANCHOR_ARTIFACT_BYTES
        or hashlib.sha256(artifact).hexdigest() != NAMED_ANCHOR_ARTIFACT_SHA256
    ):
        _reject()
    review = parse_named_anchor_artifact(artifact)
    try:
        bright_review = validate_bright_star_artifact(repository_root=repository_root)
    except BrightStarArtifactRejected:
        _reject()
    _validate_named_anchor_bright_intersection(review, bright_review)
    return review


def _validate_constellation_manifest(document: dict[str, object]) -> None:
    root = _require_object(
        document,
        frozenset(
            {
                "artifact",
                "attribution",
                "boundary_source",
                "dataset_id",
                "identity_source",
                "limitations",
                "schema_version",
                "target_membership",
                "terms_url",
                "usage_purpose",
                "verification_source",
            }
        ),
    )
    if root["dataset_id"] != CONSTELLATION_DATASET_ID or root["schema_version"] != 1:
        _reject()
    artifact = _require_object(
        root["artifact"], frozenset({"byte_count", "columns", "path", "row_count", "sha256"})
    )
    if (
        artifact["byte_count"] != CONSTELLATION_ARTIFACT_BYTES
        or artifact["path"] != CONSTELLATION_ARTIFACT_PATH
        or artifact["row_count"] != CONSTELLATION_ROW_COUNT
        or artifact["sha256"] != CONSTELLATION_ARTIFACT_SHA256
        or tuple(_require_string_list(artifact["columns"], length=len(CONSTELLATION_COLUMNS)))
        != CONSTELLATION_COLUMNS
    ):
        _reject()
    boundary = _require_object(
        root["boundary_source"],
        frozenset(
            {
                "base_url",
                "coordinate_frame",
                "coordinate_representation",
                "coordinate_units",
                "part_count",
                "retrieved_at",
                "source_file_count",
                "source_url",
                "vertex_count",
            }
        ),
    )
    if (
        boundary["base_url"]
        != "https://iauarchive.eso.org/static/public/constellations/txt/"
        or boundary["coordinate_frame"] != "equatorial"
        or boundary["coordinate_representation"] != "J2000.0"
        or boundary["part_count"] != CONSTELLATION_PART_COUNT
        or boundary["source_file_count"] != CONSTELLATION_PART_COUNT
        or boundary["source_url"] != "https://iauarchive.eso.org/public/themes/constellations/"
        or boundary["vertex_count"] != CONSTELLATION_VERTEX_COUNT
    ):
        _reject()
    _require_string(boundary["retrieved_at"])
    units = _require_object(
        boundary["coordinate_units"], frozenset({"declination", "right_ascension"})
    )
    if (
        units["declination"] != "degrees"
        or units["right_ascension"] != "degrees after deterministic HMS normalization"
    ):
        _reject()
    identity = _require_object(
        root["identity_source"],
        frozenset({"official_identity_count", "retrieved_at", "source_url"}),
    )
    if (
        identity["official_identity_count"] != CONSTELLATION_ROW_COUNT
        or identity["source_url"] != boundary["source_url"]
    ):
        _reject()
    _require_string(identity["retrieved_at"])
    target = _require_object(
        root["target_membership"], frozenset({"coordinate_source", "method", "target_count"})
    )
    if target["target_count"] != 5:
        _reject()
    _require_string(target["coordinate_source"])
    _require_string(target["method"])
    verification = _require_object(
        root["verification_source"], frozenset({"catalogue", "role", "source_url"})
    )
    if (
        verification["catalogue"] != "CDS VizieR VI/42 (Roman 1987)"
        or verification["source_url"]
        != "https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VI/42"
    ):
        _reject()
    _require_string(verification["role"])
    for key in ("attribution", "terms_url", "usage_purpose"):
        _require_string(root[key])
    limitations = root["limitations"]
    if type(limitations) is not list or not limitations or any(
        type(item) is not str or not item for item in limitations
    ):
        _reject()


def _parse_boundary_vertex(value: object) -> BoundaryVertex:
    vertex = _require_object(value, frozenset({"declination_degrees", "right_ascension_degrees"}))
    right_ascension = _require_finite_number(vertex["right_ascension_degrees"])
    declination = _require_finite_number(vertex["declination_degrees"])
    if right_ascension < 0 or right_ascension >= 360 or declination < -90 or declination > 90:
        _reject()
    return BoundaryVertex(
        right_ascension_degrees=right_ascension,
        declination_degrees=declination,
    )


def parse_constellation_artifact(content: bytes) -> ConstellationArtifactReview:
    """Parse all 88 official regions and the bounded membership map."""
    root = _parse_document(content)
    document = _require_object(
        root,
        frozenset(
            {
                "boundary_semantics",
                "constellations",
                "coordinate_reference",
                "dataset_id",
                "row_count",
                "schema_version",
                "target_memberships",
            }
        ),
    )
    if (
        document["dataset_id"] != CONSTELLATION_DATASET_ID
        or document["schema_version"] != 1
        or document["row_count"] != CONSTELLATION_ROW_COUNT
        or document["boundary_semantics"]
        != (
            "Each ordered boundary part is a sky-region boundary; its final vertex connects back "
            "to its first vertex. No stick-figure line tradition is represented."
        )
    ):
        _reject()
    reference = _require_object(
        document["coordinate_reference"],
        frozenset(
            {
                "declination_unit",
                "frame",
                "representation",
                "right_ascension_unit",
                "source_notation",
            }
        ),
    )
    if (
        reference["declination_unit"] != "degrees"
        or reference["frame"] != "equatorial"
        or reference["representation"] != "J2000.0"
        or reference["right_ascension_unit"] != "degrees"
        or reference["source_notation"]
        != "IAU boundary TXT right ascension HH MM SS.SSSS and declination degrees"
    ):
        _reject()

    values = document["constellations"]
    if type(values) is not list or len(values) != CONSTELLATION_ROW_COUNT:
        _reject()
    rows: list[ConstellationArtifactRow] = []
    abbreviations: set[str] = set()
    source_files: set[str] = set()
    part_count = 0
    vertex_count = 0
    previous_abbreviation: str | None = None
    for value in values:
        item = _require_object(
            value,
            frozenset({"abbreviation", "boundary_parts", "english_name", "latin_name"}),
        )
        abbreviation = _require_string(item["abbreviation"])
        if (
            abbreviation not in _OFFICIAL_CONSTELLATIONS
            or abbreviation in abbreviations
            or (previous_abbreviation is not None and abbreviation <= previous_abbreviation)
        ):
            _reject()
        abbreviations.add(abbreviation)
        previous_abbreviation = abbreviation
        expected_latin, expected_english = _OFFICIAL_CONSTELLATIONS[abbreviation]
        if item["latin_name"] != expected_latin or item["english_name"] != expected_english:
            _reject()
        parts = item["boundary_parts"]
        if type(parts) is not list or not parts:
            _reject()
        parsed_parts: list[BoundaryPart] = []
        for part_value in parts:
            part = _require_object(part_value, frozenset({"source_file", "vertices"}))
            source_file = _require_string(part["source_file"])
            if (
                re.fullmatch(r"[a-z0-9]+\.txt", source_file) is None
                or source_file in source_files
            ):
                _reject()
            stem = source_file[:-4]
            if stem != abbreviation.lower() and not (
                abbreviation == "Ser" and stem in {"ser1", "ser2"}
            ):
                _reject()
            source_files.add(source_file)
            vertices = part["vertices"]
            if type(vertices) is not list or len(vertices) < 3:
                _reject()
            parsed_vertices = tuple(_parse_boundary_vertex(vertex) for vertex in vertices)
            parsed_parts.append(BoundaryPart(source_file=source_file, vertices=parsed_vertices))
            part_count += 1
            vertex_count += len(parsed_vertices)
        rows.append(
            ConstellationArtifactRow(
                abbreviation=abbreviation,
                latin_name=expected_latin,
                english_name=expected_english,
                boundary_parts=tuple(parsed_parts),
            )
        )
    if (
        abbreviations != set(_OFFICIAL_CONSTELLATIONS)
        or len(abbreviations) != CONSTELLATION_ROW_COUNT
        or part_count != CONSTELLATION_PART_COUNT
        or vertex_count != CONSTELLATION_VERTEX_COUNT
    ):
        _reject()

    target_values = document["target_memberships"]
    if type(target_values) is not list or len(target_values) != 5:
        _reject()
    target_memberships: list[TargetMembership] = []
    target_slugs: set[str] = set()
    target_source_ids: set[str] = set()
    previous_slug: str | None = None
    for value in target_values:
        target = _require_object(
            value,
            frozenset(
                {
                    "constellation_abbreviation",
                    "coordinate_source",
                    "declination_degrees",
                    "gaia_source_id",
                    "membership_method",
                    "right_ascension_degrees",
                    "target_name",
                    "target_slug",
                    "verification_source",
                }
            ),
        )
        slug = _require_string(target["target_slug"])
        if (
            _TARGET_SLUG.fullmatch(slug) is None
            or slug in target_slugs
            or (previous_slug is not None and slug <= previous_slug)
        ):
            _reject()
        target_slugs.add(slug)
        previous_slug = slug
        target_name = _require_string(target["target_name"])
        source_id = _require_gaia_source_id(target["gaia_source_id"])
        if source_id in target_source_ids:
            _reject()
        target_source_ids.add(source_id)
        right_ascension = _require_finite_number(target["right_ascension_degrees"])
        declination = _require_finite_number(target["declination_degrees"])
        if right_ascension < 0 or right_ascension >= 360 or declination < -90 or declination > 90:
            _reject()
        abbreviation = _require_string(target["constellation_abbreviation"])
        if abbreviation not in _OFFICIAL_CONSTELLATIONS:
            _reject()
        source = _require_object(
            target["coordinate_source"],
            frozenset(
                {"dataset_code", "provider_code", "reference_epoch", "release_version", "table"}
            ),
        )
        if source != {
            "dataset_code": "gaia-source-astrometry",
            "provider_code": "esa-gaia",
            "reference_epoch": "J2016.0",
            "release_version": "dr3",
            "table": "gaiadr3.gaia_source",
        }:
            _reject()
        _require_string(target["membership_method"])
        _require_string(target["verification_source"])
        target_memberships.append(
            TargetMembership(
                target_slug=slug,
                target_name=target_name,
                gaia_source_id=source_id,
                right_ascension_degrees=right_ascension,
                declination_degrees=declination,
                constellation_abbreviation=abbreviation,
            )
        )
    return ConstellationArtifactReview(
        constellations=tuple(rows), target_memberships=tuple(target_memberships)
    )


@dataclass(frozen=True, slots=True)
class _TargetCoordinateEvidence:
    slug: str
    name: str
    source_id: str
    right_ascension: Decimal
    declination: Decimal


def _load_target_coordinate_evidence(root: Path) -> tuple[_TargetCoordinateEvidence, ...]:
    manifest_content = _read_regular_file(
        root, _TARGET_ASTROMETRY_MANIFEST_PATH, maximum_bytes=64 * 1024
    )
    manifest = _parse_document(manifest_content)
    entities_value = manifest.get("entities")
    if type(entities_value) is not list or not entities_value:
        _reject()
    entities: dict[str, tuple[str, str]] = {}
    for value in entities_value:
        entity = _require_object(
            value,
            frozenset(
                {"canonical_name", "entity_type", "id", "identity_seed", "provider_record_id"}
            ),
        )
        source_id = _require_gaia_source_id(entity["provider_record_id"])
        identity_seed = _require_string(entity["identity_seed"])
        slug = identity_seed.rsplit(":", 1)[-1]
        if _TARGET_SLUG.fullmatch(slug) is None or source_id in entities:
            _reject()
        entities[source_id] = (slug, _require_string(entity["canonical_name"]))

    artifact = _read_regular_file(root, _TARGET_ASTROMETRY_ARTIFACT_PATH, maximum_bytes=16 * 1024)
    try:
        rows = list(csv.reader(StringIO(artifact.decode("utf-8"), newline=""), strict=True))
    except (UnicodeDecodeError, csv.Error):
        _reject()
    if len(rows) != len(entities) + 1 or tuple(rows[0]) != _TARGET_ASTROMETRY_COLUMNS:
        _reject()
    evidence: list[_TargetCoordinateEvidence] = []
    seen_ids: set[str] = set()
    for fields in rows[1:]:
        if len(fields) != len(_TARGET_ASTROMETRY_COLUMNS):
            _reject()
        (
            source_id,
            _solution,
            _designation,
            _epoch,
            right_ascension,
            _ra_error,
            declination,
            _dec_error,
        ) = fields
        if source_id in seen_ids or source_id not in entities:
            _reject()
        seen_ids.add(source_id)
        try:
            ra = Decimal(right_ascension)
            dec = Decimal(declination)
        except InvalidOperation:
            _reject()
        if (
            not ra.is_finite()
            or not dec.is_finite()
            or ra < 0
            or ra >= 360
            or dec < -90
            or dec > 90
        ):
            _reject()
        slug, name = entities[source_id]
        evidence.append(
            _TargetCoordinateEvidence(
                slug=slug,
                name=name,
                source_id=source_id,
                right_ascension=ra,
                declination=dec,
            )
        )
    if len(seen_ids) != len(entities):
        _reject()
    return tuple(sorted(evidence, key=lambda item: item.slug))


def _wrapped_delta(value: float, reference: float) -> float:
    return (value - reference + 540.0) % 360.0 - 180.0


def _point_inside_boundary(
    vertices: tuple[BoundaryVertex, ...], right_ascension: float, declination: float
) -> bool:
    previous = right_ascension + _wrapped_delta(
        vertices[0].right_ascension_degrees, right_ascension
    )
    unwrapped = [previous]
    for vertex in vertices[1:]:
        previous += _wrapped_delta(vertex.right_ascension_degrees, previous)
        unwrapped.append(previous)
    inside = False
    for index, vertex in enumerate(vertices):
        previous_index = index - 1
        previous_vertex = vertices[previous_index]
        if (vertex.declination_degrees > declination) != (
            previous_vertex.declination_degrees > declination
        ):
            crossing = (
                (unwrapped[previous_index] - unwrapped[index])
                * (declination - vertex.declination_degrees)
                / (previous_vertex.declination_degrees - vertex.declination_degrees)
                + unwrapped[index]
            )
            if right_ascension < crossing:
                inside = not inside
    return inside


def validate_target_memberships(
    review: ConstellationArtifactReview, *, repository_root: Path
) -> None:
    expected = _load_target_coordinate_evidence(repository_root)
    actual_by_slug = {
        membership.target_slug: membership for membership in review.target_memberships
    }
    if set(actual_by_slug) != {item.slug for item in expected}:
        _reject()
    constellation_by_abbreviation = {
        constellation.abbreviation: constellation for constellation in review.constellations
    }
    for item in expected:
        actual = actual_by_slug[item.slug]
        if (
            actual.target_name != item.name
            or actual.gaia_source_id != item.source_id
            or Decimal(str(actual.right_ascension_degrees)) != item.right_ascension
            or Decimal(str(actual.declination_degrees)) != item.declination
        ):
            _reject()
        constellation = constellation_by_abbreviation.get(actual.constellation_abbreviation)
        if constellation is None:
            _reject()
        hits = [
            constellation.abbreviation
            for constellation in review.constellations
            if any(
                _point_inside_boundary(
                    part.vertices,
                    float(item.right_ascension),
                    float(item.declination),
                )
                for part in constellation.boundary_parts
            )
        ]
        if hits != [actual.constellation_abbreviation]:
            _reject()


def validate_constellation_artifact(
    *, repository_root: Path = REPOSITORY_ROOT
) -> ConstellationArtifactReview:
    """Validate the exact IAU boundary artifact and current target mapping."""
    manifest = _load_pinned_document(
        repository_root,
        CONSTELLATION_MANIFEST_PATH,
        CONSTELLATION_MANIFEST_SHA256,
        maximum_bytes=32_768,
    )
    _validate_constellation_manifest(manifest)
    artifact = _read_regular_file(
        repository_root,
        CONSTELLATION_ARTIFACT_PATH,
        maximum_bytes=CONSTELLATION_MAXIMUM_BYTES,
    )
    if (
        len(artifact) != CONSTELLATION_ARTIFACT_BYTES
        or hashlib.sha256(artifact).hexdigest() != CONSTELLATION_ARTIFACT_SHA256
    ):
        _reject()
    review = parse_constellation_artifact(artifact)
    validate_target_memberships(review, repository_root=repository_root)
    return review


def validate_iau_context_artifacts(
    *, repository_root: Path = REPOSITORY_ROOT
) -> tuple[NamedAnchorArtifactReview, ConstellationArtifactReview]:
    """Validate both Phase 2E products and the immutable Phase 2D dependency."""
    named = validate_named_anchor_artifact(repository_root=repository_root)
    constellations = validate_constellation_artifact(repository_root=repository_root)
    return named, constellations


__all__ = [
    "CONSTELLATION_ARTIFACT_BYTES",
    "CONSTELLATION_ARTIFACT_PATH",
    "CONSTELLATION_ARTIFACT_SHA256",
    "CONSTELLATION_DATASET_ID",
    "CONSTELLATION_MANIFEST_PATH",
    "CONSTELLATION_MANIFEST_SHA256",
    "CONSTELLATION_PART_COUNT",
    "CONSTELLATION_ROW_COUNT",
    "CONSTELLATION_VERTEX_COUNT",
    "IAUContextArtifactRejected",
    "NAMED_ANCHOR_ARTIFACT_BYTES",
    "NAMED_ANCHOR_ARTIFACT_PATH",
    "NAMED_ANCHOR_ARTIFACT_SHA256",
    "NAMED_ANCHOR_COLUMNS",
    "NAMED_ANCHOR_DATASET_ID",
    "NAMED_ANCHOR_MANIFEST_PATH",
    "NAMED_ANCHOR_MANIFEST_SHA256",
    "NAMED_ANCHOR_ROW_COUNT",
    "ConstellationArtifactReview",
    "NamedAnchorArtifactReview",
    "parse_constellation_artifact",
    "parse_named_anchor_artifact",
    "validate_constellation_artifact",
    "validate_iau_context_artifacts",
    "validate_named_anchor_artifact",
    "validate_target_memberships",
]
