"""Focused contract tests for Phase 8D manual evidence validation."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from typing import cast

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPOSITORY_ROOT / "scripts/ci/validate_phase8d_manual_evidence.py"
PROTOCOL_PATH = REPOSITORY_ROOT / "data/audits/phase-8d-manual-protocol-v1.json"
FIXED_NOW = datetime(2026, 9, 22, 17, 0, tzinfo=UTC)


def _load_module(name: str, path: Path) -> ModuleType:
    specification = importlib.util.spec_from_file_location(name, path)
    assert specification is not None
    assert specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


_module = _load_module("lumina_phase8d_manual_validator", SCRIPT)
ManualEvidenceError = cast(type[ValueError], _module.ManualEvidenceError)
validate_manual_evidence = _module.validate_manual_evidence
PROTOCOL = json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))


def _item(item_id: str) -> dict[str, object]:
    return cast(dict[str, object], PROTOCOL["evidence_items"][item_id])


def _flows(item_id: str) -> list[str]:
    item = _item(item_id)
    return list(cast(list[str], item["journeys"])) + list(
        cast(list[str], item.get("additional_routes", []))
    )


def _base_environment(environment_id: str) -> dict[str, object]:
    result: dict[str, object] = {
        "environment_id": environment_id,
        "browser": "Chromium",
        "browser_version": "152.0.0",
        "os": "Arch Linux",
        "os_version": "rolling",
        "device": "recorded test device",
        "viewport_width_css_px": None,
        "viewport_height_css_px": None,
        "dpr": None,
        "screen_reader": None,
        "screen_reader_version": None,
        "browser_zoom_percent": None,
        "browser_zoom_confirmed": None,
        "reduced_motion_confirmed": None,
        "webgl_disabled_confirmed": None,
        "network_condition": None,
        "actual_device_confirmed": None,
        "synthetic_cpu": None,
        "synthetic_network": None,
        "touch_input_confirmed": None,
    }
    return result


def _environments(item_id: str) -> list[dict[str, object]]:
    if item_id == "wcag-2.2-aa-manual-review":
        general = _base_environment("general")
        screen_reader = _base_environment("screen-reader")
        screen_reader["screen_reader"] = "Orca"
        screen_reader["screen_reader_version"] = "50.2"
        browser_zoom = _base_environment("browser-zoom-200")
        browser_zoom["browser_zoom_percent"] = 200
        browser_zoom["browser_zoom_confirmed"] = True
        reduced_motion = _base_environment("reduced-motion")
        reduced_motion["reduced_motion_confirmed"] = True
        webgl_disabled = _base_environment("webgl-disabled")
        webgl_disabled["webgl_disabled_confirmed"] = True
        touch = _base_environment("touch-device")
        touch["device"] = "recorded physical touch device"
        touch["actual_device_confirmed"] = True
        touch["touch_input_confirmed"] = True
        return [
            general,
            screen_reader,
            browser_zoom,
            reduced_motion,
            webgl_disabled,
            touch,
        ]
    primary = _base_environment("primary")
    if item_id == "screen-reader":
        primary["screen_reader"] = "Orca"
        primary["screen_reader_version"] = "50.2"
    if item_id == "browser-zoom-200":
        primary["browser_zoom_percent"] = 200
        primary["browser_zoom_confirmed"] = True
    if item_id == "representative-low-end-device":
        primary.update(
            {
                "viewport_width_css_px": 393,
                "viewport_height_css_px": 873,
                "dpr": 2.75,
                "network_condition": "recorded Wi-Fi connection; no synthetic throttling",
                "actual_device_confirmed": True,
                "synthetic_cpu": False,
                "synthetic_network": False,
            }
        )
    return [primary]


def _environment_id_for_check(item_id: str, check: str) -> str:
    if item_id == "wcag-2.2-aa-manual-review":
        return {
            "screen-reader landmarks": "screen-reader",
            "real browser 200% zoom": "browser-zoom-200",
            "reduced motion": "reduced-motion",
            "canvas alternative": "webgl-disabled",
            "touch-only interaction": "touch-device",
        }.get(check, "general")
    return "primary"


def _valid_evidence(
    item_id: str,
    *,
    status: str = "observed_pass",
    observation_status: str = "observed_pass",
) -> dict[str, object]:
    item = _item(item_id)
    flows = _flows(item_id)
    checks = cast(list[str], item["checks"])
    observations = [
        {
            "route_or_flow": flow,
            "check": check,
            "environment_id": _environment_id_for_check(item_id, check),
            "status": observation_status,
            "notes": f"Recorded {check} on {flow}.",
            "evidence_references": [],
        }
        for flow in flows
        for check in checks
    ]
    findings: list[str] = []
    if observation_status == "observed_finding":
        findings = ["A concrete finding was recorded during the sampled manual flow."]
    return {
        "artifact_version": 1,
        "evidence_id": f"phase-8d-{item_id}-manual-v1",
        "phase": "8D",
        "item_id": item_id,
        "status": status,
        "observed_at": "2026-09-22T16:30:00Z",
        "build_commit": "ea7d638f1a4d730a4cb609e1a4750b825cca0595",
        "operator_or_reviewer": "manual-reviewer",
        "browser_os_device": _environments(item_id),
        "manual_attestation": {
            "performed_manually": True,
            "operator_confirmed_environment": True,
            "automation_only": False,
            "notes": "The reviewer directly operated the recorded environment.",
        },
        "procedure": ["Follow the tracked Phase 8D manual journey and record each required check."],
        "route_or_flow": flows,
        "observations": observations,
        "evidence_references": ["manual-session-reference"],
        "findings": findings,
        "claim_boundary": item["claim_boundary"],
    }


@pytest.mark.parametrize(
    "item_id",
    [
        "wcag-2.2-aa-manual-review",
        "screen-reader",
        "browser-zoom-200",
        "representative-low-end-device",
    ],
)
def test_accepts_complete_manual_evidence_for_supported_items(item_id: str) -> None:
    evidence = _valid_evidence(item_id)
    assert validate_manual_evidence(evidence, now=FIXED_NOW) == evidence


@pytest.mark.parametrize("version", [True, 1.0])
def test_rejects_non_integer_evidence_artifact_version(version: object) -> None:
    evidence = _valid_evidence("screen-reader")
    evidence["artifact_version"] = version
    with pytest.raises(ManualEvidenceError, match="artifact_version must be 1"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_low_end_requires_all_protocol_additional_routes() -> None:
    evidence = _valid_evidence("representative-low-end-device")
    routes = cast(list[str], evidence["route_or_flow"])
    routes.remove("/lab")
    with pytest.raises(
        ManualEvidenceError, match="every required protocol journey/additional route"
    ):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_observed_pass_rejects_any_non_pass_required_observation() -> None:
    evidence = _valid_evidence("browser-zoom-200")
    observations = cast(list[dict[str, object]], evidence["observations"])
    observations[0]["status"] = "inconclusive"
    with pytest.raises(
        ManualEvidenceError, match="observed_pass requires every required observation"
    ):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_requires_every_flow_check_pair_exactly_once() -> None:
    evidence = _valid_evidence("screen-reader")
    observations = cast(list[dict[str, object]], evidence["observations"])
    observations.pop()
    with pytest.raises(ManualEvidenceError, match="observations are incomplete"):
        validate_manual_evidence(evidence, now=FIXED_NOW)

    evidence = _valid_evidence("screen-reader")
    observations = cast(list[dict[str, object]], evidence["observations"])
    observations.append(dict(observations[0]))
    with pytest.raises(ManualEvidenceError, match="duplicate observation"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_rejects_unknown_flow_or_check() -> None:
    evidence = _valid_evidence("wcag-2.2-aa-manual-review")
    observations = cast(list[dict[str, object]], evidence["observations"])
    observations[0]["check"] = "invented check"
    with pytest.raises(ManualEvidenceError, match="unknown route_or_flow/check pair"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_screen_reader_requires_real_reader_identity() -> None:
    evidence = _valid_evidence("screen-reader")
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environment = environments[0]
    environment["screen_reader"] = None
    environment["screen_reader_version"] = None
    with pytest.raises(ManualEvidenceError, match="real screen reader name and version"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize(
    ("field", "value"),
    [("browser_zoom_percent", 175), ("browser_zoom_confirmed", False)],
)
def test_browser_zoom_requires_confirmed_native_200_percent(field: str, value: object) -> None:
    evidence = _valid_evidence("browser-zoom-200")
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environments[0][field] = value
    with pytest.raises(ManualEvidenceError, match="confirmed native browser page zoom at 200%"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("actual_device_confirmed", False, "actual physical device"),
        ("synthetic_cpu", True, "must not substitute synthetic CPU or network throttling"),
        ("synthetic_network", True, "must not substitute synthetic CPU or network throttling"),
        ("network_condition", None, "requires viewport, DPR, and network condition"),
    ],
)
def test_low_end_requires_real_device_without_synthetic_substitution(
    field: str, value: object, message: str
) -> None:
    evidence = _valid_evidence("representative-low-end-device")
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environments[0][field] = value
    with pytest.raises(ManualEvidenceError, match=message):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize(
    ("item_id", "environment_field", "value"),
    [
        ("screen-reader", "screen_reader", None),
        ("browser-zoom-200", "browser_zoom_confirmed", False),
        ("representative-low-end-device", "actual_device_confirmed", False),
    ],
)
def test_unavailable_observation_does_not_require_the_missing_environment_capability(
    item_id: str,
    environment_field: str,
    value: object,
) -> None:
    evidence = _valid_evidence(
        item_id,
        status="unavailable",
        observation_status="unavailable",
    )
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environments[0][environment_field] = value
    if item_id == "screen-reader":
        environments[0]["screen_reader_version"] = None

    assert validate_manual_evidence(evidence, now=FIXED_NOW) == evidence


@pytest.mark.parametrize(
    ("item_id", "environment_field", "value", "message"),
    [
        ("screen-reader", "screen_reader", None, "real screen reader name and version"),
        (
            "browser-zoom-200",
            "browser_zoom_confirmed",
            False,
            "confirmed native browser page zoom at 200%",
        ),
        (
            "representative-low-end-device",
            "actual_device_confirmed",
            False,
            "actual physical device",
        ),
    ],
)
def test_inconclusive_observation_still_requires_the_recorded_environment_capability(
    item_id: str,
    environment_field: str,
    value: object,
    message: str,
) -> None:
    evidence = _valid_evidence(
        item_id,
        status="inconclusive",
        observation_status="inconclusive",
    )
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environments[0][environment_field] = value
    if item_id == "screen-reader":
        environments[0]["screen_reader_version"] = None

    with pytest.raises(ManualEvidenceError, match=message):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize(
    ("check", "environment_id", "mutations"),
    [
        (
            "screen-reader landmarks",
            "screen-reader",
            {"screen_reader": None, "screen_reader_version": None},
        ),
        (
            "real browser 200% zoom",
            "browser-zoom-200",
            {"browser_zoom_confirmed": False},
        ),
        (
            "reduced motion",
            "reduced-motion",
            {"reduced_motion_confirmed": False},
        ),
        (
            "canvas alternative",
            "webgl-disabled",
            {"webgl_disabled_confirmed": False},
        ),
        (
            "touch-only interaction",
            "touch-device",
            {"actual_device_confirmed": False, "touch_input_confirmed": False},
        ),
    ],
)
def test_wcag_unavailable_check_can_record_the_missing_specialized_capability(
    check: str,
    environment_id: str,
    mutations: dict[str, object],
) -> None:
    evidence = _valid_evidence("wcag-2.2-aa-manual-review", status="unavailable")
    observations = cast(list[dict[str, object]], evidence["observations"])
    matching = [observation for observation in observations if observation["check"] == check]
    assert matching
    for observation in matching:
        observation["status"] = "unavailable"
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environment = next(item for item in environments if item["environment_id"] == environment_id)
    environment.update(mutations)

    assert validate_manual_evidence(evidence, now=FIXED_NOW) == evidence


def test_wcag_screen_reader_checks_require_real_reader_environment() -> None:
    evidence = _valid_evidence("wcag-2.2-aa-manual-review")
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environment = next(item for item in environments if item["environment_id"] == "screen-reader")
    environment["screen_reader"] = None
    environment["screen_reader_version"] = None
    with pytest.raises(ManualEvidenceError, match="real screen reader name and version"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_wcag_zoom_checks_require_native_200_percent_environment() -> None:
    evidence = _valid_evidence("wcag-2.2-aa-manual-review")
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environment = next(
        item for item in environments if item["environment_id"] == "browser-zoom-200"
    )
    environment["browser_zoom_percent"] = 175
    with pytest.raises(ManualEvidenceError, match="confirmed native browser page zoom at 200%"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_wcag_touch_checks_require_recorded_physical_touch_environment() -> None:
    evidence = _valid_evidence("wcag-2.2-aa-manual-review")
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    touch = next(item for item in environments if item["environment_id"] == "touch-device")
    touch["touch_input_confirmed"] = False
    with pytest.raises(ManualEvidenceError, match="confirmed touch input"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize(
    ("check", "environment_id", "field", "message"),
    [
        (
            "reduced motion",
            "reduced-motion",
            "reduced_motion_confirmed",
            "confirmed reduced-motion mode",
        ),
        (
            "canvas alternative",
            "webgl-disabled",
            "webgl_disabled_confirmed",
            "confirmed WebGL-disabled mode",
        ),
    ],
)
def test_wcag_environment_sensitive_checks_require_recorded_mode(
    check: str,
    environment_id: str,
    field: str,
    message: str,
) -> None:
    evidence = _valid_evidence("wcag-2.2-aa-manual-review")
    environments = cast(list[dict[str, object]], evidence["browser_os_device"])
    environment = next(item for item in environments if item["environment_id"] == environment_id)
    environment[field] = False
    observations = cast(list[dict[str, object]], evidence["observations"])
    assert any(
        observation["check"] == check and observation["environment_id"] == environment_id
        for observation in observations
    )
    with pytest.raises(ManualEvidenceError, match=message):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_observation_must_reference_recorded_environment() -> None:
    evidence = _valid_evidence("screen-reader")
    observations = cast(list[dict[str, object]], evidence["observations"])
    observations[0]["environment_id"] = "missing"
    with pytest.raises(ManualEvidenceError, match="does not name a recorded environment"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize(
    ("summary_status", "required_observation"),
    [
        ("observed_finding", "observed_finding"),
        ("inconclusive", "inconclusive"),
        ("unavailable", "unavailable"),
    ],
)
def test_non_pass_summary_status_requires_matching_observation(
    summary_status: str,
    required_observation: str,
) -> None:
    evidence = _valid_evidence("browser-zoom-200", status=summary_status)
    if summary_status == "observed_finding":
        evidence["findings"] = ["Summary finding without an observation should be rejected."]
    with pytest.raises(
        ManualEvidenceError,
        match=(
            f"top-level {summary_status} requires at least one {required_observation} observation"
        ),
    ):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize("summary_status", ["inconclusive", "unavailable"])
def test_summary_status_cannot_hide_an_observed_finding(summary_status: str) -> None:
    evidence = _valid_evidence("browser-zoom-200", status=summary_status)
    observations = cast(list[dict[str, object]], evidence["observations"])
    observations[0]["status"] = "observed_finding"
    observations[1]["status"] = summary_status
    evidence["findings"] = ["A concrete manual finding was recorded."]

    with pytest.raises(
        ManualEvidenceError,
        match="observed_finding observation requires top-level observed_finding",
    ):
        validate_manual_evidence(evidence, now=FIXED_NOW)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("performed_manually", False, "performed_manually must be true"),
        ("operator_confirmed_environment", False, "operator_confirmed_environment must be true"),
        ("automation_only", True, "automation_only must be false"),
    ],
)
def test_requires_manual_operator_attestation(field: str, value: object, message: str) -> None:
    evidence = _valid_evidence("wcag-2.2-aa-manual-review")
    cast(dict[str, object], evidence["manual_attestation"])[field] = value
    with pytest.raises(ManualEvidenceError, match=message):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_finding_requires_top_level_findings_text() -> None:
    evidence = _valid_evidence(
        "wcag-2.2-aa-manual-review",
        status="observed_finding",
        observation_status="observed_finding",
    )
    evidence["findings"] = []
    with pytest.raises(ManualEvidenceError, match="findings must describe at least one issue"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_rejects_wrong_claim_boundary_bad_commit_and_future_time() -> None:
    evidence = _valid_evidence("browser-zoom-200")
    evidence["claim_boundary"] = "invented"
    with pytest.raises(ManualEvidenceError, match="claim_boundary"):
        validate_manual_evidence(evidence, now=FIXED_NOW)

    evidence = _valid_evidence("browser-zoom-200")
    evidence["build_commit"] = "deadbeef"
    with pytest.raises(ManualEvidenceError, match="40-character Git SHA"):
        validate_manual_evidence(evidence, now=FIXED_NOW)

    evidence = _valid_evidence("browser-zoom-200")
    evidence["observed_at"] = "2026-09-22T17:00:01Z"
    with pytest.raises(ManualEvidenceError, match="observed_at must not be in the future"):
        validate_manual_evidence(evidence, now=FIXED_NOW)


def test_rejects_unknown_top_level_fields_and_non_finite_json(tmp_path: Path) -> None:
    evidence = _valid_evidence("screen-reader")
    evidence["automation_result"] = "forbidden"
    with pytest.raises(ManualEvidenceError, match="top-level keys mismatch"):
        validate_manual_evidence(evidence, now=FIXED_NOW)

    path = tmp_path / "manual.json"
    path.write_text('{"value": NaN}', encoding="utf-8")
    with pytest.raises(ManualEvidenceError, match="non-finite JSON number"):
        _module._load_input(path)


def test_manual_input_reader_rejects_symlink_and_oversized_json(tmp_path: Path) -> None:
    target = tmp_path / "target.json"
    target.write_text('{"value": 1}', encoding="utf-8")
    symlink = tmp_path / "manual-link.json"
    symlink.symlink_to(target)
    with pytest.raises(ManualEvidenceError, match="could not open manual evidence safely"):
        _module._load_input(symlink)

    oversized = tmp_path / "oversized.json"
    oversized.write_text(
        '{"padding":"' + ("x" * (1024 * 1024)) + '"}',
        encoding="utf-8",
    )
    with pytest.raises(ManualEvidenceError, match="exceeds the 1 MiB input bound"):
        _module._load_input(oversized)

    fifo = tmp_path / "manual-fifo.json"
    os.mkfifo(fifo)
    with pytest.raises(ManualEvidenceError, match="manual evidence must be a regular file"):
        _module._load_input(fifo)

    invalid_utf8 = tmp_path / "invalid-utf8.json"
    invalid_utf8.write_bytes(b'{"value":"\xff"}')
    with pytest.raises(ManualEvidenceError, match="decode manual evidence as UTF-8"):
        _module._load_input(invalid_utf8)


def test_rejects_same_version_phase_protocol_with_wrong_protocol_id() -> None:
    protocol = dict(PROTOCOL)
    protocol["protocol_id"] = "phase-8d-manual-protocol-impostor"
    with pytest.raises(ManualEvidenceError, match="manual protocol identity is invalid"):
        _module._validate_protocol_identity(protocol)


@pytest.mark.parametrize("version", [True, 1.0])
def test_rejects_non_integer_protocol_version(version: object) -> None:
    protocol = dict(PROTOCOL)
    protocol["artifact_version"] = version
    with pytest.raises(ManualEvidenceError, match="manual protocol identity is invalid"):
        _module._validate_protocol_identity(protocol)
