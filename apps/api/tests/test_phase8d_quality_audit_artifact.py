"""Contract checks for the tracked Phase 8D quality-audit evidence artifact."""

from __future__ import annotations

import json
from pathlib import Path
from typing import cast

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_ARTIFACT = _REPOSITORY_ROOT / "data/audits/phase-8d-quality-v1.json"
_REQUIRED_MANUAL_EVIDENCE = {
    "browser-zoom-200",
    "field-inp",
    "representative-hardware-webgl-render-cadence",
    "representative-low-end-device",
    "retained-gpu-memory",
    "screen-reader",
    "wcag-2.2-aa-manual-review",
}


def _load_document() -> dict[str, object]:
    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
        document: dict[str, object] = {}
        for key, value in pairs:
            assert key not in document, f"duplicate JSON key: {key}"
            document[key] = value
        return document

    value = json.loads(
        _ARTIFACT.read_text(encoding="utf-8"),
        object_pairs_hook=reject_duplicate_keys,
    )
    assert isinstance(value, dict)
    return value


def _mapping(value: object) -> dict[str, object]:
    assert isinstance(value, dict)
    assert all(isinstance(key, str) for key in value)
    return cast(dict[str, object], value)


def _string(value: object) -> str:
    assert isinstance(value, str)
    return value


def _evidence_paths(document: dict[str, object]) -> list[str]:
    automated = document["automated_evidence"]
    assert isinstance(automated, dict)
    paths: list[str] = []
    for value in automated.values():
        if isinstance(value, str):
            paths.append(value)
        elif isinstance(value, list):
            assert all(isinstance(item, str) for item in value)
            paths.extend(value)
        elif isinstance(value, dict):
            assert all(isinstance(item, str) for item in value.values())
            paths.extend(value.values())
        else:
            raise AssertionError("Phase 8D automated evidence contains an unsupported value")

    manual_tools = document["manual_tools"]
    assert isinstance(manual_tools, dict)
    assert all(isinstance(item, str) for item in manual_tools.values())
    paths.extend(manual_tools.values())
    return paths


def test_phase8d_quality_audit_artifact_is_bounded_and_points_to_real_evidence() -> None:
    document = _load_document()
    assert document["artifact_version"] == 1
    assert document["audit_id"] == "phase-8d-quality-v1"
    assert document["phase"] == "8D"
    assert document["status"] == "manual_evidence_pending"
    documentation_policy = _mapping(document["documentation_policy"])
    assert documentation_policy["format"] == "tracked_json"
    phase_gate = _mapping(document["phase_gate"])
    assert phase_gate["completion"] == "open"
    assert phase_gate["previous_certified_checkpoint"] == {
        "commit": "24e22cb1f1cc7879d38f7707fead9fed5252069a",
        "hosted_ci_run": "35642172976",
        "result": "success",
    }

    thresholds = _mapping(document["performance_threshold_provenance"])
    core_web_vitals_lab = _mapping(thresholds["core_web_vitals_lab"])
    assert core_web_vitals_lab["lcp_ms"] == 2500
    assert core_web_vitals_lab["cls"] == 0.1
    assert core_web_vitals_lab["scripted_interaction_ms"] == 200
    assert _mapping(thresholds["api_in_process"])["budget"] is None
    assert _mapping(thresholds["representative_hardware_wwt"])["budget"] is None

    verification_commands = _mapping(document["verification_commands"])
    assert verification_commands["repository"] == "pnpm check"
    assert verification_commands["python_postgres"] == "LUMINA_ENV=test uv run pytest -q"
    assert verification_commands["web_build"] == "pnpm build"
    assert verification_commands["web_e2e"] == "pnpm test:e2e"
    assert verification_commands["security"] == "pnpm security:check"
    assert "measure-wwt-hardware.test.mjs" in _string(verification_commands["wwt_tool_tests"])
    assert "--stub-network" in _string(verification_commands["wwt_plumbing"])
    assert "--headless" not in _string(verification_commands["wwt_representative_hardware"])

    repository_root = _REPOSITORY_ROOT.resolve(strict=True)
    for raw_path in _evidence_paths(document):
        path = Path(raw_path)
        assert not path.is_absolute()
        assert ".." not in path.parts
        candidate = _REPOSITORY_ROOT / path
        assert not candidate.is_symlink(), raw_path
        resolved = candidate.resolve(strict=True)
        assert resolved.is_relative_to(repository_root), raw_path
        assert resolved.is_file(), raw_path

    manual = document["manual_evidence_required"]
    assert isinstance(manual, list)
    assert {item["id"] for item in manual} == _REQUIRED_MANUAL_EVIDENCE
    assert all(isinstance(item.get("reason"), str) and item["reason"] for item in manual)

    boundaries = document["claim_boundaries"]
    assert isinstance(boundaries, list)
    serialized = " ".join(boundaries).casefold()
    assert "not described as real browser zoom" in serialized
    assert "not described as screen-reader" in serialized
    assert "not described as field inp" in serialized
    assert "not described as representative low-end hardware" in serialized
    assert "not described as gpu-complete frame timing" in serialized
    assert "not described as deployed http" in serialized
