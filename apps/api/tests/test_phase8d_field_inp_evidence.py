"""Focused contract tests for the Phase 8D field-INP evidence importer."""

from __future__ import annotations

import hashlib
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
SCRIPT = REPOSITORY_ROOT / "scripts/ci/validate_phase8d_field_inp.py"
FIXED_NOW = datetime(2026, 9, 22, 16, 30, tzinfo=UTC)
EXPORT_BYTES = b"approved aggregate field-INP export fixture\n"
EXPORT_SHA256 = hashlib.sha256(EXPORT_BYTES).hexdigest()


def _load_module(name: str, path: Path) -> ModuleType:
    specification = importlib.util.spec_from_file_location(name, path)
    assert specification is not None
    assert specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


_module = _load_module("lumina_phase8d_field_inp_validator", SCRIPT)
FieldInpEvidenceError = cast(type[ValueError], _module.FieldInpEvidenceError)
validate_field_inp_evidence = _module.validate_field_inp_evidence


def _status_values(status: str) -> tuple[int, float | None]:
    return (0, None) if status == "unavailable" else (1200, 180.0)


def _approvals(
    *,
    status: str = "observed_finding",
    statistic: str = "p75",
) -> dict[str, object]:
    count, value_ms = _status_values(status)
    return {
        "artifact_version": 1,
        "manifest_id": "phase-8d-field-inp-approvals-v1",
        "phase": "8D",
        "approved_sources": [
            {
                "approval_id": "source-aggregate-1",
                "name": "Approved aggregate field source",
                "kind": "aggregate-observability-export",
                "documentation_url": "https://example.com/field-metrics-docs",
                "approval_reference": "source-review-2026-09-field-inp",
            }
        ],
        "approved_deployments": [
            {
                "approval_id": "deployment-prod-4089497",
                "origin": "https://lumina.example/",
                "build_commit": "4089497d795d1895b844cb39cbb80c7d0e56ce55",
                "environment": "production",
                "deployment_reference": "deploy-2026-09-22-01",
            }
        ],
        "approved_privacy_reviews": [
            {
                "approval_id": "privacy-field-inp-1",
                "approval_reference": "privacy-review-2026-09-field-inp",
                "reviewer": "privacy-reviewer",
                "approved_at": "2026-09-14T12:00:00Z",
                "scope": "aggregate field-INP evidence from the approved source and deployment",
            }
        ],
        "approved_exports": [
            {
                "approval_id": "export-aggregate-1",
                "source_approval_id": "source-aggregate-1",
                "deployment_approval_id": "deployment-prod-4089497",
                "privacy_approval_id": "privacy-field-inp-1",
                "sha256": EXPORT_SHA256,
                "reference": "aggregate-export-2026-09-22",
                "observation_start": "2026-09-15T00:00:00Z",
                "observation_end": "2026-09-22T15:00:00Z",
                "sample_count": count,
                "aggregation_metric": "INP",
                "aggregation_statistic": statistic,
                "aggregation_value_ms": value_ms,
                "segmentation_scope": "origin",
                "segmentation_description": (
                    "all production routes and supported form factors combined"
                ),
            }
        ],
        "claim_boundary": "fixture approval manifest for validator tests",
    }


