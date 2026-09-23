"""Validate manually collected Phase 8D accessibility and device evidence."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import stat
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MANUAL_PROTOCOL = REPOSITORY_ROOT / "data/audits/phase-8d-manual-protocol-v1.json"

SUPPORTED_ITEMS = {
    "wcag-2.2-aa-manual-review",
    "screen-reader",
    "browser-zoom-200",
    "representative-low-end-device",
}

_TOP_LEVEL_KEYS = {
    "artifact_version",
    "evidence_id",
    "phase",
    "item_id",
    "status",
    "observed_at",
    "build_commit",
    "operator_or_reviewer",
    "browser_os_device",
    "manual_attestation",
    "procedure",
    "route_or_flow",
    "observations",
    "evidence_references",
    "findings",
    "claim_boundary",
}
_ENVIRONMENT_KEYS = {
    "environment_id",
    "browser",
    "browser_version",
    "os",
    "os_version",
    "device",
    "viewport_width_css_px",
    "viewport_height_css_px",
    "dpr",
    "screen_reader",
    "screen_reader_version",
    "browser_zoom_percent",
    "browser_zoom_confirmed",
    "network_condition",
    "actual_device_confirmed",
    "synthetic_cpu",
    "synthetic_network",
    "touch_input_confirmed",
}
_ATTESTATION_KEYS = {
    "performed_manually",
    "operator_confirmed_environment",
    "automation_only",
    "notes",
}
_OBSERVATION_KEYS = {
    "route_or_flow",
    "check",
    "environment_id",
    "status",
    "notes",
    "evidence_references",
}
_ITEM_KEYS = {
    "journeys",
    "checks",
    "allowed_statuses",
    "generic_pass_threshold",
    "claim_boundary",
}
_LOW_END_ITEM_KEYS = _ITEM_KEYS | {"additional_routes"}
_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")


class ManualEvidenceError(ValueError):
    """Raised when Phase 8D manual evidence is incomplete or structurally invalid."""


def _parse_json_text(text: str, label: str) -> dict[str, object]:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise ManualEvidenceError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise ManualEvidenceError(f"non-finite JSON number is not allowed: {value}")

    try:
        value = json.loads(
            text,
            object_pairs_hook=reject_duplicates,
            parse_constant=reject_constant,
        )
    except ManualEvidenceError:
        raise
    except (json.JSONDecodeError, ValueError) as exc:
        raise ManualEvidenceError(f"could not parse {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise ManualEvidenceError(f"{label} root must be an object")
    return cast(dict[str, object], value)


def _read_tracked_json(path: Path, label: str) -> dict[str, object]:
    try:
        relative = path.relative_to(REPOSITORY_ROOT)
    except ValueError as exc:
        raise ManualEvidenceError(f"{label} must remain inside the repository") from exc

    directory_flags = os.O_RDONLY | os.O_DIRECTORY
    file_flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
        file_flags |= os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        directory_flags |= os.O_NONBLOCK
        file_flags |= os.O_NONBLOCK

    root_fd = os.open(REPOSITORY_ROOT, directory_flags)
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
            raise ManualEvidenceError(f"{label} must be a regular file")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(file_fd, 64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > 1024 * 1024:
                raise ManualEvidenceError(f"{label} exceeds the 1 MiB trust-root bound")
            chunks.append(chunk)
        return _parse_json_text(b"".join(chunks).decode("utf-8"), label)
    except (OSError, UnicodeDecodeError) as exc:
        raise ManualEvidenceError(f"could not read tracked {label} safely: {exc}") from exc
    finally:
        if file_fd is not None:
            os.close(file_fd)
        for descriptor in reversed(directory_fds):
            os.close(descriptor)


def _load_input(path: Path) -> dict[str, object]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ManualEvidenceError(f"could not read manual evidence: {exc}") from exc
    return _parse_json_text(text, "manual evidence")


def _object(value: object, label: str, keys: set[str]) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ManualEvidenceError(f"{label} must be an object")
    result = cast(dict[str, object], value)
    actual = set(result)
    if actual != keys:
        missing = sorted(keys - actual)
        extra = sorted(actual - keys)
        raise ManualEvidenceError(f"{label} keys mismatch; missing={missing}, extra={extra}")
    return result


def _string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip() or any(ord(char) < 32 for char in value):
        raise ManualEvidenceError(f"{label} must be a non-empty printable string")
    return value


def _nullable_string(value: object, label: str) -> str | None:
    if value is None:
        return None
    return _string(value, label)


def _utc(value: object, label: str) -> datetime:
    raw = _string(value, label)
    if not raw.endswith("Z"):
        raise ManualEvidenceError(f"{label} must be an explicit UTC timestamp ending in Z")
    try:
        parsed = datetime.fromisoformat(raw[:-1] + "+00:00")
    except ValueError as exc:
        raise ManualEvidenceError(f"{label} must be an ISO-8601 UTC timestamp") from exc
    if parsed.tzinfo != UTC:
        raise ManualEvidenceError(f"{label} must use UTC")
    return parsed


def _positive_number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ManualEvidenceError(f"{label} must be numeric")
    try:
        result = float(value)
    except (OverflowError, ValueError) as exc:
        raise ManualEvidenceError(f"{label} must be a finite positive number") from exc
    if not math.isfinite(result) or result <= 0:
        raise ManualEvidenceError(f"{label} must be a finite positive number")
    return result


def _positive_int_or_none(value: object, label: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ManualEvidenceError(f"{label} must be a positive integer or null")
    return value


def _list_of_strings(value: object, label: str, *, allow_empty: bool = False) -> list[str]:
    if not isinstance(value, list) or (not allow_empty and not value):
        emptiness = "" if allow_empty else " non-empty"
        raise ManualEvidenceError(f"{label} must be a{emptiness} list")
    result: list[str] = []
    for index, item in enumerate(value):
        result.append(_string(item, f"{label}[{index}]"))
    return result


def _validate_protocol_identity(protocol: dict[str, object]) -> dict[str, object]:
    version = protocol.get("artifact_version")
    if (
        type(version) is not int
        or version != 1
        or protocol.get("protocol_id") != "phase-8d-manual-protocol-v1"
        or protocol.get("phase") != "8D"
    ):
        raise ManualEvidenceError("manual protocol identity is invalid")
    return protocol


def _protocol() -> dict[str, object]:
    return _validate_protocol_identity(_read_tracked_json(MANUAL_PROTOCOL, "manual protocol"))


def _required_flows(item: dict[str, object]) -> list[str]:
    journeys = _list_of_strings(item["journeys"], "protocol journeys")
    additional_routes = item.get("additional_routes", [])
    routes = _list_of_strings(additional_routes, "protocol additional_routes", allow_empty=True)
    return journeys + routes


def _validate_environment(environment: dict[str, object]) -> None:
    _string(environment["environment_id"], "browser_os_device.environment_id")
    for field in ("browser", "browser_version", "os", "os_version", "device"):
        _string(environment[field], f"browser_os_device.{field}")
    width = _positive_int_or_none(
        environment["viewport_width_css_px"],
        "browser_os_device.viewport_width_css_px",
    )
    height = _positive_int_or_none(
        environment["viewport_height_css_px"],
        "browser_os_device.viewport_height_css_px",
    )
    dpr = environment["dpr"]
    if dpr is not None:
        _positive_number(dpr, "browser_os_device.dpr")

    screen_reader = _nullable_string(
        environment["screen_reader"], "browser_os_device.screen_reader"
    )
    screen_reader_version = _nullable_string(
        environment["screen_reader_version"],
        "browser_os_device.screen_reader_version",
    )
    if (screen_reader is None) != (screen_reader_version is None):
        raise ManualEvidenceError(
            "browser_os_device.screen_reader and screen_reader_version must both be set or null"
        )
    zoom = environment["browser_zoom_percent"]
    if zoom is not None and (isinstance(zoom, bool) or not isinstance(zoom, int) or zoom <= 0):
        raise ManualEvidenceError("browser_os_device.browser_zoom_percent must be positive or null")
    zoom_confirmed = environment["browser_zoom_confirmed"]
    if zoom_confirmed is not None and not isinstance(zoom_confirmed, bool):
        raise ManualEvidenceError(
            "browser_os_device.browser_zoom_confirmed must be boolean or null"
        )
    _nullable_string(
        environment["network_condition"],
        "browser_os_device.network_condition",
    )
    for field in (
        "actual_device_confirmed",
        "synthetic_cpu",
        "synthetic_network",
        "touch_input_confirmed",
    ):
        value = environment[field]
        if value is not None and not isinstance(value, bool):
            raise ManualEvidenceError(f"browser_os_device.{field} must be boolean or null")

    if zoom_confirmed is True and zoom is None:
        raise ManualEvidenceError(
            "browser_os_device.browser_zoom_confirmed cannot be true without a zoom percentage"
        )

    if (width is None) != (height is None):
        raise ManualEvidenceError(
            "browser_os_device viewport width and height must both be set or null"
        )


def _validate_environments(value: object) -> dict[str, dict[str, object]]:
    if not isinstance(value, list) or not value:
        raise ManualEvidenceError("browser_os_device must be a non-empty list of environments")
    environments: dict[str, dict[str, object]] = {}
    for index, raw_environment in enumerate(value):
        environment = _object(
            raw_environment,
            f"browser_os_device[{index}]",
            _ENVIRONMENT_KEYS,
        )
        _validate_environment(environment)
        environment_id = _string(
            environment["environment_id"],
            f"browser_os_device[{index}].environment_id",
        )
        if environment_id in environments:
            raise ManualEvidenceError(f"duplicate environment_id: {environment_id}")
        environments[environment_id] = environment
    return environments


def _require_screen_reader(environment: dict[str, object], label: str) -> None:
    if environment["screen_reader"] is None or environment["screen_reader_version"] is None:
        raise ManualEvidenceError(f"{label} requires a real screen reader name and version")


def _require_native_200_zoom(environment: dict[str, object], label: str) -> None:
    if (
        environment["browser_zoom_percent"] != 200
        or environment["browser_zoom_confirmed"] is not True
    ):
        raise ManualEvidenceError(f"{label} requires confirmed native browser page zoom at 200%")


def _require_touch_device(environment: dict[str, object], label: str) -> None:
    if environment["actual_device_confirmed"] is not True:
        raise ManualEvidenceError(f"{label} requires an actual physical device")
    if environment["touch_input_confirmed"] is not True:
        raise ManualEvidenceError(f"{label} requires confirmed touch input on the recorded device")


def _require_low_end_device(environment: dict[str, object], label: str) -> None:
    if (
        environment["viewport_width_css_px"] is None
        or environment["viewport_height_css_px"] is None
        or environment["dpr"] is None
        or environment["network_condition"] is None
    ):
        raise ManualEvidenceError(f"{label} requires viewport, DPR, and network condition")
    if environment["actual_device_confirmed"] is not True:
        raise ManualEvidenceError(f"{label} requires an actual physical device")
    if environment["synthetic_cpu"] is not False or environment["synthetic_network"] is not False:
        raise ManualEvidenceError(
            f"{label} must not substitute synthetic CPU or network throttling"
        )


def _validate_observation_environment(
    item_id: str,
    check: str,
    environment: dict[str, object],
    label: str,
) -> None:
    if item_id == "screen-reader":
        _require_screen_reader(environment, label)
    elif item_id == "browser-zoom-200":
        _require_native_200_zoom(environment, label)
    elif item_id == "representative-low-end-device":
        _require_low_end_device(environment, label)
    elif item_id == "wcag-2.2-aa-manual-review":
        if check == "screen-reader landmarks":
            _require_screen_reader(environment, label)
        elif check == "real browser 200% zoom":
            _require_native_200_zoom(environment, label)
        elif check == "touch-only interaction":
            _require_touch_device(environment, label)


def validate_manual_evidence(
    document: dict[str, object], *, now: datetime | None = None
) -> dict[str, object]:
    """Validate one manually collected Phase 8D evidence artifact."""

    if set(document) != _TOP_LEVEL_KEYS:
        missing = sorted(_TOP_LEVEL_KEYS - set(document))
        extra = sorted(set(document) - _TOP_LEVEL_KEYS)
        raise ManualEvidenceError(f"top-level keys mismatch; missing={missing}, extra={extra}")
    if document["artifact_version"] != 1:
        raise ManualEvidenceError("artifact_version must be 1")
    if document["phase"] != "8D":
        raise ManualEvidenceError("phase must be 8D")
    item_id = _string(document["item_id"], "item_id")
    if item_id not in SUPPORTED_ITEMS:
        raise ManualEvidenceError("item_id is not supported by the manual evidence validator")
    if document["evidence_id"] != f"phase-8d-{item_id}-manual-v1":
        raise ManualEvidenceError("evidence_id must match the selected item_id")

    protocol = _protocol()
    raw_items = protocol.get("evidence_items")
    if not isinstance(raw_items, dict):
        raise ManualEvidenceError("manual protocol evidence_items must be an object")
    raw_item = cast(dict[str, object], raw_items).get(item_id)
    expected_keys = _LOW_END_ITEM_KEYS if item_id == "representative-low-end-device" else _ITEM_KEYS
    item = _object(raw_item, f"protocol item {item_id}", expected_keys)

    allowed_statuses = _list_of_strings(item["allowed_statuses"], "protocol allowed_statuses")
    status = _string(document["status"], "status")
    if status not in allowed_statuses:
        raise ManualEvidenceError("status is not allowed by the selected protocol item")
    if item["generic_pass_threshold"] is not None:
        raise ManualEvidenceError("manual protocol generic_pass_threshold must remain null")
    if document["claim_boundary"] != item["claim_boundary"]:
        raise ManualEvidenceError("claim_boundary must exactly match the selected protocol item")

    observed_at = _utc(document["observed_at"], "observed_at")
    current_time = datetime.now(UTC) if now is None else now
    if current_time.tzinfo != UTC:
        raise ManualEvidenceError("validator current time must use UTC")
    if observed_at > current_time:
        raise ManualEvidenceError("observed_at must not be in the future")

    build_commit = _string(document["build_commit"], "build_commit")
    if _COMMIT_PATTERN.fullmatch(build_commit) is None:
        raise ManualEvidenceError("build_commit must be a lowercase 40-character Git SHA")
    _string(document["operator_or_reviewer"], "operator_or_reviewer")

    environments = _validate_environments(document["browser_os_device"])

    attestation = _object(document["manual_attestation"], "manual_attestation", _ATTESTATION_KEYS)
    if attestation["performed_manually"] is not True:
        raise ManualEvidenceError("manual_attestation.performed_manually must be true")
    if attestation["operator_confirmed_environment"] is not True:
        raise ManualEvidenceError("manual_attestation.operator_confirmed_environment must be true")
    if attestation["automation_only"] is not False:
        raise ManualEvidenceError("manual_attestation.automation_only must be false")
    _string(attestation["notes"], "manual_attestation.notes")

    _list_of_strings(document["procedure"], "procedure")
    required_flows = _required_flows(item)
    declared_flows = _list_of_strings(document["route_or_flow"], "route_or_flow")
    if len(declared_flows) != len(set(declared_flows)):
        raise ManualEvidenceError("route_or_flow values must be unique")
    if set(declared_flows) != set(required_flows):
        raise ManualEvidenceError(
            "route_or_flow must contain every required protocol journey/additional route "
            "and no extras"
        )

    required_checks = _list_of_strings(item["checks"], "protocol checks")
    raw_observations = document["observations"]
    if not isinstance(raw_observations, list):
        raise ManualEvidenceError("observations must be a list")
    expected_pairs = {(flow, check) for flow in required_flows for check in required_checks}
    seen_pairs: set[tuple[str, str]] = set()
    observation_statuses: list[str] = []
    for index, raw_observation in enumerate(raw_observations):
        observation = _object(
            raw_observation,
            f"observations[{index}]",
            _OBSERVATION_KEYS,
        )
        flow = _string(observation["route_or_flow"], f"observations[{index}].route_or_flow")
        check = _string(observation["check"], f"observations[{index}].check")
        environment_id = _string(
            observation["environment_id"],
            f"observations[{index}].environment_id",
        )
        environment = environments.get(environment_id)
        if environment is None:
            raise ManualEvidenceError(
                f"observations[{index}].environment_id does not name a recorded environment"
            )
        pair = (flow, check)
        if pair not in expected_pairs:
            raise ManualEvidenceError(
                f"observations[{index}] references an unknown route_or_flow/check pair"
            )
        if pair in seen_pairs:
            raise ManualEvidenceError(
                f"duplicate observation for route_or_flow={flow!r}, check={check!r}"
            )
        seen_pairs.add(pair)
        observation_status = _string(observation["status"], f"observations[{index}].status")
        if observation_status not in allowed_statuses:
            raise ManualEvidenceError(
                f"observations[{index}].status is not allowed by the selected protocol item"
            )
        observation_statuses.append(observation_status)
        _validate_observation_environment(
            item_id,
            check,
            environment,
            f"observations[{index}]",
        )
        _string(observation["notes"], f"observations[{index}].notes")
        _list_of_strings(
            observation["evidence_references"],
            f"observations[{index}].evidence_references",
            allow_empty=True,
        )

    missing_pairs = expected_pairs - seen_pairs
    if missing_pairs:
        raise ManualEvidenceError(
            f"observations are incomplete; missing {len(missing_pairs)} required flow/check pairs"
        )
    if status == "observed_pass" and any(
        observation_status != "observed_pass" for observation_status in observation_statuses
    ):
        raise ManualEvidenceError(
            "top-level observed_pass requires every required observation to be observed_pass"
        )
    required_summary_observation = {
        "observed_finding": "observed_finding",
        "inconclusive": "inconclusive",
        "unavailable": "unavailable",
    }.get(status)
    if (
        required_summary_observation is not None
        and required_summary_observation not in observation_statuses
    ):
        raise ManualEvidenceError(
            f"top-level {status} requires at least one {required_summary_observation} observation"
        )

    _list_of_strings(document["evidence_references"], "evidence_references")
    findings = _list_of_strings(document["findings"], "findings", allow_empty=True)
    if (
        status == "observed_finding" or "observed_finding" in observation_statuses
    ) and not findings:
        raise ManualEvidenceError(
            "findings must describe at least one issue when an observation is observed_finding"
        )

    return document


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate complete human-collected Phase 8D accessibility or representative-device "
            "evidence. This tool validates structure and protocol coverage only; it does not "
            "perform the manual observation or infer a pass."
        )
    )
    parser.add_argument("--input", required=True, type=Path, help="manual evidence JSON file")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    document = validate_manual_evidence(_load_input(args.input))
    print(
        "Phase 8D manual evidence valid: "
        f"item={document['item_id']}, status={document['status']}, "
        f"observations={len(cast(list[object], document['observations']))}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ManualEvidenceError as exc:
        raise SystemExit(f"Phase 8D manual evidence invalid: {exc}") from exc
