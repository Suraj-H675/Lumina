"""Deterministic Schwarzschild landmark and static-clock teaching model."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, cast
from urllib.parse import urlparse

BLACK_HOLE_RELATIVITY_MODEL_VERSION: Final = "black-hole-relativity-v1"
BLACK_HOLE_RELATIVITY_SCHEMA_VERSION: Final = 1
BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION: Final = 1
BLACK_HOLE_RELATIVITY_ARTIFACT_VERSION: Final = 1
BLACK_HOLE_RELATIVITY_ARTIFACT_PATH: Final = "data/seed/black-hole-relativity-v1.json"

NOMINAL_SOLAR_MASS_PARAMETER_M3_S2: Final = 1.3271244e20
SPEED_OF_LIGHT_M_S: Final = 299_792_458.0
MIN_MASS_NOMINAL_SOLAR: Final = 1.0
MAX_MASS_NOMINAL_SOLAR: Final = 1.0e10
MIN_STATIC_OBSERVER_RADIUS_RS: Final = 1.01
MAX_STATIC_OBSERVER_RADIUS_RS: Final = 100.0

EVENT_HORIZON_RADIUS_RS: Final = 1.0
PHOTON_SPHERE_RADIUS_RS: Final = 1.5
ISCO_RADIUS_RS: Final = 3.0

LandmarkId = Literal["event_horizon", "photon_sphere", "isco"]

_SOURCE_URLS: Final = {
    "iau-2015-resolution-b3": (
        "https://www.iau.org/common/Uploaded%20files/"
        "IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf"
    ),
    "nist-speed-of-light": "https://physics.nist.gov/cuu/Constants/Value/c.html",
    "openstax-einstein-gravity": (
        "https://openstax.org/books/university-physics-volume-1/pages/"
        "13-7-einsteins-theory-of-gravity"
    ),
    "oregon-state-schwarzschild-geometry": (
        "https://sites.science.oregonstate.edu/physics/coursewikis/GGR/"
        "_export/xhtml/book/ggr/schwgeom.html"
    ),
    "oregon-state-null-orbits": (
        "https://sites.science.oregonstate.edu/coursewikis/GGR/book/ggr/onull.html"
    ),
    "mit-ocw-black-holes-i": (
        "https://ocw.mit.edu/courses/8-962-general-relativity-spring-2020/"
        "9cb27977551aade8f7121d257bfe82da_ZqF-7bjnzCU.pdf"
    ),
    "umd-astr406-black-holes": (
        "https://pages.astro.umd.edu/~mcmiller/teaching/astr406/lecture21.pdf"
    ),
}
_SOURCE_IDS: Final = tuple(_SOURCE_URLS)
_FIXTURE_IDS: Final = frozenset(
    {
        "openstax-rounded-solar-radius",
        "default-static-clock",
        "schwarzschild-landmark-ratios",
        "mass-scale-linearity",
        "dimensionless-radius-invariance",
        "near-horizon-bound",
        "far-radius-bound",
        "maximum-mass-bound",
        "input-domain-rejection",
        "deterministic-repeat",
        "artifact-mutation",
    }
)
_EXPECTED_CONSTANTS: Final = {
    "NOMINAL_SOLAR_MASS_PARAMETER_M3_S2": NOMINAL_SOLAR_MASS_PARAMETER_M3_S2,
    "SPEED_OF_LIGHT_M_S": SPEED_OF_LIGHT_M_S,
    "MIN_MASS_NOMINAL_SOLAR": MIN_MASS_NOMINAL_SOLAR,
    "MAX_MASS_NOMINAL_SOLAR": MAX_MASS_NOMINAL_SOLAR,
    "MIN_STATIC_OBSERVER_RADIUS_RS": MIN_STATIC_OBSERVER_RADIUS_RS,
    "MAX_STATIC_OBSERVER_RADIUS_RS": MAX_STATIC_OBSERVER_RADIUS_RS,
    "EVENT_HORIZON_RADIUS_RS": EVENT_HORIZON_RADIUS_RS,
    "PHOTON_SPHERE_RADIUS_RS": PHOTON_SPHERE_RADIUS_RS,
    "ISCO_RADIUS_RS": ISCO_RADIUS_RS,
}
_EXPECTED_LANDMARKS: Final = (
    {
        "id": "event_horizon",
        "label": "Event horizon",
        "radius_rs": EVENT_HORIZON_RADIUS_RS,
        "interpretation": ("Event-horizon areal radius for the ideal Schwarzschild black hole."),
    },
    {
        "id": "photon_sphere",
        "label": "Photon sphere",
        "radius_rs": PHOTON_SPHERE_RADIUS_RS,
        "interpretation": ("Unstable circular null-geodesic radius in Schwarzschild geometry."),
    },
    {
        "id": "isco",
        "label": "ISCO",
        "radius_rs": ISCO_RADIUS_RS,
        "interpretation": (
            "Innermost stable circular timelike-geodesic radius in Schwarzschild geometry."
        ),
    },
)


class BlackHoleRelativityModelError(ValueError):
    """Raised when an input or reviewed artifact leaves the frozen v1 contract."""


def _number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BlackHoleRelativityModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise BlackHoleRelativityModelError()
    return numeric


@dataclass(frozen=True, slots=True)
class BlackHoleRelativityInput:
    mass_nominal_solar: float
    static_observer_radius_rs: float

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "mass_nominal_solar",
            _number(
                self.mass_nominal_solar,
                minimum=MIN_MASS_NOMINAL_SOLAR,
                maximum=MAX_MASS_NOMINAL_SOLAR,
            ),
        )
        object.__setattr__(
            self,
            "static_observer_radius_rs",
            _number(
                self.static_observer_radius_rs,
                minimum=MIN_STATIC_OBSERVER_RADIUS_RS,
                maximum=MAX_STATIC_OBSERVER_RADIUS_RS,
            ),
        )


@dataclass(frozen=True, slots=True)
class SchwarzschildLandmark:
    id: LandmarkId
    label: str
    radius_rs: float
    radius_m: float
    interpretation: str


@dataclass(frozen=True, slots=True)
class BlackHoleRelativityResult:
    model_version: str
    schema_version: int
    inputs: BlackHoleRelativityInput
    gravitational_parameter_m3_s2: float
    schwarzschild_radius_m: float
    landmarks: tuple[
        SchwarzschildLandmark,
        SchwarzschildLandmark,
        SchwarzschildLandmark,
    ]
    static_observer_areal_radius_m: float
    proper_time_rate_vs_infinity: float
    frequency_ratio_at_infinity: float
    far_away_interval_per_local_interval: float
    gravitational_redshift_z: float
    observer_note: str
    model_note: str


def _landmarks(
    schwarzschild_radius_m: float,
) -> tuple[
    SchwarzschildLandmark,
    SchwarzschildLandmark,
    SchwarzschildLandmark,
]:
    rows = tuple(
        SchwarzschildLandmark(
            id=cast(LandmarkId, definition["id"]),
            label=cast(str, definition["label"]),
            radius_rs=cast(float, definition["radius_rs"]),
            radius_m=schwarzschild_radius_m * cast(float, definition["radius_rs"]),
            interpretation=cast(str, definition["interpretation"]),
        )
        for definition in _EXPECTED_LANDMARKS
    )
    if len(rows) != 3:
        raise BlackHoleRelativityModelError()
    return rows


def calculate_black_hole_relativity(
    inputs: BlackHoleRelativityInput,
) -> BlackHoleRelativityResult:
    """Evaluate the reviewed deterministic Schwarzschild v1 teaching model."""

    if not isinstance(inputs, BlackHoleRelativityInput):
        raise BlackHoleRelativityModelError()

    gravitational_parameter = inputs.mass_nominal_solar * NOMINAL_SOLAR_MASS_PARAMETER_M3_S2
    schwarzschild_radius = 2.0 * gravitational_parameter / SPEED_OF_LIGHT_M_S**2
    observer_radius = inputs.static_observer_radius_rs * schwarzschild_radius
    clock_argument = 1.0 - schwarzschild_radius / observer_radius
    if (
        not math.isfinite(gravitational_parameter)
        or not math.isfinite(schwarzschild_radius)
        or not math.isfinite(observer_radius)
        or gravitational_parameter <= 0.0
        or schwarzschild_radius <= 0.0
        or observer_radius <= schwarzschild_radius
        or not 0.0 < clock_argument < 1.0
    ):
        raise BlackHoleRelativityModelError()

    clock_rate = math.sqrt(clock_argument)
    far_interval_factor = 1.0 / clock_rate
    redshift = far_interval_factor - 1.0
    if (
        not math.isfinite(clock_rate)
        or not math.isfinite(far_interval_factor)
        or not math.isfinite(redshift)
        or not 0.0 < clock_rate < 1.0
        or far_interval_factor <= 1.0
        or redshift <= 0.0
    ):
        raise BlackHoleRelativityModelError()

    return BlackHoleRelativityResult(
        model_version=BLACK_HOLE_RELATIVITY_MODEL_VERSION,
        schema_version=BLACK_HOLE_RELATIVITY_SCHEMA_VERSION,
        inputs=inputs,
        gravitational_parameter_m3_s2=gravitational_parameter,
        schwarzschild_radius_m=schwarzschild_radius,
        landmarks=_landmarks(schwarzschild_radius),
        static_observer_areal_radius_m=observer_radius,
        proper_time_rate_vs_infinity=clock_rate,
        frequency_ratio_at_infinity=clock_rate,
        far_away_interval_per_local_interval=far_interval_factor,
        gravitational_redshift_z=redshift,
        observer_note=(
            "The selected clock is a hypothetical static Schwarzschild observer held at fixed "
            "areal radius. It must be accelerated to hover; it is not freely falling and is not "
            "a circular geodesic."
        ),
        model_note=(
            "Educational exterior Schwarzschild model only. The radius is an areal radius, not "
            "proper distance from a center. V1 omits spin, charge, ray tracing, black-hole "
            "shadow prediction, accretion, free fall, orbital integration, hovering "
            "acceleration, tidal forces, mergers, gravitational waves, Hawking radiation, "
            "singularity physics, and observed-source fitting."
        ),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise BlackHoleRelativityModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise BlackHoleRelativityModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise BlackHoleRelativityModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BlackHoleRelativityModelError()
    return value


def _validate_source(value: object) -> str:
    source = _mapping(value)
    required = frozenset(
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
    _exact_keys(source, required)
    source_id = _string(source["id"])
    if source_id not in _SOURCE_URLS:
        raise BlackHoleRelativityModelError()
    url = _string(source["url"])
    parsed = urlparse(url)
    if (
        url != _SOURCE_URLS[source_id]
        or parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise BlackHoleRelativityModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def _input_from_mapping(value: object) -> BlackHoleRelativityInput:
    row = _mapping(value)
    _exact_keys(row, frozenset({"mass_nominal_solar", "static_observer_radius_rs"}))
    return BlackHoleRelativityInput(
        mass_nominal_solar=row["mass_nominal_solar"],  # type: ignore[arg-type]
        static_observer_radius_rs=row["static_observer_radius_rs"],  # type: ignore[arg-type]
    )


def load_reviewed_black_hole_relativity_artifact(
    *,
    repository_root: Path,
) -> dict[str, object]:
    """Load and strictly validate the checked-in Schwarzschild v1 artifact."""

    path = repository_root / BLACK_HOLE_RELATIVITY_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, BlackHoleRelativityModelError):
        raise BlackHoleRelativityModelError() from None

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
                "landmark_definitions",
                "preset",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != BLACK_HOLE_RELATIVITY_ARTIFACT_VERSION
        or artifact["model_version"] != BLACK_HOLE_RELATIVITY_MODEL_VERSION
        or artifact["schema_version"] != BLACK_HOLE_RELATIVITY_SCHEMA_VERSION
        or artifact["share_schema_version"] != BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION
    ):
        raise BlackHoleRelativityModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "black-hole-relativity"
        or definition.get("title") != "Black-Hole / Relativity Lab"
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("model_version") != BLACK_HOLE_RELATIVITY_MODEL_VERSION
        or definition.get("share_schema_version") != BLACK_HOLE_RELATIVITY_SHARE_SCHEMA_VERSION
    ):
        raise BlackHoleRelativityModelError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_IDS):
        raise BlackHoleRelativityModelError()
    source_ids = [_validate_source(source) for source in sources]
    if tuple(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise BlackHoleRelativityModelError()
    if definition.get("references") != source_ids:
        raise BlackHoleRelativityModelError()

    constants = _mapping(artifact["constants"])
    if dict(constants) != _EXPECTED_CONSTANTS:
        raise BlackHoleRelativityModelError()

    landmarks = artifact["landmark_definitions"]
    if landmarks != list(_EXPECTED_LANDMARKS):
        raise BlackHoleRelativityModelError()

    preset = _input_from_mapping(artifact["preset"])
    if preset != BlackHoleRelativityInput(
        mass_nominal_solar=10.0,
        static_observer_radius_rs=2.0,
    ):
        raise BlackHoleRelativityModelError()

    fixtures = artifact["validation_fixtures"]
    if not isinstance(fixtures, list) or len(fixtures) != len(_FIXTURE_IDS):
        raise BlackHoleRelativityModelError()
    fixture_ids: set[str] = set()
    for fixture_value in fixtures:
        fixture = _mapping(fixture_value)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _FIXTURE_IDS:
        raise BlackHoleRelativityModelError()

    scientific = _mapping(artifact["scientific_validation"])
    _exact_keys(
        scientific,
        frozenset(
            {
                "id",
                "source_ids",
                "independent_validation_case",
                "method",
                "test_references",
            }
        ),
    )
    if scientific["id"] != "black-hole-relativity-v1-validation":
        raise BlackHoleRelativityModelError()
    if scientific["source_ids"] != source_ids:
        raise BlackHoleRelativityModelError()
    validation_case = _mapping(scientific["independent_validation_case"])
    _exact_keys(
        validation_case,
        frozenset(
            {
                "inputs",
                "reported_schwarzschild_radius_m",
                "source_id",
            }
        ),
    )
    _input_from_mapping(validation_case["inputs"])
    if (
        validation_case["source_id"] != "openstax-einstein-gravity"
        or validation_case["reported_schwarzschild_radius_m"] != 2_950.0
    ):
        raise BlackHoleRelativityModelError()
    _string(scientific["method"])
    tests = scientific["test_references"]
    if (
        not isinstance(tests, list)
        or len(tests) != len(_FIXTURE_IDS)
        or any(not isinstance(item, str) or not item for item in tests)
        or set(tests) != _FIXTURE_IDS
    ):
        raise BlackHoleRelativityModelError()
    return dict(artifact)


__all__ = [
    "BLACK_HOLE_RELATIVITY_ARTIFACT_PATH",
    "BLACK_HOLE_RELATIVITY_MODEL_VERSION",
    "BlackHoleRelativityInput",
    "BlackHoleRelativityModelError",
    "BlackHoleRelativityResult",
    "EVENT_HORIZON_RADIUS_RS",
    "ISCO_RADIUS_RS",
    "MAX_MASS_NOMINAL_SOLAR",
    "MAX_STATIC_OBSERVER_RADIUS_RS",
    "MIN_MASS_NOMINAL_SOLAR",
    "MIN_STATIC_OBSERVER_RADIUS_RS",
    "NOMINAL_SOLAR_MASS_PARAMETER_M3_S2",
    "PHOTON_SPHERE_RADIUS_RS",
    "SPEED_OF_LIGHT_M_S",
    "SchwarzschildLandmark",
    "calculate_black_hole_relativity",
    "load_reviewed_black_hole_relativity_artifact",
]