def _valid_evidence(
    *,
    status: str = "observed_finding",
    statistic: str = "p75",
) -> dict[str, object]:
    count, value_ms = _status_values(status)
    return {
        "artifact_version": 1,
        "evidence_id": "phase-8d-field-inp-v1",
        "phase": "8D",
        "status": status,
        "observed_at": "2026-09-22T16:00:00Z",
        "deployment": {
            "approval_id": "deployment-prod-4089497",
            "origin": "https://lumina.example/",
            "build_commit": "4089497d795d1895b844cb39cbb80c7d0e56ce55",
            "environment": "production",
            "deployment_reference": "deploy-2026-09-22-01",
        },
        "observation_window": {
            "start": "2026-09-15T00:00:00Z",
            "end": "2026-09-22T15:00:00Z",
        },
        "instrumentation_source": {
            "approval_id": "source-aggregate-1",
            "name": "Approved aggregate field source",
            "kind": "aggregate-observability-export",
            "documentation_url": "https://example.com/field-metrics-docs",
            "approval_reference": "source-review-2026-09-field-inp",
        },
        "sample_population": {
            "description": "production visits represented by the approved aggregate export",
            "count": count,
        },
        "aggregation": {
            "metric": "INP",
            "statistic": statistic,
            "value_ms": value_ms,
        },
        "segmentation": {
            "scope": "origin",
            "description": "all production routes and supported form factors combined",
        },
        "collection_limitations": [
            "Only browsers and visits represented by the approved aggregate field source "
            "are included."
        ],
        "privacy_review": {
            "approval_id": "privacy-field-inp-1",
            "approval_reference": "privacy-review-2026-09-field-inp",
            "approved": True,
            "reviewer": "privacy-reviewer",
            "reviewed_at": "2026-09-14T12:00:00Z",
            "aggregate_only": True,
            "contains_user_identifiers": False,
            "lumina_behavioral_tracking_added": False,
            "notes": "The tracked artifact contains aggregate performance evidence only.",
        },
        "source_export": {
            "approval_id": "export-aggregate-1",
            "sha256": EXPORT_SHA256,
            "reference": "aggregate-export-2026-09-22",
        },
        "evidence_references": ["aggregate-export-2026-09-22"],
        "generic_pass_threshold": None,
        "claim_boundary": (
            "Scripted lab interaction latency is not field INP, and absence of approved telemetry "
            "is an evidence gap rather than a software failure."
        ),
    }


def _validate(
    evidence: dict[str, object],
    *,
    approvals: dict[str, object] | None = None,
    export_sha256: str = EXPORT_SHA256,
) -> dict[str, object]:
    return cast(
        dict[str, object],
        validate_field_inp_evidence(
            evidence,
            approvals_document=_approvals() if approvals is None else approvals,
            source_export_sha256=export_sha256,
            now=FIXED_NOW,
        ),
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("artifact_version", True),
        ("artifact_version", 1.0),
        ("protocol_id", "phase-8d-manual-protocol-impostor"),
        ("phase", "8C"),
    ],
)
def test_rejects_wrong_manual_protocol_identity(
    field: str,
    value: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    protocol = json.loads(_module.MANUAL_PROTOCOL.read_text(encoding="utf-8"))
    protocol[field] = value
    monkeypatch.setattr(_module, "_load_tracked_json", lambda *_args, **_kwargs: protocol)

    with pytest.raises(FieldInpEvidenceError, match="manual protocol identity is invalid"):
        _module._protocol_field_inp()


@pytest.mark.parametrize("version", [True, 1.0])
def test_rejects_non_integer_approval_manifest_version(version: object) -> None:
    approvals = _approvals()
    approvals["artifact_version"] = version
    with pytest.raises(FieldInpEvidenceError, match="approval manifest artifact_version must be 1"):
        _validate(_valid_evidence(), approvals=approvals)


@pytest.mark.parametrize(
    ("section", "field", "value", "message"),
    [
        ("approved_sources", "documentation_url", "http://example.com/metrics", "HTTPS URL"),
        ("approved_deployments", "build_commit", "deadbeef", "40-character Git SHA"),
        ("approved_privacy_reviews", "reviewer", "reviewer\u202ename", "printable string"),
    ],
)
def test_approval_manifest_rejects_malformed_trust_records_even_when_unused(
    section: str,
    field: str,
    value: object,
    message: str,
) -> None:
    approvals = _approvals()
    entries = cast(list[dict[str, object]], approvals[section])
    entries.append(dict(entries[0]))
    entries[-1]["approval_id"] = f"unused-{section}"
    entries[-1][field] = value

    with pytest.raises(FieldInpEvidenceError, match=message):
        _module._approval_manifest(approvals)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("reversed_window", "observation_end must be after observation_start"),
        ("wrong_metric", "aggregation_metric must be INP"),
        ("dangling_source", "source_approval_id must name an approved source"),
        ("dangling_deployment", "deployment_approval_id must name an approved deployment"),
        ("dangling_privacy", "privacy_approval_id must name an approved privacy review"),
    ],
)
def test_approval_manifest_rejects_impossible_or_dangling_export_approvals(
    mutation: str,
    message: str,
) -> None:
    approvals = _approvals()
    export = cast(list[dict[str, object]], approvals["approved_exports"])[0]
    if mutation == "reversed_window":
        export["observation_end"] = "2026-09-14T00:00:00Z"
    elif mutation == "wrong_metric":
        export["aggregation_metric"] = "LCP"
    elif mutation == "dangling_source":
        export["source_approval_id"] = "source-missing"
    elif mutation == "dangling_deployment":
        export["deployment_approval_id"] = "deployment-missing"
    else:
        export["privacy_approval_id"] = "privacy-missing"

    with pytest.raises(FieldInpEvidenceError, match=message):
        _module._approval_manifest(approvals)


