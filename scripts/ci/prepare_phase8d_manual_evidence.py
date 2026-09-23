"""Generate a non-evidence draft checklist for Phase 8D manual review."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
from pathlib import Path
from typing import cast

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MANUAL_PROTOCOL = REPOSITORY_ROOT / "data/audits/phase-8d-manual-protocol-v1.json"
AUDIT_DIRECTORY = REPOSITORY_ROOT / "data/audits"
SUPPORTED_ITEMS = {
    "wcag-2.2-aa-manual-review",
    "screen-reader",
    "browser-zoom-200",
    "representative-low-end-device",
}
_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")


class ManualDraftError(ValueError):
    """Raised when a Phase 8D manual-review draft cannot be prepared safely."""


def _parse_json_text(text: str, label: str) -> dict[str, object]:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ManualDraftError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise ManualDraftError(f"non-finite JSON number is not allowed: {value}")

    try:
        document = json.loads(
            text,
            object_pairs_hook=reject_duplicates,
            parse_constant=reject_constant,
        )
    except ManualDraftError:
        raise
    except (json.JSONDecodeError, ValueError) as exc:
        raise ManualDraftError(f"could not parse {label}: {exc}") from exc
    if not isinstance(document, dict):
        raise ManualDraftError(f"{label} root must be an object")
    return cast(dict[str, object], document)


def _read_tracked_file_no_follow(
    path: Path,
    label: str,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> str:
    try:
        relative = path.relative_to(repository_root)
    except ValueError as exc:
        raise ManualDraftError(f"{label} must remain inside the repository") from exc

    directory_flags = os.O_RDONLY | os.O_DIRECTORY
    file_flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
        file_flags |= os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        directory_flags |= os.O_NONBLOCK
        file_flags |= os.O_NONBLOCK

    root_fd = os.open(repository_root, directory_flags)
    current_fd = root_fd
    directory_fds = [root_fd]
    file_fd: int | None = None
    try:
        for part in relative.parts[:-1]:
            next_fd = os.open(part, directory_flags, dir_fd=current_fd)
            directory_fds.append(next_fd)
            current_fd = next_fd
        file_fd = os.open(relative.name, file_flags, dir_fd=current_fd)
        metadata = os.fstat(file_fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise ManualDraftError(f"{label} must be a regular file")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(file_fd, 64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > 1024 * 1024:
                raise ManualDraftError(f"{label} exceeds the 1 MiB trust-root bound")
            chunks.append(chunk)
        try:
            return b"".join(chunks).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ManualDraftError(f"{label} must be UTF-8 JSON") from exc
    except OSError as exc:
        raise ManualDraftError(f"could not read tracked {label} without symlinks: {exc}") from exc
    finally:
        if file_fd is not None:
            os.close(file_fd)
        for descriptor in reversed(directory_fds):
            os.close(descriptor)


def _validate_protocol_identity(protocol: dict[str, object]) -> dict[str, object]:
    version = protocol.get("artifact_version")
    if (
        type(version) is not int
        or version != 1
        or protocol.get("protocol_id") != "phase-8d-manual-protocol-v1"
        or protocol.get("phase") != "8D"
    ):
        raise ManualDraftError("manual protocol identity is invalid")
    return protocol


def _load_protocol(
    path: Path = MANUAL_PROTOCOL,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> dict[str, object]:
    text = _read_tracked_file_no_follow(
        path,
        "manual protocol",
        repository_root=repository_root,
    )
    return _validate_protocol_identity(_parse_json_text(text, "manual protocol"))


def _string_list(value: object, label: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        raise ManualDraftError(f"{label} must be a list of non-empty strings")
    return cast(list[str], value)


def _environment(environment_id: str) -> dict[str, object]:
    return {
        "environment_id": environment_id,
        "browser": None,
        "browser_version": None,
        "os": None,
        "os_version": None,
        "device": None,
        "viewport_width_css_px": None,
        "viewport_height_css_px": None,
        "dpr": None,
        "screen_reader": None,
        "screen_reader_version": None,
        "browser_zoom_percent": None,
        "browser_zoom_confirmed": None,
        "network_condition": None,
        "actual_device_confirmed": None,
        "synthetic_cpu": None,
        "synthetic_network": None,
        "touch_input_confirmed": None,
    }


def _environment_plan(item_id: str) -> tuple[list[dict[str, object]], dict[str, str]]:
    if item_id == "wcag-2.2-aa-manual-review":
        environments = [
            _environment("general"),
            _environment("screen-reader"),
            _environment("browser-zoom-200"),
            _environment("touch-device"),
        ]
        check_mapping = {
            "screen-reader landmarks": "screen-reader",
            "real browser 200% zoom": "browser-zoom-200",
            "touch-only interaction": "touch-device",
        }
        return environments, check_mapping
    if item_id == "screen-reader":
        return [_environment("screen-reader")], {"*": "screen-reader"}
    if item_id == "browser-zoom-200":
        return [_environment("browser-zoom-200")], {"*": "browser-zoom-200"}
    if item_id == "representative-low-end-device":
        return [_environment("low-end-device")], {"*": "low-end-device"}
    raise ManualDraftError(f"unsupported manual evidence item: {item_id}")


def _journey_index(protocol: dict[str, object]) -> dict[str, dict[str, object]]:
    raw_journeys = protocol.get("manual_journeys")
    if not isinstance(raw_journeys, list):
        raise ManualDraftError("manual protocol manual_journeys must be a list")
    result: dict[str, dict[str, object]] = {}
    for index, raw_journey in enumerate(raw_journeys):
        if not isinstance(raw_journey, dict):
            raise ManualDraftError(f"manual_journeys[{index}] must be an object")
        journey = cast(dict[str, object], raw_journey)
        journey_id = journey.get("id")
        if not isinstance(journey_id, str) or not journey_id:
            raise ManualDraftError(f"manual_journeys[{index}].id must be a non-empty string")
        if journey_id in result:
            raise ManualDraftError(f"duplicate manual journey id: {journey_id}")
        result[journey_id] = journey
    return result


def build_manual_draft(
    item_id: str,
    *,
    build_commit_hint: str | None = None,
    protocol: dict[str, object] | None = None,
) -> dict[str, object]:
    """Build a deterministic non-evidence checklist for one Phase 8D manual item."""

    if item_id not in SUPPORTED_ITEMS:
        raise ManualDraftError(f"unsupported manual evidence item: {item_id}")
    if build_commit_hint is not None and _COMMIT_PATTERN.fullmatch(build_commit_hint) is None:
        raise ManualDraftError("build_commit_hint must be a lowercase 40-character Git SHA")

    protocol_document = (
        _load_protocol() if protocol is None else _validate_protocol_identity(protocol)
    )

    raw_items = protocol_document.get("evidence_items")
    if not isinstance(raw_items, dict):
        raise ManualDraftError("manual protocol evidence_items must be an object")
    raw_item = cast(dict[str, object], raw_items).get(item_id)
    if not isinstance(raw_item, dict):
        raise ManualDraftError(f"manual protocol is missing evidence item {item_id}")
    item = cast(dict[str, object], raw_item)
    journeys = _string_list(item.get("journeys"), f"{item_id}.journeys")
    checks = _string_list(item.get("checks"), f"{item_id}.checks")
    additional_routes = _string_list(
        item.get("additional_routes", []),
        f"{item_id}.additional_routes",
    )
    allowed_statuses = _string_list(item.get("allowed_statuses"), f"{item_id}.allowed_statuses")
    claim_boundary = item.get("claim_boundary")
    if not isinstance(claim_boundary, str) or not claim_boundary:
        raise ManualDraftError(f"{item_id}.claim_boundary must be a non-empty string")

    journey_by_id = _journey_index(protocol_document)
    checklist: list[dict[str, object]] = []
    for journey_id in journeys:
        journey = journey_by_id.get(journey_id)
        if journey is None:
            raise ManualDraftError(f"manual protocol is missing journey {journey_id}")
        checklist.append(
            {
                "flow_id": journey_id,
                "routes": _string_list(journey.get("routes"), f"{journey_id}.routes"),
                "actions": _string_list(journey.get("actions"), f"{journey_id}.actions"),
                "risk_coverage": _string_list(
                    journey.get("risk_coverage"),
                    f"{journey_id}.risk_coverage",
                ),
            }
        )
    for route in additional_routes:
        checklist.append(
            {
                "flow_id": route,
                "routes": [route],
                "actions": [
                    "Exercise this additional route on the recorded representative device."
                ],
                "risk_coverage": ["representative low-end device observation"],
            }
        )

    environments, check_environment_map = _environment_plan(item_id)
    flows = journeys + additional_routes
    observations: list[dict[str, object]] = []
    for flow in flows:
        for check in checks:
            environment_id = check_environment_map.get(
                check, check_environment_map.get("*", "general")
            )
            observations.append(
                {
                    "route_or_flow": flow,
                    "check": check,
                    "environment_id": environment_id,
                    "status": None,
                    "notes": "",
                    "evidence_references": [],
                }
            )

    result_semantics = protocol_document.get("result_semantics")
    if not isinstance(result_semantics, dict):
        raise ManualDraftError("manual protocol result_semantics must be an object")

    return {
        "draft_version": 1,
        "draft_id": "phase-8d-manual-evidence-draft-v1",
        "template_only": True,
        "phase": "8D",
        "protocol_artifact_version": 1,
        "protocol_id": "phase-8d-manual-protocol-v1",
        "item_id": item_id,
        "purpose": (
            "Operator worksheet only. This draft is not Phase 8D evidence, does not close "
            "the gate, "
            "and must not be placed under data/audits/."
        ),
        "allowed_statuses": allowed_statuses,
        "result_semantics": result_semantics,
        "claim_boundary": claim_boundary,
        "environment_templates": environments,
        "procedure_checklist": checklist,
        "evidence_template": {
            "template_only": True,
            "target_evidence_id": f"phase-8d-{item_id}-manual-v1",
            "build_commit_hint": build_commit_hint,
            "artifact_version": 1,
            "phase": "8D",
            "item_id": item_id,
            "status": None,
            "observed_at": None,
            "operator_or_reviewer": None,
            "browser_os_device": environments,
            "manual_attestation": {
                "performed_manually": None,
                "operator_confirmed_environment": None,
                "automation_only": None,
                "notes": "",
            },
            "procedure": [],
            "route_or_flow": flows,
            "observations": observations,
            "evidence_references": [],
            "findings": [],
            "claim_boundary": claim_boundary,
        },
    }


def _open_output_parent_no_follow(
    output: Path,
    *,
    audit_directory: Path = AUDIT_DIRECTORY,
) -> tuple[int, str]:
    requested = output if output.is_absolute() else Path.cwd() / output
    requested_absolute = Path(os.path.abspath(requested))
    audits_absolute = Path(os.path.abspath(audit_directory))
    if requested_absolute.is_relative_to(audits_absolute):
        raise ManualDraftError("manual-review drafts must not be written under data/audits/")

    directory_flags = os.O_RDONLY | os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        directory_flags |= os.O_NONBLOCK

    anchor = requested_absolute.anchor or "/"
    current_fd = os.open(anchor, directory_flags)
    try:
        parent_parts = requested_absolute.parent.parts
        start_index = 1 if parent_parts and parent_parts[0] == anchor else 0
        for part in parent_parts[start_index:]:
            try:
                next_fd = os.open(part, directory_flags, dir_fd=current_fd)
            except OSError as exc:
                raise ManualDraftError(
                    "manual-review draft output parents must already exist as real directories "
                    "without symlinks"
                ) from exc
            os.close(current_fd)
            current_fd = next_fd

        try:
            pinned_parent = Path(os.readlink(f"/proc/self/fd/{current_fd}"))
        except OSError as exc:
            raise ManualDraftError("could not resolve pinned draft-output parent") from exc
        resolved_audits = audits_absolute.resolve(strict=False)
        pinned_target = pinned_parent / requested_absolute.name
        if pinned_target.is_relative_to(resolved_audits):
            raise ManualDraftError("manual-review drafts must not be written under data/audits/")
        return current_fd, requested_absolute.name
    except Exception:
        os.close(current_fd)
        raise


def _write_draft(
    document: dict[str, object],
    output: Path,
    *,
    audit_directory: Path = AUDIT_DIRECTORY,
) -> None:
    parent_fd, target_name = _open_output_parent_no_follow(
        output,
        audit_directory=audit_directory,
    )
    target_fd: int | None = None
    target_identity: tuple[int, int] | None = None
    completed = False
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            target_fd = os.open(target_name, flags, 0o600, dir_fd=parent_fd)
        except FileExistsError as exc:
            raise ManualDraftError("manual-review draft output already exists") from exc
        metadata = os.fstat(target_fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise ManualDraftError("manual-review draft output must be a regular file")
        target_identity = (metadata.st_dev, metadata.st_ino)
        payload = (json.dumps(document, indent=2, ensure_ascii=False) + "\n").encode()
        view = memoryview(payload)
        while view:
            written = os.write(target_fd, view)
            if written <= 0:
                raise ManualDraftError("could not write manual-review draft")
            view = view[written:]
        os.fsync(target_fd)
        os.fsync(parent_fd)
        completed = True
    except OSError as exc:
        raise ManualDraftError(f"could not write manual-review draft safely: {exc}") from exc
    finally:
        if target_fd is not None:
            os.close(target_fd)
        if not completed and target_identity is not None:
            target_stat: os.stat_result | None
            try:
                target_stat = os.stat(target_name, dir_fd=parent_fd, follow_symlinks=False)
            except FileNotFoundError:
                target_stat = None
            if (
                target_stat is not None
                and (
                    target_stat.st_dev,
                    target_stat.st_ino,
                )
                == target_identity
            ):
                os.unlink(target_name, dir_fd=parent_fd)
        os.close(parent_fd)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Prepare a non-evidence Phase 8D manual-review worksheet. Generated drafts contain "
            "null placeholders, are rejected by the real evidence validator, and may not be "
            "written under data/audits/."
        )
    )
    parser.add_argument("--item", required=True, choices=sorted(SUPPORTED_ITEMS))
    parser.add_argument("--build-commit", dest="build_commit_hint")
    parser.add_argument("--output", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    draft = build_manual_draft(args.item, build_commit_hint=args.build_commit_hint)
    if args.output is None:
        print(json.dumps(draft, indent=2, ensure_ascii=False))
    else:
        _write_draft(draft, args.output)
        print(f"Phase 8D manual-review draft written: {args.output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ManualDraftError as exc:
        raise SystemExit(f"Phase 8D manual-review draft error: {exc}") from exc
