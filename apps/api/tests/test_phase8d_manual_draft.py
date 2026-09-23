"""Contract tests for non-evidence Phase 8D manual-review drafts."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path
from types import ModuleType
from typing import cast

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
PREPARE_SCRIPT = REPOSITORY_ROOT / "scripts/ci/prepare_phase8d_manual_evidence.py"
VALIDATE_SCRIPT = REPOSITORY_ROOT / "scripts/ci/validate_phase8d_manual_evidence.py"
COMMIT = "e69b0501868b1dba402d144ae7babe9f22658e9a"


def _load_module(name: str, path: Path) -> ModuleType:
    specification = importlib.util.spec_from_file_location(name, path)
    assert specification is not None
    assert specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    sys.modules[name] = module
    specification.loader.exec_module(module)
    return module


_prepare = _load_module("lumina_phase8d_manual_draft", PREPARE_SCRIPT)
_validate = _load_module("lumina_phase8d_manual_validator_for_draft", VALIDATE_SCRIPT)
ManualDraftError = cast(type[ValueError], _prepare.ManualDraftError)
ManualEvidenceError = cast(type[ValueError], _validate.ManualEvidenceError)


@pytest.mark.parametrize(
    "item_id",
    [
        "wcag-2.2-aa-manual-review",
        "screen-reader",
        "browser-zoom-200",
        "representative-low-end-device",
    ],
)
def test_draft_expands_every_required_flow_check_pair_without_claiming_evidence(
    item_id: str,
) -> None:
    draft = cast(dict[str, object], _prepare.build_manual_draft(item_id, build_commit_hint=COMMIT))
    evidence = cast(dict[str, object], draft["evidence_template"])
    flows = cast(list[str], evidence["route_or_flow"])
    observations = cast(list[dict[str, object]], evidence["observations"])

    assert draft["template_only"] is True
    assert draft["protocol_artifact_version"] == 1
    assert draft["protocol_id"] == "phase-8d-manual-protocol-v1"
    assert evidence["template_only"] is True
    assert evidence["target_evidence_id"] == f"phase-8d-{item_id}-manual-v1"
    assert evidence["status"] is None
    assert evidence["observed_at"] is None
    assert evidence["operator_or_reviewer"] is None
    assert evidence["build_commit_hint"] == COMMIT
    assert "evidence_id" not in evidence
    assert "build_commit" not in evidence
    assert all(observation["status"] is None for observation in observations)
    assert all(observation["notes"] == "" for observation in observations)

    protocol = _prepare._load_protocol()
    item = cast(dict[str, object], cast(dict[str, object], protocol["evidence_items"])[item_id])
    checks = cast(list[str], item["checks"])
    expected_flows = cast(list[str], item["journeys"]) + cast(
        list[str], item.get("additional_routes", [])
    )
    assert flows == expected_flows
    assert len(observations) == len(expected_flows) * len(checks)
    assert {(row["route_or_flow"], row["check"]) for row in observations} == {
        (flow, check) for flow in expected_flows for check in checks
    }


def test_wcag_draft_preassigns_specialized_environment_slots() -> None:
    draft = cast(
        dict[str, object],
        _prepare.build_manual_draft("wcag-2.2-aa-manual-review"),
    )
    evidence = cast(dict[str, object], draft["evidence_template"])
    observations = cast(list[dict[str, object]], evidence["observations"])
    by_check: dict[str, set[str]] = {}
    for observation in observations:
        by_check.setdefault(cast(str, observation["check"]), set()).add(
            cast(str, observation["environment_id"])
        )
    assert by_check["screen-reader landmarks"] == {"screen-reader"}
    assert by_check["real browser 200% zoom"] == {"browser-zoom-200"}
    assert by_check["reduced motion"] == {"reduced-motion"}
    assert by_check["canvas alternative"] == {"webgl-disabled"}
    assert by_check["touch-only interaction"] == {"touch-device"}


def test_low_end_draft_includes_all_additional_routes() -> None:
    draft = cast(
        dict[str, object],
        _prepare.build_manual_draft("representative-low-end-device"),
    )
    evidence = cast(dict[str, object], draft["evidence_template"])
    flows = cast(list[str], evidence["route_or_flow"])
    assert "/" in flows
    assert "/objects/k2-18" in flows
    assert "/lab" in flows


def test_draft_and_embedded_evidence_are_rejected_as_real_evidence() -> None:
    draft = cast(dict[str, object], _prepare.build_manual_draft("browser-zoom-200"))
    with pytest.raises(ManualEvidenceError, match="top-level keys mismatch"):
        _validate.validate_manual_evidence(draft)

    evidence = cast(dict[str, object], draft["evidence_template"])
    with pytest.raises(ManualEvidenceError, match="top-level keys mismatch"):
        _validate.validate_manual_evidence(evidence)


def test_refuses_to_write_drafts_under_tracked_audit_directory(tmp_path: Path) -> None:
    draft = cast(dict[str, object], _prepare.build_manual_draft("screen-reader"))
    with pytest.raises(ManualDraftError, match="must not be written under data/audits"):
        _prepare._write_draft(draft, REPOSITORY_ROOT / "data/audits/draft.json")

    output = tmp_path / "screen-reader-draft.json"
    _prepare._write_draft(draft, output)
    assert output.is_file()
    assert '"template_only": true' in output.read_text(encoding="utf-8")

    symlink_parent = tmp_path / "audit-link"
    symlink_parent.symlink_to(REPOSITORY_ROOT / "data/audits", target_is_directory=True)
    with pytest.raises(ManualDraftError, match="real directories without symlinks"):
        _prepare._write_draft(draft, symlink_parent / "draft.json")


def test_draft_writer_refuses_existing_file_and_hard_link(tmp_path: Path) -> None:
    draft = cast(dict[str, object], _prepare.build_manual_draft("screen-reader"))
    audits = tmp_path / "audits"
    output_dir = tmp_path / "output"
    audits.mkdir()
    output_dir.mkdir()

    existing = output_dir / "existing.json"
    existing.write_text("keep-existing\n", encoding="utf-8")
    with pytest.raises(ManualDraftError, match="output already exists"):
        _prepare._write_draft(draft, existing, audit_directory=audits)
    assert existing.read_text(encoding="utf-8") == "keep-existing\n"

    tracked = audits / "tracked.json"
    tracked.write_text("keep-tracked\n", encoding="utf-8")
    hard_link = output_dir / "hard-link.json"
    os.link(tracked, hard_link)
    with pytest.raises(ManualDraftError, match="output already exists"):
        _prepare._write_draft(draft, hard_link, audit_directory=audits)
    assert tracked.read_text(encoding="utf-8") == "keep-tracked\n"
    assert hard_link.read_text(encoding="utf-8") == "keep-tracked\n"


def test_draft_writer_removes_new_file_if_parent_fsync_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    draft = cast(dict[str, object], _prepare.build_manual_draft("screen-reader"))
    audits = tmp_path / "audits"
    output_dir = tmp_path / "output"
    audits.mkdir()
    output_dir.mkdir()
    output = output_dir / "draft.json"
    real_fsync = _prepare.os.fsync
    calls = 0

    def fail_parent_fsync(fd: int) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated parent fsync failure")
        real_fsync(fd)

    monkeypatch.setattr(_prepare.os, "fsync", fail_parent_fsync)
    with pytest.raises(ManualDraftError, match="could not write manual-review draft safely"):
        _prepare._write_draft(draft, output, audit_directory=audits)

    assert calls == 2
    assert not output.exists()


def test_pinned_draft_parent_fd_survives_symlink_replacement_race(tmp_path: Path) -> None:
    audits = tmp_path / "audits"
    output_dir = tmp_path / "output"
    audits.mkdir()
    output_dir.mkdir()
    target = output_dir / "draft.json"

    parent_fd, target_name = _prepare._open_output_parent_no_follow(
        target,
        audit_directory=audits,
    )
    try:
        original_output = tmp_path / "output-original"
        output_dir.rename(original_output)
        output_dir.symlink_to(audits, target_is_directory=True)

        probe_fd = os.open(
            target_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
            dir_fd=parent_fd,
        )
        try:
            os.write(probe_fd, b"pinned-parent\n")
        finally:
            os.close(probe_fd)

        assert (original_output / "draft.json").read_text(encoding="utf-8") == "pinned-parent\n"
        assert not (audits / "draft.json").exists()
    finally:
        os.close(parent_fd)


def test_rejects_bad_build_commit_hint_and_wrong_protocol_identity() -> None:
    with pytest.raises(ManualDraftError, match="40-character Git SHA"):
        _prepare.build_manual_draft("screen-reader", build_commit_hint="deadbeef")

    protocol = _prepare._load_protocol()
    impostor = dict(protocol)
    impostor["protocol_id"] = "phase-8d-manual-protocol-impostor"
    with pytest.raises(ManualDraftError, match="manual protocol identity is invalid"):
        _prepare.build_manual_draft("screen-reader", protocol=impostor)


@pytest.mark.parametrize("version", [True, 1.0])
def test_rejects_non_integer_protocol_version(version: object) -> None:
    protocol = dict(_prepare._load_protocol())
    protocol["artifact_version"] = version
    with pytest.raises(ManualDraftError, match="manual protocol identity is invalid"):
        _prepare.build_manual_draft("screen-reader", protocol=protocol)


@pytest.mark.parametrize("invalid_check", ["   ", "bad\ncheck"])
def test_rejects_non_printable_or_blank_protocol_strings(invalid_check: str) -> None:
    protocol = json.loads(json.dumps(_prepare._load_protocol()))
    item = cast(
        dict[str, object],
        cast(dict[str, object], protocol["evidence_items"])["screen-reader"],
    )
    checks = cast(list[str], item["checks"])
    checks[0] = invalid_check

    with pytest.raises(ManualDraftError, match="list of non-empty printable strings"):
        _prepare.build_manual_draft("screen-reader", protocol=protocol)


def test_protocol_reader_rejects_duplicate_keys_and_symlinked_file(tmp_path: Path) -> None:
    with pytest.raises(ManualDraftError, match="duplicate JSON key"):
        _prepare._parse_json_text(
            '{"artifact_version": 1, "artifact_version": 1}',
            "manual protocol",
        )

    fake_repo = tmp_path / "repo"
    protocol_dir = fake_repo / "data" / "audits"
    protocol_dir.mkdir(parents=True)
    outside = tmp_path / "outside-protocol.json"
    outside.write_text(json.dumps(_prepare._load_protocol()), encoding="utf-8")
    symlinked = protocol_dir / "phase-8d-manual-protocol-v1.json"
    symlinked.symlink_to(outside)
    with pytest.raises(ManualDraftError, match="without symlinks"):
        _prepare._load_protocol(symlinked, repository_root=fake_repo)