@pytest.mark.parametrize(
    ("sample_count", "value_ms"),
    [(0, 180.0), (1200, None)],
)
def test_approval_manifest_rejects_incoherent_export_sample_and_value_pairs(
    sample_count: int,
    value_ms: float | None,
) -> None:
    approvals = _approvals()
    export = cast(list[dict[str, object]], approvals["approved_exports"])[0]
    export["sample_count"] = sample_count
    export["aggregation_value_ms"] = value_ms

    with pytest.raises(FieldInpEvidenceError, match="sample_count and aggregation_value_ms"):
        _module._approval_manifest(approvals)


@pytest.mark.parametrize("version", [True, 1.0])
def test_rejects_non_integer_field_evidence_version(version: object) -> None:
    evidence = _valid_evidence()
    evidence["artifact_version"] = version
    with pytest.raises(FieldInpEvidenceError, match="artifact_version must be 1"):
        _validate(evidence)


@pytest.mark.parametrize("status", ["observed_finding", "inconclusive", "unavailable"])
def test_accepts_non_pass_protocol_statuses_with_tracked_export_approval(status: str) -> None:
    evidence = _valid_evidence(status=status)
    assert _validate(evidence, approvals=_approvals(status=status)) == evidence


def test_observed_pass_fails_closed_until_threshold_policy_is_frozen() -> None:
    with pytest.raises(FieldInpEvidenceError, match="observed_pass is not locally admissible"):
        _validate(
            _valid_evidence(status="observed_pass"),
            approvals=_approvals(status="observed_pass"),
        )


def test_field_protocol_rejects_noncanonical_status_added_under_v1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    protocol_path = REPOSITORY_ROOT / "data/audits/phase-8d-manual-protocol-v1.json"
    protocol = cast(dict[str, object], json.loads(protocol_path.read_text(encoding="utf-8")))
    item = cast(
        dict[str, object],
        cast(dict[str, object], protocol["evidence_items"])["field-inp"],
    )
    cast(list[str], item["allowed_statuses"]).append("certified_pass")
    monkeypatch.setattr(_module, "_load_tracked_json", lambda *_args, **_kwargs: protocol)

    with pytest.raises(FieldInpEvidenceError, match="allowed_statuses must exactly match"):
        _validate(_valid_evidence(status="certified_pass"))


