"""Deterministic one-dimensional inertial-frame special-relativity teaching model."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from urllib.parse import urlparse

RELATIVITY_VISUALIZATIONS_MODEL_VERSION: Final = "relativity-visualizations-v1"
RELATIVITY_VISUALIZATIONS_SCHEMA_VERSION: Final = 1
RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION: Final = 1
RELATIVITY_VISUALIZATIONS_ARTIFACT_VERSION: Final = 1
RELATIVITY_VISUALIZATIONS_ARTIFACT_PATH: Final = "data/seed/relativity-visualizations-v1.json"

SPEED_OF_LIGHT_M_S: Final = 299_792_458.0
MIN_RELATIVE_SPEED_FRACTION_C: Final = 0.0
MAX_RELATIVE_SPEED_FRACTION_C: Final = 0.99
MIN_PROPER_TIME_S: Final = 1.0e-9
MAX_PROPER_TIME_S: Final = 1.0e9
MIN_PROPER_LENGTH_M: Final = 1.0e-6
MAX_PROPER_LENGTH_M: Final = 1.0e15
MIN_SIMULTANEOUS_EVENT_SEPARATION_M: Final = 0.0
MAX_SIMULTANEOUS_EVENT_SEPARATION_M: Final = 1.0e15

_SOURCE_URLS: Final = {
    "nist-speed-of-light": "https://physics.nist.gov/cuu/Constants/Value/c.html",
    "openstax-special-relativity": (
        "https://openstax.org/books/university-physics-volume-3/pages/5-introduction"
    ),
    "openstax-time-dilation": (
        "https://openstax.org/books/university-physics-volume-3/pages/5-3-time-dilation"
    ),
    "openstax-length-contraction": (
        "https://openstax.org/books/university-physics-volume-3/pages/5-4-length-contraction"
    ),
    "openstax-lorentz-transformation": (
        "https://openstax.org/books/university-physics-volume-3/pages/"
        "5-5-the-lorentz-transformation"
    ),
    "mit-ocw-relativity": (
        "https://www.ocw.mit.edu/courses/8-033-relativity-fall-2006/pages/syllabus/"
    ),
    "einstein-online-light-cone": "https://www.einstein-online.info/en/explandict/light-cone/",
    "einstein-online-relativity-space-time": (
        "https://www.einstein-online.info/en/relativity_space_time/"
    ),
}
_SOURCE_IDS: Final = tuple(_SOURCE_URLS)
_FIXTURE_IDS: Final = frozenset(
    {
        "exact-beta-point-six",
        "zero-speed-identity",
        "maximum-speed-bound",
        "gamma-monotonicity",
        "time-dilation-ordering",
        "length-contraction-ordering",
        "simultaneity-sign",
        "input-linearity",
        "input-domain-rejection",
        "deterministic-repeat",
        "artifact-mutation",
    }
)
_EXPECTED_CONSTANTS: Final = {
    "SPEED_OF_LIGHT_M_S": SPEED_OF_LIGHT_M_S,
    "MIN_RELATIVE_SPEED_FRACTION_C": MIN_RELATIVE_SPEED_FRACTION_C,
    "MAX_RELATIVE_SPEED_FRACTION_C": MAX_RELATIVE_SPEED_FRACTION_C,
    "MIN_PROPER_TIME_S": MIN_PROPER_TIME_S,
    "MAX_PROPER_TIME_S": MAX_PROPER_TIME_S,
    "MIN_PROPER_LENGTH_M": MIN_PROPER_LENGTH_M,
    "MAX_PROPER_LENGTH_M": MAX_PROPER_LENGTH_M,
    "MIN_SIMULTANEOUS_EVENT_SEPARATION_M": MIN_SIMULTANEOUS_EVENT_SEPARATION_M,
    "MAX_SIMULTANEOUS_EVENT_SEPARATION_M": MAX_SIMULTANEOUS_EVENT_SEPARATION_M,
}
_EXPECTED_LIGHT_CONE: Final = {
    "coordinate_system": "normalized ct-versus-x teaching coordinates with c=1",
    "segments": [
        {"id": "future-left", "x0": 0.0, "ct0": 0.0, "x1": -1.0, "ct1": 1.0},
        {"id": "future-right", "x0": 0.0, "ct0": 0.0, "x1": 1.0, "ct1": 1.0},
        {"id": "past-left", "x0": 0.0, "ct0": 0.0, "x1": -1.0, "ct1": -1.0},
        {"id": "past-right", "x0": 0.0, "ct0": 0.0, "x1": 1.0, "ct1": -1.0},
    ],
    "note": (
        "The reviewed normalized lines are conceptual causal boundaries. The browser may render "
        "these fixed coordinates but must not derive them from user input."
    ),
}


class RelativityVisualizationsModelError(ValueError):
    """Raised when input or reviewed artifact leaves the frozen v1 contract."""


def _number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RelativityVisualizationsModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise RelativityVisualizationsModelError()
    return numeric


@dataclass(frozen=True, slots=True)
class RelativityVisualizationsInput:
    relative_speed_fraction_c: float
    proper_time_s: float
    proper_length_m: float
    simultaneous_event_separation_m: float

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "relative_speed_fraction_c",
            _number(
                self.relative_speed_fraction_c,
                minimum=MIN_RELATIVE_SPEED_FRACTION_C,
                maximum=MAX_RELATIVE_SPEED_FRACTION_C,
            ),
        )
        object.__setattr__(
            self,
            "proper_time_s",
            _number(
                self.proper_time_s,
                minimum=MIN_PROPER_TIME_S,
                maximum=MAX_PROPER_TIME_S,
            ),
        )
        object.__setattr__(
            self,
            "proper_length_m",
            _number(
                self.proper_length_m,
                minimum=MIN_PROPER_LENGTH_M,
                maximum=MAX_PROPER_LENGTH_M,
            ),
        )
        object.__setattr__(
            self,
            "simultaneous_event_separation_m",
            _number(
                self.simultaneous_event_separation_m,
                minimum=MIN_SIMULTANEOUS_EVENT_SEPARATION_M,
                maximum=MAX_SIMULTANEOUS_EVENT_SEPARATION_M,
            ),
        )


@dataclass(frozen=True, slots=True)
class RelativityVisualizationsResult:
    model_version: str
    schema_version: int
    inputs: RelativityVisualizationsInput
    relative_speed_m_s: float
    lorentz_factor: float
    dilated_time_s: float
    contracted_length_m: float
    simultaneity_offset_s: float
    simultaneity_interpretation: str
    time_dilation_note: str
    length_contraction_note: str
    light_cone_note: str
    model_note: str


def calculate_relativity_visualizations(
    inputs: RelativityVisualizationsInput,
) -> RelativityVisualizationsResult:
    """Evaluate the reviewed deterministic special-relativity v1 teaching model."""

    if not isinstance(inputs, RelativityVisualizationsInput):
        raise RelativityVisualizationsModelError()

    beta = inputs.relative_speed_fraction_c
    gamma_argument = 1.0 - beta**2
    if not 0.0 < gamma_argument <= 1.0:
        raise RelativityVisualizationsModelError()
    gamma = 1.0 / math.sqrt(gamma_argument)
    relative_speed = beta * SPEED_OF_LIGHT_M_S
    dilated_time = gamma * inputs.proper_time_s
    contracted_length = inputs.proper_length_m / gamma
    simultaneity_offset = (
        -gamma * beta * inputs.simultaneous_event_separation_m / SPEED_OF_LIGHT_M_S
    )
    values = (
        gamma,
        relative_speed,
        dilated_time,
        contracted_length,
        simultaneity_offset,
    )
    if (
        any(not math.isfinite(value) for value in values)
        or gamma < 1.0
        or relative_speed < 0.0
        or dilated_time < inputs.proper_time_s
        or contracted_length <= 0.0
        or contracted_length > inputs.proper_length_m
        or simultaneity_offset > 0.0
    ):
        raise RelativityVisualizationsModelError()

    if simultaneity_offset < 0.0:
        simultaneity_interpretation = (
            "In S', event B at +x occurs earlier than event A under the frozen sign convention."
        )
    else:
        simultaneity_interpretation = (
            "The two events remain simultaneous in S' because relative speed or separation is zero."
        )

    return RelativityVisualizationsResult(
        model_version=RELATIVITY_VISUALIZATIONS_MODEL_VERSION,
        schema_version=RELATIVITY_VISUALIZATIONS_SCHEMA_VERSION,
        inputs=inputs,
        relative_speed_m_s=relative_speed,
        lorentz_factor=gamma,
        dilated_time_s=dilated_time,
        contracted_length_m=contracted_length,
        simultaneity_offset_s=simultaneity_offset,
        simultaneity_interpretation=simultaneity_interpretation,
        time_dilation_note=(
            "Proper time is measured in the frame where both defining events occur at the same "
            "position. The returned dilated interval belongs to the inertial frame that sees that "
            "clock moving at the selected relative speed."
        ),
        length_contraction_note=(
            "Proper length is measured in the object's rest frame. The returned contracted length "
            "uses simultaneous endpoint positions in the inertial frame where the object moves; "
            "it is not a photographic appearance prediction."
        ),
        light_cone_note=(
            "The companion light-cone lesson uses fixed reviewed normalized c=1 geometry to teach "
            "causal boundaries. It is not derived from these user inputs in the browser."
        ),
        model_note=(
            "Educational one-dimensional inertial special-relativity model only. V1 omits "
            "acceleration, twin-paradox turnaround dynamics, velocity addition, relativistic "
            "Doppler shift, momentum/energy, four-vectors, arbitrary 3D boosts, rotating frames, "
            "general relativity, gravitational-redshift calculations, and GPS correction models."
        ),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise RelativityVisualizationsModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise RelativityVisualizationsModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise RelativityVisualizationsModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RelativityVisualizationsModelError()
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
        raise RelativityVisualizationsModelError()
    url = _string(source["url"])
    parsed = urlparse(url)
    if (
        url != _SOURCE_URLS[source_id]
        or parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise RelativityVisualizationsModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def _input_from_mapping(value: object) -> RelativityVisualizationsInput:
    row = _mapping(value)
    _exact_keys(
        row,
        frozenset(
            {
                "relative_speed_fraction_c",
                "proper_time_s",
                "proper_length_m",
                "simultaneous_event_separation_m",
            }
        ),
    )
    return RelativityVisualizationsInput(
        relative_speed_fraction_c=row["relative_speed_fraction_c"],  # type: ignore[arg-type]
        proper_time_s=row["proper_time_s"],  # type: ignore[arg-type]
        proper_length_m=row["proper_length_m"],  # type: ignore[arg-type]
        simultaneous_event_separation_m=row["simultaneous_event_separation_m"],  # type: ignore[arg-type]
    )


def load_reviewed_relativity_visualizations_artifact(
    *,
    repository_root: Path,
) -> dict[str, object]:
    """Load and strictly validate the checked-in special-relativity v1 artifact."""

    path = repository_root / RELATIVITY_VISUALIZATIONS_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, RelativityVisualizationsModelError):
        raise RelativityVisualizationsModelError() from None

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
                "light_cone",
                "preset",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != RELATIVITY_VISUALIZATIONS_ARTIFACT_VERSION
        or artifact["model_version"] != RELATIVITY_VISUALIZATIONS_MODEL_VERSION
        or artifact["schema_version"] != RELATIVITY_VISUALIZATIONS_SCHEMA_VERSION
        or artifact["share_schema_version"] != RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION
    ):
        raise RelativityVisualizationsModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "relativity-visualizations"
        or definition.get("title") != "Relativity Visualizations"
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("model_version") != RELATIVITY_VISUALIZATIONS_MODEL_VERSION
        or definition.get("share_schema_version") != RELATIVITY_VISUALIZATIONS_SHARE_SCHEMA_VERSION
    ):
        raise RelativityVisualizationsModelError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_IDS):
        raise RelativityVisualizationsModelError()
    source_ids = [_validate_source(source) for source in sources]
    if tuple(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise RelativityVisualizationsModelError()
    if definition.get("references") != source_ids:
        raise RelativityVisualizationsModelError()

    constants = _mapping(artifact["constants"])
    if dict(constants) != _EXPECTED_CONSTANTS:
        raise RelativityVisualizationsModelError()
    if artifact["light_cone"] != _EXPECTED_LIGHT_CONE:
        raise RelativityVisualizationsModelError()

    preset = _input_from_mapping(artifact["preset"])
    if preset != RelativityVisualizationsInput(
        relative_speed_fraction_c=0.6,
        proper_time_s=10.0,
        proper_length_m=100.0,
        simultaneous_event_separation_m=SPEED_OF_LIGHT_M_S,
    ):
        raise RelativityVisualizationsModelError()

    fixtures = artifact["validation_fixtures"]
    if not isinstance(fixtures, list) or len(fixtures) != len(_FIXTURE_IDS):
        raise RelativityVisualizationsModelError()
    fixture_ids: set[str] = set()
    for fixture_value in fixtures:
        fixture = _mapping(fixture_value)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _FIXTURE_IDS:
        raise RelativityVisualizationsModelError()

    scientific = _mapping(artifact["scientific_validation"])
    _exact_keys(
        scientific,
        frozenset({"id", "source_ids", "reference_validation_case", "method", "test_references"}),
    )
    if scientific["id"] != "relativity-visualizations-v1-validation":
        raise RelativityVisualizationsModelError()
    if scientific["source_ids"] != source_ids:
        raise RelativityVisualizationsModelError()
    reference = _mapping(scientific["reference_validation_case"])
    _exact_keys(reference, frozenset({"inputs", "expected", "source_ids"}))
    if _input_from_mapping(reference["inputs"]) != preset:
        raise RelativityVisualizationsModelError()
    expected = _mapping(reference["expected"])
    if dict(expected) != {
        "lorentz_factor": 1.25,
        "dilated_time_s": 12.5,
        "contracted_length_m": 80.0,
        "simultaneity_offset_s": -0.75,
    }:
        raise RelativityVisualizationsModelError()
    if reference["source_ids"] != [
        "nist-speed-of-light",
        "openstax-time-dilation",
        "openstax-length-contraction",
        "openstax-lorentz-transformation",
    ]:
        raise RelativityVisualizationsModelError()
    _string(scientific["method"])
    tests = scientific["test_references"]
    if (
        not isinstance(tests, list)
        or len(tests) != len(_FIXTURE_IDS)
        or any(not isinstance(item, str) or not item for item in tests)
        or set(tests) != _FIXTURE_IDS
    ):
        raise RelativityVisualizationsModelError()
    return dict(artifact)


__all__ = [
    "MAX_PROPER_LENGTH_M",
    "MAX_PROPER_TIME_S",
    "MAX_RELATIVE_SPEED_FRACTION_C",
    "MAX_SIMULTANEOUS_EVENT_SEPARATION_M",
    "MIN_PROPER_LENGTH_M",
    "MIN_PROPER_TIME_S",
    "MIN_RELATIVE_SPEED_FRACTION_C",
    "MIN_SIMULTANEOUS_EVENT_SEPARATION_M",
    "RELATIVITY_VISUALIZATIONS_ARTIFACT_PATH",
    "RELATIVITY_VISUALIZATIONS_MODEL_VERSION",
    "RelativityVisualizationsInput",
    "RelativityVisualizationsModelError",
    "RelativityVisualizationsResult",
    "SPEED_OF_LIGHT_M_S",
    "calculate_relativity_visualizations",
    "load_reviewed_relativity_visualizations_artifact",
]
