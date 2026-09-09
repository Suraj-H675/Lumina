"""Pure deterministic first-order optics for Telescope Builder v1.

The model is intentionally limited to an idealized visual telescope, one
eyepiece, one effective focal-length modifier, and a scalar target extent. It
has no web, persistence, provider, or browser dependency. FastAPI translates
these value objects at the transport boundary, while the web application
renders the returned values without reproducing the optical equations.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, cast
from urllib.parse import urlparse

from astropy import units as u

TELESCOPE_BUILDER_MODEL_VERSION: Final = "telescope-builder-v1"
TELESCOPE_BUILDER_SCHEMA_VERSION: Final = 1
TELESCOPE_BUILDER_ARTIFACT_VERSION: Final = 1
TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION: Final = 1
TELESCOPE_BUILDER_ARTIFACT_PATH: Final = "data/seed/telescope-builder-v1.json"

DAWES_COEFFICIENT_ARCSEC_MM: Final = 116.0
RAYLEIGH_REFERENCE_WAVELENGTH_NM: Final = 550.0
REFERENCE_EYE_PUPIL_MM: Final = 7.0
HIGH_MAGNIFICATION_PER_MM: Final = 2.0
SMALL_EXIT_PUPIL_MM: Final = 0.5

MIN_APERTURE_MM: Final = 20.0
MAX_APERTURE_MM: Final = 1000.0
MIN_TELESCOPE_FOCAL_LENGTH_MM: Final = 100.0
MAX_TELESCOPE_FOCAL_LENGTH_MM: Final = 10000.0
MIN_NATIVE_FOCAL_RATIO: Final = 2.0
MAX_NATIVE_FOCAL_RATIO: Final = 30.0
MIN_EYEPIECE_FOCAL_LENGTH_MM: Final = 1.0
MAX_EYEPIECE_FOCAL_LENGTH_MM: Final = 60.0
MIN_EYEPIECE_APPARENT_FIELD_DEG: Final = 30.0
MAX_EYEPIECE_APPARENT_FIELD_DEG: Final = 120.0
MIN_BARLOW_FACTOR: Final = 1.1
MAX_BARLOW_FACTOR: Final = 5.0
MIN_REDUCER_FACTOR: Final = 0.5
MAX_REDUCER_FACTOR: Final = 0.95
MIN_TARGET_ANGULAR_SIZE_ARCMIN: Final = 0.01
MAX_TARGET_ANGULAR_SIZE_ARCMIN: Final = 600.0
MIN_MAGNIFICATION_X: Final = 1.0

RATIO_RELATIVE_TOLERANCE: Final = 1e-12
LENGTH_ABSOLUTE_TOLERANCE: Final = 1e-9
ANGLE_ABSOLUTE_TOLERANCE: Final = 1e-9

TelescopeType = Literal["refractor", "reflector", "catadioptric"]
OpticalModifierKind = Literal["none", "barlow", "reducer"]
TelescopeTargetFit = Literal["fits", "does_not_fit"]
TelescopeWarningCode = Literal[
    "high_magnification_guideline",
    "very_small_exit_pupil",
    "exit_pupil_exceeds_reference_pupil",
]

_TELESCOPE_TYPES: Final = frozenset({"refractor", "reflector", "catadioptric"})
_MODIFIER_KINDS: Final = frozenset({"none", "barlow", "reducer"})
_WARNING_CODES: Final = (
    "high_magnification_guideline",
    "very_small_exit_pupil",
    "exit_pupil_exceeds_reference_pupil",
)
_VALIDATION_FIXTURE_IDS: Final = frozenset(
    {
        "default",
        "two-times-barlow",
        "half-times-reducer",
        "aperture-scaling",
        "high-magnification-small-exit-pupil",
        "warning-boundary",
        "large-exit-pupil",
        "target-does-not-fit",
        "telescope-type-invariance",
    }
)
_OFFICIAL_SOURCE_HOSTS: Final = frozenset(
    {
        "astro101.wwu.edu",
        "celestron.com",
        "openstax.org",
        "skyandtelescope.org",
        "www.celestron.com",
        "www.skyandtelescope.org",
    }
)
_EXPECTED_SOURCE_METADATA: Final[dict[str, dict[str, str]]] = {
    "openstax-telescopes": {
        "title": "6.1 Telescopes",
        "organization_or_authors": "OpenStax",
        "url": "https://openstax.org/books/astronomy/pages/6-1-telescopes",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — open astronomy textbook chapter.",
        "record_reference": (
            "Section 6.1 page-level discussion of telescope aperture, focal length, "
            "and optical designs."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "OpenStax textbook source; Lumina links to the source and does not "
            "redistribute its text."
        ),
        "citation": "OpenStax, “6.1 Telescopes”, accessed 2026-09-09.",
        "claim_scope": (
            "Aperture determines collecting area and telescope focal length/eyepiece "
            "relationships provide first-order visual context."
        ),
        "source_type": "official-education",
    },
    "openstax-circular-apertures": {
        "title": "4.5 Circular Apertures and Resolution",
        "organization_or_authors": "OpenStax",
        "url": (
            "https://openstax.org/books/university-physics-volume-3/pages/4-5-circular"
            "-apertures-and-resolution"
        ),
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — open university-physics textbook chapter.",
        "record_reference": ("Section 4.5 page-level Rayleigh criterion for a circular aperture."),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "OpenStax textbook source; Lumina links to the source and does not "
            "redistribute its text."
        ),
        "citation": "OpenStax, “4.5 Circular Apertures and Resolution”, accessed 2026-09-09.",
        "claim_scope": (
            "Theoretical Rayleigh resolution relationship 1.22 lambda divided by "
            "aperture diameter for a circular aperture, with ideal assumptions."
        ),
        "source_type": "official-education",
    },
    "sky-telescope-dawes": {
        "title": "Pushing Limits: A Spring Sky Double Star Romp",
        "organization_or_authors": "Sky & Telescope",
        "url": (
            "https://skyandtelescope.org/stargazing-and-observing/pushing-limits-a-spr"
            "ing-sky-double-star-romp/"
        ),
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — astronomy publication article.",
        "record_reference": (
            "Article section describing the Dawes visual double-star relationship."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Sky & Telescope publication; Lumina links to the source and does not "
            "redistribute its text."
        ),
        "citation": (
            "Sky & Telescope, “Pushing Limits: A Spring Sky Double Star Romp”, accessed 2026-09-09."
        ),
        "claim_scope": (
            "Dawes empirical double-star reference approximately 116 divided by "
            "aperture in millimetres; not a general resolution guarantee."
        ),
        "source_type": "technical-reference",
    },
    "celestron-astronomy-glossary": {
        "title": "Astronomy Glossary of Terms",
        "organization_or_authors": "Celestron",
        "url": "https://www.celestron.com/blogs/knowledgebase/astronomy-glossary-of-terms",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — manufacturer technical glossary.",
        "record_reference": (
            "Page-level entries for focal length, focal ratio, eyepiece, exit pupil, "
            "field of view, and aperture."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Celestron technical reference; Lumina links to the source and does not "
            "redistribute its text."
        ),
        "citation": "Celestron, “Astronomy Glossary of Terms”, accessed 2026-09-09.",
        "claim_scope": (
            "Supporting first-order magnification, focal-ratio, exit-pupil, "
            "AFOV/TFOV, modifier, and aperture-area relationships."
        ),
        "source_type": "technical-reference",
    },
    "wwu-astropages-telescopes": {
        "title": "Telescopes",
        "organization_or_authors": "Western Washington University Astronomy 101",
        "url": "https://astro101.wwu.edu/a101_telescopes.html",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — university astronomy educational page.",
        "record_reference": (
            "Page sections on aperture, resolution, magnification, focal ratio, and "
            "useful visual magnification."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "University educational source; Lumina links to the source and does not "
            "redistribute its text."
        ),
        "citation": (
            "Western Washington University Astronomy 101, “Telescopes”, accessed 2026-09-09."
        ),
        "claim_scope": (
            "Supporting educational context that aperture controls ideal light "
            "gathering/resolution, magnification uses focal lengths, focal ratio is "
            "focal length divided by aperture, and approximately 50x per inch is a "
            "visual rule of thumb under ideal conditions."
        ),
        "source_type": "official-education",
    },
    "celestron-exit-pupil": {
        "title": "What is Exit Pupil and Eye Relief for Sport Optics?",
        "organization_or_authors": "Celestron",
        "url": (
            "https://www.celestron.com/blogs/knowledgebase/what-is-exit-pupil-and-eye-"
            "relief-for-sport-optics"
        ),
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — technical optics reference page.",
        "record_reference": (
            "Page-level exit-pupil definition and human dark-adapted pupil context."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Celestron technical reference; Lumina links to the source and does not "
            "redistribute its text."
        ),
        "citation": (
            "Celestron, “What is Exit Pupil and Eye Relief for Sport Optics?”, accessed 2026-09-09."
        ),
        "claim_scope": (
            "Supporting exit-pupil interpretation and the qualification that a 5 to 7 "
            "mm dark-adapted eye pupil is a context range, not a universal user "
            "constant."
        ),
        "source_type": "technical-reference",
    },
    "sky-telescope-magnification": {
        "title": "How to Choose Your Telescope Magnification",
        "organization_or_authors": "Sky & Telescope",
        "url": (
            "https://skyandtelescope.org/astronomy-equipment/choosing-your-telescopes-"
            "magnification/"
        ),
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — astronomy publication technical guide.",
        "record_reference": (
            "Page-level comparison reference for magnification, approximate field, "
            "exit pupil, and practical visual context."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Sky & Telescope publication; Lumina links to the source and does not "
            "redistribute its text."
        ),
        "citation": (
            "Sky & Telescope, “How to Choose Your Telescope Magnification”, accessed 2026-09-09."
        ),
        "claim_scope": (
            "Independent reference for the default-style first-order magnification, "
            "approximate TFOV, exit-pupil, and non-guaranteed practical magnification "
            "relationships."
        ),
        "source_type": "technical-reference",
    },
}
_SOURCE_IDS: Final = frozenset(_EXPECTED_SOURCE_METADATA)


class TelescopeBuilderModelError(ValueError):
    """Raised for invalid model inputs or invalid reviewed artifact data."""

    def __init__(self) -> None:
        super().__init__("TELESCOPE_BUILDER_MODEL_INVALID")


@dataclass(frozen=True, slots=True)
class TelescopeBuilderInput:
    """Validated canonical inputs for one Telescope Builder evaluation."""

    aperture_mm: float
    telescope_focal_length_mm: float
    telescope_type: TelescopeType
    eyepiece_focal_length_mm: float
    eyepiece_apparent_field_deg: float
    optical_modifier_kind: OpticalModifierKind
    optical_modifier_factor: float
    target_angular_size_arcmin: float

    def __post_init__(self) -> None:
        aperture_mm = _validated_number(
            self.aperture_mm,
            minimum=MIN_APERTURE_MM,
            maximum=MAX_APERTURE_MM,
        )
        telescope_focal_length_mm = _validated_number(
            self.telescope_focal_length_mm,
            minimum=MIN_TELESCOPE_FOCAL_LENGTH_MM,
            maximum=MAX_TELESCOPE_FOCAL_LENGTH_MM,
        )
        eyepiece_focal_length_mm = _validated_number(
            self.eyepiece_focal_length_mm,
            minimum=MIN_EYEPIECE_FOCAL_LENGTH_MM,
            maximum=MAX_EYEPIECE_FOCAL_LENGTH_MM,
        )
        eyepiece_apparent_field_deg = _validated_number(
            self.eyepiece_apparent_field_deg,
            minimum=MIN_EYEPIECE_APPARENT_FIELD_DEG,
            maximum=MAX_EYEPIECE_APPARENT_FIELD_DEG,
        )
        target_angular_size_arcmin = _validated_number(
            self.target_angular_size_arcmin,
            minimum=MIN_TARGET_ANGULAR_SIZE_ARCMIN,
            maximum=MAX_TARGET_ANGULAR_SIZE_ARCMIN,
        )

        if not isinstance(self.telescope_type, str) or self.telescope_type not in _TELESCOPE_TYPES:
            raise TelescopeBuilderModelError()
        if (
            not isinstance(self.optical_modifier_kind, str)
            or self.optical_modifier_kind not in _MODIFIER_KINDS
        ):
            raise TelescopeBuilderModelError()

        optical_modifier_factor = _validated_number(
            self.optical_modifier_factor,
            minimum=MIN_REDUCER_FACTOR,
            maximum=MAX_BARLOW_FACTOR,
        )
        native_focal_ratio = telescope_focal_length_mm / aperture_mm
        if not MIN_NATIVE_FOCAL_RATIO <= native_focal_ratio <= MAX_NATIVE_FOCAL_RATIO:
            raise TelescopeBuilderModelError()

        if self.optical_modifier_kind == "none":
            if optical_modifier_factor != 1.0:
                raise TelescopeBuilderModelError()
        elif self.optical_modifier_kind == "barlow":
            if not MIN_BARLOW_FACTOR <= optical_modifier_factor <= MAX_BARLOW_FACTOR:
                raise TelescopeBuilderModelError()
        elif not MIN_REDUCER_FACTOR <= optical_modifier_factor <= MAX_REDUCER_FACTOR:
            raise TelescopeBuilderModelError()

        effective_focal_length_mm = telescope_focal_length_mm * optical_modifier_factor
        magnification_x = effective_focal_length_mm / eyepiece_focal_length_mm
        if not math.isfinite(effective_focal_length_mm) or not math.isfinite(magnification_x):
            raise TelescopeBuilderModelError()
        if magnification_x < MIN_MAGNIFICATION_X:
            raise TelescopeBuilderModelError()

        object.__setattr__(self, "aperture_mm", aperture_mm)
        object.__setattr__(self, "telescope_focal_length_mm", telescope_focal_length_mm)
        object.__setattr__(self, "eyepiece_focal_length_mm", eyepiece_focal_length_mm)
        object.__setattr__(self, "eyepiece_apparent_field_deg", eyepiece_apparent_field_deg)
        object.__setattr__(self, "optical_modifier_factor", optical_modifier_factor)
        object.__setattr__(self, "target_angular_size_arcmin", target_angular_size_arcmin)


@dataclass(frozen=True, slots=True)
class TelescopeBuilderResult:
    """Complete canonical result for one validated input configuration."""

    model_version: str
    schema_version: int
    inputs: TelescopeBuilderInput
    effective_focal_length_mm: float
    native_focal_ratio: float
    effective_focal_ratio: float
    magnification_x: float
    approx_true_field_deg: float
    exit_pupil_mm: float
    dawes_limit_arcsec: float
    rayleigh_limit_arcsec: float
    ideal_light_gathering_ratio_vs_7mm_pupil: float
    target_angular_size_deg: float
    target_field_fraction: float
    target_fit: TelescopeTargetFit
    warning_codes: tuple[TelescopeWarningCode, ...]


def _validated_number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TelescopeBuilderModelError()
    try:
        numeric_value = float(value)
    except (OverflowError, TypeError, ValueError):
        raise TelescopeBuilderModelError() from None
    if not math.isfinite(numeric_value) or not minimum <= numeric_value <= maximum:
        raise TelescopeBuilderModelError()
    return 0.0 if numeric_value == 0.0 else numeric_value


def calculate_telescope_builder(inputs: TelescopeBuilderInput) -> TelescopeBuilderResult:
    """Calculate idealized visual optical geometry deterministically."""

    if not isinstance(inputs, TelescopeBuilderInput):
        raise TelescopeBuilderModelError()

    effective_focal_length_mm = inputs.telescope_focal_length_mm * inputs.optical_modifier_factor
    native_focal_ratio = inputs.telescope_focal_length_mm / inputs.aperture_mm
    effective_focal_ratio = effective_focal_length_mm / inputs.aperture_mm
    magnification_x = effective_focal_length_mm / inputs.eyepiece_focal_length_mm
    approx_true_field_deg = inputs.eyepiece_apparent_field_deg / magnification_x
    exit_pupil_mm = inputs.aperture_mm / magnification_x
    dawes_limit_arcsec = DAWES_COEFFICIENT_ARCSEC_MM / inputs.aperture_mm

    rayleigh_angle = 1.22 * (RAYLEIGH_REFERENCE_WAVELENGTH_NM * u.nm) / (inputs.aperture_mm * u.mm)
    rayleigh_limit_arcsec = float(
        rayleigh_angle.to_value(
            u.arcsec,
            equivalencies=u.dimensionless_angles(),
        )
    )

    ideal_light_gathering_ratio = (inputs.aperture_mm / REFERENCE_EYE_PUPIL_MM) ** 2
    target_angular_size_deg = inputs.target_angular_size_arcmin / 60.0
    target_field_fraction = target_angular_size_deg / approx_true_field_deg
    target_fit: TelescopeTargetFit = "fits" if target_field_fraction <= 1.0 else "does_not_fit"

    warning_codes: list[TelescopeWarningCode] = []
    if magnification_x > HIGH_MAGNIFICATION_PER_MM * inputs.aperture_mm:
        warning_codes.append("high_magnification_guideline")
    if exit_pupil_mm < SMALL_EXIT_PUPIL_MM:
        warning_codes.append("very_small_exit_pupil")
    if exit_pupil_mm > REFERENCE_EYE_PUPIL_MM:
        warning_codes.append("exit_pupil_exceeds_reference_pupil")

    values = (
        effective_focal_length_mm,
        native_focal_ratio,
        effective_focal_ratio,
        magnification_x,
        approx_true_field_deg,
        exit_pupil_mm,
        dawes_limit_arcsec,
        rayleigh_limit_arcsec,
        ideal_light_gathering_ratio,
        target_angular_size_deg,
        target_field_fraction,
    )
    if not all(math.isfinite(value) for value in values):
        raise TelescopeBuilderModelError()

    return TelescopeBuilderResult(
        model_version=TELESCOPE_BUILDER_MODEL_VERSION,
        schema_version=TELESCOPE_BUILDER_SCHEMA_VERSION,
        inputs=inputs,
        effective_focal_length_mm=effective_focal_length_mm,
        native_focal_ratio=native_focal_ratio,
        effective_focal_ratio=effective_focal_ratio,
        magnification_x=magnification_x,
        approx_true_field_deg=approx_true_field_deg,
        exit_pupil_mm=exit_pupil_mm,
        dawes_limit_arcsec=dawes_limit_arcsec,
        rayleigh_limit_arcsec=rayleigh_limit_arcsec,
        ideal_light_gathering_ratio_vs_7mm_pupil=ideal_light_gathering_ratio,
        target_angular_size_deg=target_angular_size_deg,
        target_field_fraction=target_field_fraction,
        target_fit=target_fit,
        warning_codes=tuple(warning_codes),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise TelescopeBuilderModelError()
        result[key] = value
    return result


def _mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise TelescopeBuilderModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise TelescopeBuilderModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise TelescopeBuilderModelError()
    return value


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TelescopeBuilderModelError()
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        raise TelescopeBuilderModelError() from None
    if not math.isfinite(number):
        raise TelescopeBuilderModelError()
    return number


def _validate_source(source: object) -> str:
    mapping = _mapping(source)
    source_keys = frozenset(
        {
            "id",
            "title",
            "organization_or_authors",
            "url",
            "accessed_at",
            "dataset_or_release",
            "record_reference",
            "retrieved_at",
            "data_date",
            "terms_or_licence",
            "citation",
            "claim_scope",
            "source_type",
        }
    )
    _exact_keys(mapping, source_keys)
    source_id = _string(mapping["id"])
    expected = _EXPECTED_SOURCE_METADATA.get(source_id)
    if expected is None or any(_string(mapping[key]) != value for key, value in expected.items()):
        raise TelescopeBuilderModelError()
    url = _string(mapping["url"])
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in _OFFICIAL_SOURCE_HOSTS
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise TelescopeBuilderModelError()
    if mapping["source_type"] not in {"official-education", "technical-reference"}:
        raise TelescopeBuilderModelError()
    for key in source_keys - {"id", "title", "url", "source_type"}:
        _string(mapping[key])
    return source_id


def load_reviewed_telescope_builder_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and validate the checked-in Telescope Builder artifact."""

    path = repository_root / TELESCOPE_BUILDER_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, TelescopeBuilderModelError):
        raise TelescopeBuilderModelError() from None

    artifact = _mapping(decoded)
    _exact_keys(
        artifact,
        frozenset(
            {
                "artifact_version",
                "model_version",
                "schema_version",
                "share_schema_version",
                "generated_at",
                "definition",
                "sources",
                "constants",
                "presets",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != TELESCOPE_BUILDER_ARTIFACT_VERSION
        or artifact["model_version"] != TELESCOPE_BUILDER_MODEL_VERSION
        or artifact["schema_version"] != TELESCOPE_BUILDER_SCHEMA_VERSION
        or artifact["share_schema_version"] != TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION
    ):
        raise TelescopeBuilderModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    _exact_keys(
        definition,
        frozenset(
            {
                "slug",
                "title",
                "content_type",
                "language",
                "status",
                "version",
                "audience_modes",
                "reviewed_by",
                "reviewed_at",
                "updated_at",
                "model_version",
                "learning_objectives",
                "prerequisite_concepts",
                "input_schema",
                "default_state",
                "default_preset",
                "calculation_module",
                "output_schema",
                "warning_semantics",
                "telescope_type_disclosure",
                "modifier_semantics",
                "target_fit_definition",
                "visualization_module",
                "assumptions",
                "limitations",
                "references",
                "validation_fixtures",
                "share_schema_version",
            }
        ),
    )
    if (
        definition["slug"] != "telescope-builder"
        or definition["title"] != "Telescope Builder"
        or definition["content_type"] != "interactive-simulation"
        or definition["language"] != "en"
        or definition["status"] != "ready"
        or definition["version"] != 1
        or definition["model_version"] != TELESCOPE_BUILDER_MODEL_VERSION
        or definition["share_schema_version"] != TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION
    ):
        raise TelescopeBuilderModelError()
    for key in (
        "audience_modes",
        "reviewed_by",
        "learning_objectives",
        "prerequisite_concepts",
        "output_schema",
        "warning_semantics",
        "assumptions",
        "limitations",
        "references",
        "validation_fixtures",
    ):
        values = definition[key]
        if (
            not isinstance(values, list)
            or not values
            or not all(isinstance(value, str) and value for value in values)
        ):
            raise TelescopeBuilderModelError()
    for key in (
        "title",
        "content_type",
        "language",
        "status",
        "reviewed_at",
        "updated_at",
        "default_preset",
        "telescope_type_disclosure",
        "modifier_semantics",
        "target_fit_definition",
    ):
        _string(definition[key])

    raw_sources = artifact["sources"]
    if not isinstance(raw_sources, list) or len(raw_sources) != len(_SOURCE_IDS):
        raise TelescopeBuilderModelError()
    source_ids = {_validate_source(source) for source in raw_sources}
    if source_ids != _SOURCE_IDS:
        raise TelescopeBuilderModelError()

    constants = _mapping(artifact["constants"])
    expected_constants = {
        "DAWES_COEFFICIENT_ARCSEC_MM": DAWES_COEFFICIENT_ARCSEC_MM,
        "RAYLEIGH_REFERENCE_WAVELENGTH_NM": RAYLEIGH_REFERENCE_WAVELENGTH_NM,
        "REFERENCE_EYE_PUPIL_MM": REFERENCE_EYE_PUPIL_MM,
        "HIGH_MAGNIFICATION_PER_MM": HIGH_MAGNIFICATION_PER_MM,
        "SMALL_EXIT_PUPIL_MM": SMALL_EXIT_PUPIL_MM,
        "MIN_APERTURE_MM": MIN_APERTURE_MM,
        "MAX_APERTURE_MM": MAX_APERTURE_MM,
        "MIN_TELESCOPE_FOCAL_LENGTH_MM": MIN_TELESCOPE_FOCAL_LENGTH_MM,
        "MAX_TELESCOPE_FOCAL_LENGTH_MM": MAX_TELESCOPE_FOCAL_LENGTH_MM,
        "MIN_NATIVE_FOCAL_RATIO": MIN_NATIVE_FOCAL_RATIO,
        "MAX_NATIVE_FOCAL_RATIO": MAX_NATIVE_FOCAL_RATIO,
        "MIN_EYEPIECE_FOCAL_LENGTH_MM": MIN_EYEPIECE_FOCAL_LENGTH_MM,
        "MAX_EYEPIECE_FOCAL_LENGTH_MM": MAX_EYEPIECE_FOCAL_LENGTH_MM,
        "MIN_EYEPIECE_APPARENT_FIELD_DEG": MIN_EYEPIECE_APPARENT_FIELD_DEG,
        "MAX_EYEPIECE_APPARENT_FIELD_DEG": MAX_EYEPIECE_APPARENT_FIELD_DEG,
        "MIN_BARLOW_FACTOR": MIN_BARLOW_FACTOR,
        "MAX_BARLOW_FACTOR": MAX_BARLOW_FACTOR,
        "MIN_REDUCER_FACTOR": MIN_REDUCER_FACTOR,
        "MAX_REDUCER_FACTOR": MAX_REDUCER_FACTOR,
        "MIN_TARGET_ANGULAR_SIZE_ARCMIN": MIN_TARGET_ANGULAR_SIZE_ARCMIN,
        "MAX_TARGET_ANGULAR_SIZE_ARCMIN": MAX_TARGET_ANGULAR_SIZE_ARCMIN,
        "MIN_MAGNIFICATION_X": MIN_MAGNIFICATION_X,
    }
    _exact_keys(constants, frozenset(expected_constants))
    if any(_number(constants[key]) != expected for key, expected in expected_constants.items()):
        raise TelescopeBuilderModelError()

    presets = _mapping(artifact["presets"])
    _exact_keys(presets, frozenset({"balanced-reference"}))
    balanced = _mapping(presets["balanced-reference"])
    default_state = _mapping(definition["default_state"])
    if balanced != default_state:
        raise TelescopeBuilderModelError()
    _validate_state_mapping(default_state)

    raw_fixtures = artifact["validation_fixtures"]
    if not isinstance(raw_fixtures, list) or len(raw_fixtures) != len(_VALIDATION_FIXTURE_IDS):
        raise TelescopeBuilderModelError()
    fixture_ids: set[str] = set()
    for fixture in raw_fixtures:
        fixture_mapping = _mapping(fixture)
        _exact_keys(fixture_mapping, frozenset({"id", "purpose", "input", "expected"}))
        fixture_id = _string(fixture_mapping["id"])
        if fixture_id not in _VALIDATION_FIXTURE_IDS:
            raise TelescopeBuilderModelError()
        fixture_ids.add(fixture_id)
        _string(fixture_mapping["purpose"])
        _validate_state_mapping(_mapping(fixture_mapping["input"]))
        if not isinstance(fixture_mapping["expected"], dict):
            raise TelescopeBuilderModelError()
    if fixture_ids != _VALIDATION_FIXTURE_IDS:
        raise TelescopeBuilderModelError()

    scientific_validation = _mapping(artifact["scientific_validation"])
    _exact_keys(
        scientific_validation,
        frozenset({"id", "checked_at", "method", "tools", "source_ids", "test_references"}),
    )
    if scientific_validation["id"] != "telescope-builder-independent-validation-v1":
        raise TelescopeBuilderModelError()
    _string(scientific_validation["checked_at"])
    _string(scientific_validation["method"])
    source_reference_ids = scientific_validation["source_ids"]
    if not isinstance(source_reference_ids, list) or set(source_reference_ids) != _SOURCE_IDS:
        raise TelescopeBuilderModelError()
    test_references = scientific_validation["test_references"]
    if (
        not isinstance(test_references, list)
        or not test_references
        or not all(isinstance(reference, str) and reference for reference in test_references)
    ):
        raise TelescopeBuilderModelError()
    tools = scientific_validation["tools"]
    if not isinstance(tools, list) or not tools:
        raise TelescopeBuilderModelError()
    for tool in tools:
        tool_mapping = _mapping(tool)
        _exact_keys(tool_mapping, frozenset({"name", "version", "role"}))
        _string(tool_mapping["name"])
        _string(tool_mapping["version"])
        _string(tool_mapping["role"])

    return artifact


def _validate_state_mapping(state: Mapping[str, object]) -> None:
    expected_keys = frozenset(
        {
            "version",
            "model_version",
            "aperture_mm",
            "telescope_focal_length_mm",
            "telescope_type",
            "eyepiece_focal_length_mm",
            "eyepiece_apparent_field_deg",
            "optical_modifier_kind",
            "optical_modifier_factor",
            "target_angular_size_arcmin",
        }
    )
    _exact_keys(state, expected_keys)
    if state["version"] != TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION:
        raise TelescopeBuilderModelError()
    if state["model_version"] != TELESCOPE_BUILDER_MODEL_VERSION:
        raise TelescopeBuilderModelError()
    telescope_type = state["telescope_type"]
    modifier_kind = state["optical_modifier_kind"]
    if not isinstance(telescope_type, str) or telescope_type not in _TELESCOPE_TYPES:
        raise TelescopeBuilderModelError()
    if not isinstance(modifier_kind, str) or modifier_kind not in _MODIFIER_KINDS:
        raise TelescopeBuilderModelError()
    TelescopeBuilderInput(
        aperture_mm=_number(state["aperture_mm"]),
        telescope_focal_length_mm=_number(state["telescope_focal_length_mm"]),
        telescope_type=cast(TelescopeType, telescope_type),
        eyepiece_focal_length_mm=_number(state["eyepiece_focal_length_mm"]),
        eyepiece_apparent_field_deg=_number(state["eyepiece_apparent_field_deg"]),
        optical_modifier_kind=cast(OpticalModifierKind, modifier_kind),
        optical_modifier_factor=_number(state["optical_modifier_factor"]),
        target_angular_size_arcmin=_number(state["target_angular_size_arcmin"]),
    )


__all__ = [
    "ANGLE_ABSOLUTE_TOLERANCE",
    "DAWES_COEFFICIENT_ARCSEC_MM",
    "HIGH_MAGNIFICATION_PER_MM",
    "LENGTH_ABSOLUTE_TOLERANCE",
    "MAX_APERTURE_MM",
    "MAX_BARLOW_FACTOR",
    "MAX_EYEPIECE_APPARENT_FIELD_DEG",
    "MAX_EYEPIECE_FOCAL_LENGTH_MM",
    "MAX_NATIVE_FOCAL_RATIO",
    "MAX_REDUCER_FACTOR",
    "MAX_TARGET_ANGULAR_SIZE_ARCMIN",
    "MAX_TELESCOPE_FOCAL_LENGTH_MM",
    "MIN_APERTURE_MM",
    "MIN_BARLOW_FACTOR",
    "MIN_EYEPIECE_APPARENT_FIELD_DEG",
    "MIN_EYEPIECE_FOCAL_LENGTH_MM",
    "MIN_NATIVE_FOCAL_RATIO",
    "MIN_REDUCER_FACTOR",
    "MIN_TARGET_ANGULAR_SIZE_ARCMIN",
    "MIN_TELESCOPE_FOCAL_LENGTH_MM",
    "MIN_MAGNIFICATION_X",
    "OpticalModifierKind",
    "RATIO_RELATIVE_TOLERANCE",
    "REFERENCE_EYE_PUPIL_MM",
    "RAYLEIGH_REFERENCE_WAVELENGTH_NM",
    "SMALL_EXIT_PUPIL_MM",
    "TELESCOPE_BUILDER_ARTIFACT_PATH",
    "TELESCOPE_BUILDER_ARTIFACT_VERSION",
    "TELESCOPE_BUILDER_MODEL_VERSION",
    "TELESCOPE_BUILDER_SCHEMA_VERSION",
    "TELESCOPE_BUILDER_SHARE_SCHEMA_VERSION",
    "TelescopeBuilderInput",
    "TelescopeBuilderModelError",
    "TelescopeBuilderResult",
    "TelescopeTargetFit",
    "TelescopeWarningCode",
    "TelescopeType",
    "calculate_telescope_builder",
    "load_reviewed_telescope_builder_artifact",
]