def test_field_protocol_rejects_generic_pass_threshold_under_v1(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    protocol_path = REPOSITORY_ROOT / "data/audits/phase-8d-manual-protocol-v1.json"
    protocol = cast(dict[str, object], json.loads(protocol_path.read_text(encoding="utf-8")))
    item = cast(
        dict[str, object],
        cast(dict[str, object], protocol["evidence_items"])["field-inp"],
    )
    item["generic_pass_threshold"] = 200
    monkeypatch.setattr(_module, "_load_tracked_json", lambda *_args, **_kwargs: protocol)

    with pytest.raises(FieldInpEvidenceError, match="generic_pass_threshold must remain null"):
        _validate(_valid_evidence())


def test_rejects_unknown_fields_so_raw_events_or_identifiers_cannot_hide_in_artifact() -> None:
    evidence = _valid_evidence()
    evidence["raw_events"] = [{"session_id": "forbidden"}]
    with pytest.raises(FieldInpEvidenceError, match="top-level keys mismatch"):
        _validate(evidence)


@pytest.mark.parametrize("control", ["\u007f", "\u009b", "\u202e", "\u200b"])
def test_rejects_non_printable_unicode_in_field_evidence_text(control: str) -> None:
    evidence = _valid_evidence()
    evidence["collection_limitations"] = [f"approved aggregate export{control}note"]
    with pytest.raises(FieldInpEvidenceError, match="non-empty printable string"):
        _validate(evidence)


def test_accepts_visible_international_unicode_in_field_evidence_text() -> None:
    evidence = _valid_evidence()
    evidence["collection_limitations"] = ["Données agrégées vérifiées — 測試完成"]

    assert _validate(evidence) == evidence


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("aggregate_only", False, "aggregate_only must be true"),
        ("contains_user_identifiers", True, "contains_user_identifiers must be false"),
        (
            "lumina_behavioral_tracking_added",
            True,
            "lumina_behavioral_tracking_added must be false",
        ),
    ],
)
def test_rejects_privacy_boundary_violations(field: str, value: object, message: str) -> None:
    evidence = _valid_evidence()
    cast(dict[str, object], evidence["privacy_review"])[field] = value
    with pytest.raises(FieldInpEvidenceError, match=message):
        _validate(evidence)


@pytest.mark.parametrize(
    ("section", "approval_id", "message"),
    [
        ("deployment", "deployment-unapproved", "deployment approval_id"),
        ("instrumentation_source", "source-unapproved", "instrumentation_source approval_id"),
        ("privacy_review", "privacy-unapproved", "privacy_review approval_id"),
        ("source_export", "export-unapproved", "source_export approval_id"),
    ],
)
def test_rejects_unapproved_trust_records(
    section: str,
    approval_id: str,
    message: str,
) -> None:
    evidence = _valid_evidence()
    cast(dict[str, object], evidence[section])["approval_id"] = approval_id
    with pytest.raises(FieldInpEvidenceError, match=message):
        _validate(evidence)


def test_rejects_self_attested_metadata_that_does_not_match_manifest() -> None:
    mutations = [
        ("deployment", "deployment_reference", "forged-deploy", "deployment.deployment_reference"),
        ("instrumentation_source", "name", "Forged source", "instrumentation_source.name"),
        ("privacy_review", "reviewer", "forged-reviewer", "privacy_review.reviewer"),
        ("source_export", "reference", "forged-export", "source_export.reference"),
    ]
    for section, field, value, message in mutations:
        evidence = _valid_evidence()
        cast(dict[str, object], evidence[section])[field] = value
        with pytest.raises(FieldInpEvidenceError, match=message):
            _validate(evidence)


def test_rejects_wrong_source_export_bytes() -> None:
    evidence = _valid_evidence()
    wrong_digest = hashlib.sha256(b"forged export\n").hexdigest()
    with pytest.raises(FieldInpEvidenceError, match="bytes do not match"):
        _validate(evidence, export_sha256=wrong_digest)


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("count", 1201, "source_export.sample_count"),
        ("statistic", "mean", "source_export.aggregation_statistic"),
        ("value_ms", 181.0, "source_export.aggregation_value_ms"),
    ],
)
def test_rejects_aggregate_values_not_frozen_in_export_approval(
    field: str,
    value: object,
    message: str,
) -> None:
    evidence = _valid_evidence()
    if field == "count":
        cast(dict[str, object], evidence["sample_population"])[field] = value
    else:
        cast(dict[str, object], evidence["aggregation"])[field] = value
    with pytest.raises(FieldInpEvidenceError, match=message):
        _validate(evidence)


def test_accepts_source_declared_non_percentile_aggregation_when_export_approves_it() -> None:
    statistic = "documented arithmetic mean over eligible interactions"
    evidence = _valid_evidence(statistic=statistic)
    assert (
        _validate(
            evidence,
            approvals=_approvals(statistic=statistic),
        )
        == evidence
    )


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("http_origin", "HTTPS URL"),
        ("bad_commit", "40-character Git SHA"),
        ("window_order", "window end must be after start"),
        ("zero_observed_samples", "positive sample count"),
        ("future_window", "window end must not be in the future"),
        ("future_observed_at", "observed_at must not be in the future"),
        ("future_privacy_review", "reviewed_at must not be in the future"),
    ],
)
def test_rejects_invalid_provenance_population_and_time(
    mutation: str,
    message: str,
) -> None:
    evidence = _valid_evidence()
    if mutation == "http_origin":
        cast(dict[str, object], evidence["deployment"])["origin"] = "http://lumina.example/"
    elif mutation == "bad_commit":
        cast(dict[str, object], evidence["deployment"])["build_commit"] = "deadbeef"
    elif mutation == "window_order":
        cast(dict[str, object], evidence["observation_window"])["end"] = "2026-09-14T00:00:00Z"
    elif mutation == "zero_observed_samples":
        cast(dict[str, object], evidence["sample_population"])["count"] = 0
    elif mutation == "future_window":
        cast(dict[str, object], evidence["observation_window"])["end"] = "2026-09-22T16:30:01Z"
    elif mutation == "future_observed_at":
        evidence["observed_at"] = "2026-09-22T16:30:01Z"
    else:
        cast(dict[str, object], evidence["privacy_review"])["reviewed_at"] = "2026-09-22T16:30:01Z"

    with pytest.raises(FieldInpEvidenceError, match=message):
        _validate(evidence)


def test_tracked_manifest_is_empty_so_no_field_evidence_is_currently_admissible() -> None:
    with pytest.raises(FieldInpEvidenceError, match="deployment approval_id"):
        validate_field_inp_evidence(
            _valid_evidence(),
            source_export_sha256=EXPORT_SHA256,
            now=FIXED_NOW,
        )


def test_atomic_output_rejects_wrong_path_and_parent_symlink(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    audits = repository / "data" / "audits"
    audits.mkdir(parents=True)
    tracked = audits / "phase-8d-field-inp-v1.json"

    with pytest.raises(FieldInpEvidenceError, match="may only write"):
        _module._write_tracked_output(
            _valid_evidence(),
            tmp_path / "other.json",
            repository_root=repository,
            tracked_output=tracked,
        )

    outside = tmp_path / "outside"
    (outside / "audits").mkdir(parents=True)
    symlink_repository = tmp_path / "symlink-repo"
    symlink_repository.mkdir()
    (symlink_repository / "data").symlink_to(outside, target_is_directory=True)
    symlink_target = symlink_repository / "data" / "audits" / "phase-8d-field-inp-v1.json"
    with pytest.raises(FieldInpEvidenceError, match="real directories without symlinks"):
        _module._write_tracked_output(
            _valid_evidence(),
            symlink_target,
            repository_root=symlink_repository,
            tracked_output=symlink_target,
        )


def test_atomic_output_writes_canonical_json_inside_owned_directory(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    audits = repository / "data" / "audits"
    audits.mkdir(parents=True)
    tracked = audits / "phase-8d-field-inp-v1.json"
    evidence = _valid_evidence()

    _module._write_tracked_output(
        evidence,
        tracked,
        repository_root=repository,
        tracked_output=tracked,
    )

    assert json.loads(tracked.read_text(encoding="utf-8")) == evidence
    assert tracked.read_text(encoding="utf-8").endswith("\n")
    assert not list(audits.glob("*.tmp"))


def test_atomic_output_cleans_temp_and_preserves_target_when_replace_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = tmp_path / "repo"
    audits = repository / "data" / "audits"
    audits.mkdir(parents=True)
    tracked = audits / "phase-8d-field-inp-v1.json"
    tracked.write_text("old-evidence\n", encoding="utf-8")

    def fail_replace(*_args: object, **_kwargs: object) -> None:
        raise OSError("simulated replace failure")

    monkeypatch.setattr(_module.os, "replace", fail_replace)
    with pytest.raises(FieldInpEvidenceError, match="could not replace tracked field-INP evidence"):
        _module._write_tracked_output(
            _valid_evidence(),
            tracked,
            repository_root=repository,
            tracked_output=tracked,
        )

    assert tracked.read_text(encoding="utf-8") == "old-evidence\n"
    assert not list(audits.glob("*.tmp"))


def test_atomic_output_reports_unknown_durability_after_successful_replace_fsync_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = tmp_path / "repo"
    audits = repository / "data" / "audits"
    audits.mkdir(parents=True)
    tracked = audits / "phase-8d-field-inp-v1.json"
    tracked.write_text("old-evidence\n", encoding="utf-8")
    evidence = _valid_evidence()
    real_fsync = _module.os.fsync
    calls = 0

    def fail_parent_fsync(fd: int) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated parent fsync failure")
        real_fsync(fd)

    monkeypatch.setattr(_module.os, "fsync", fail_parent_fsync)
    with pytest.raises(FieldInpEvidenceError, match="durability is unknown after replace"):
        _module._write_tracked_output(
            evidence,
            tracked,
            repository_root=repository,
            tracked_output=tracked,
        )

    assert calls == 2
    assert json.loads(tracked.read_text(encoding="utf-8")) == evidence
    assert not list(audits.glob("*.tmp"))


def test_atomic_output_does_not_delete_preexisting_temp_collision(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = tmp_path / "repo"
    audits = repository / "data" / "audits"
    audits.mkdir(parents=True)
    tracked = audits / "phase-8d-field-inp-v1.json"
    monkeypatch.setattr(_module.secrets, "token_hex", lambda _: "collision")
    colliding_temp = audits / ".phase-8d-field-inp-v1.json.collision.tmp"
    colliding_temp.write_text("do-not-delete\n", encoding="utf-8")

    with pytest.raises(FileExistsError):
        _module._write_tracked_output(
            _valid_evidence(),
            tracked,
            repository_root=repository,
            tracked_output=tracked,
        )

    assert colliding_temp.read_text(encoding="utf-8") == "do-not-delete\n"
    assert not tracked.exists()


def test_atomic_output_does_not_delete_temp_name_recreated_after_replace(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repository = tmp_path / "repo"
    audits = repository / "data" / "audits"
    audits.mkdir(parents=True)
    tracked = audits / "phase-8d-field-inp-v1.json"
    monkeypatch.setattr(_module.secrets, "token_hex", lambda _: "postreplace")
    temporary_name = ".phase-8d-field-inp-v1.json.postreplace.tmp"
    real_replace = _module.os.replace

    def replace_then_recreate(
        src: str,
        dst: str,
        *,
        src_dir_fd: int,
        dst_dir_fd: int,
    ) -> None:
        real_replace(src, dst, src_dir_fd=src_dir_fd, dst_dir_fd=dst_dir_fd)
        recreated_fd = os.open(
            src,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
            dir_fd=src_dir_fd,
        )
        try:
            os.write(recreated_fd, b"other-process\n")
        finally:
            os.close(recreated_fd)

    monkeypatch.setattr(_module.os, "replace", replace_then_recreate)
    _module._write_tracked_output(
        _valid_evidence(),
        tracked,
        repository_root=repository,
        tracked_output=tracked,
    )

    assert json.loads(tracked.read_text(encoding="utf-8")) == _valid_evidence()
    assert (audits / temporary_name).read_text(encoding="utf-8") == "other-process\n"


def test_pinned_output_parent_fd_survives_ancestor_path_replacement(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    original_audits = repository / "data" / "audits"
    original_audits.mkdir(parents=True)
    tracked = original_audits / "phase-8d-field-inp-v1.json"

    parent_fd, target_name = _module._open_output_parent_no_follow(
        tracked,
        repository_root=repository,
        tracked_output=tracked,
    )
    try:
        original_data = repository / "data"
        moved_data = repository / "data-original"
        original_data.rename(moved_data)

        outside = tmp_path / "outside"
        outside_audits = outside / "audits"
        outside_audits.mkdir(parents=True)
        original_data.symlink_to(outside, target_is_directory=True)

        probe_fd = os.open(
            "pinned-parent-proof",
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
            dir_fd=parent_fd,
        )
        try:
            os.write(probe_fd, target_name.encode())
        finally:
            os.close(probe_fd)

        assert (moved_data / "audits" / "pinned-parent-proof").read_text() == target_name
        assert not (outside_audits / "pinned-parent-proof").exists()
    finally:
        os.close(parent_fd)


def test_tracked_trust_root_reader_rejects_symlinked_parent(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    repository.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "manifest.json").write_text('{"ok": true}', encoding="utf-8")
    (repository / "data").symlink_to(outside, target_is_directory=True)

    with pytest.raises(FieldInpEvidenceError, match="without symlinks"):
        _module._read_tracked_file_no_follow(
            repository / "data" / "manifest.json",
            "test manifest",
            repository_root=repository,
        )


def test_trusted_reader_rejects_fifo_without_blocking(tmp_path: Path) -> None:
    repository = tmp_path / "repo"
    data = repository / "data"
    data.mkdir(parents=True)
    fifo = data / "manifest.json"
    os.mkfifo(fifo)

    with pytest.raises(FieldInpEvidenceError, match="must be a regular file"):
        _module._read_tracked_file_no_follow(
            fifo,
            "test manifest",
            repository_root=repository,
        )


def test_source_export_hash_uses_exact_regular_file_bytes(tmp_path: Path) -> None:
    export = tmp_path / "export.bin"
    export.write_bytes(EXPORT_BYTES)
    assert _module._sha256_file(export) == EXPORT_SHA256

    symlink = tmp_path / "export-link"
    symlink.symlink_to(export)
    with pytest.raises(FieldInpEvidenceError, match="could not open source export safely"):
        _module._sha256_file(symlink)

    fifo = tmp_path / "export-fifo"
    os.mkfifo(fifo)
    with pytest.raises(FieldInpEvidenceError, match="must be a regular file"):
        _module._sha256_file(fifo)


def test_json_loader_rejects_non_finite_duplicate_and_oversized_numbers(tmp_path: Path) -> None:
    evidence_path = tmp_path / "field-inp.json"
    evidence_path.write_text('{"value": NaN}', encoding="utf-8")
    with pytest.raises(FieldInpEvidenceError, match="non-finite JSON number"):
        _module._load_json(evidence_path)

    evidence_path.write_text('{"value": 1, "value": 2}', encoding="utf-8")
    with pytest.raises(FieldInpEvidenceError, match="duplicate JSON key"):
        _module._load_json(evidence_path)

    evidence_path.write_text('{"value": ' + ("9" * 10000) + "}", encoding="utf-8")
    with pytest.raises(FieldInpEvidenceError, match="could not parse"):
        _module._load_json(evidence_path)

    with pytest.raises(FieldInpEvidenceError, match="finite numeric value"):
        _module._number(10**10000, "value")


def test_json_loader_rejects_symlink_and_oversized_evidence_file(tmp_path: Path) -> None:
    target = tmp_path / "target.json"
    target.write_text('{"value": 1}', encoding="utf-8")
    symlink = tmp_path / "field-inp-link.json"
    symlink.symlink_to(target)
    with pytest.raises(FieldInpEvidenceError, match="could not open JSON evidence safely"):
        _module._load_json(symlink)

    oversized = tmp_path / "oversized.json"
    oversized.write_text(
        '{"padding":"' + ("x" * (1024 * 1024)) + '"}',
        encoding="utf-8",
    )
    with pytest.raises(FieldInpEvidenceError, match="exceeds the 1 MiB input bound"):
        _module._load_json(oversized)

    fifo = tmp_path / "field-inp-fifo.json"
    os.mkfifo(fifo)
    with pytest.raises(FieldInpEvidenceError, match="JSON evidence must be a regular file"):
        _module._load_json(fifo)

    invalid_utf8 = tmp_path / "invalid-utf8.json"
    invalid_utf8.write_bytes(b'{"value":"\xff"}')
    with pytest.raises(FieldInpEvidenceError, match="decode JSON evidence as UTF-8"):
        _module._load_json(invalid_utf8)
