"""Validate or import aggregate Phase 8D field-INP evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import secrets
import stat
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path
from typing import cast
from urllib.parse import urlsplit

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MANUAL_PROTOCOL = REPOSITORY_ROOT / "data/audits/phase-8d-manual-protocol-v1.json"
APPROVAL_MANIFEST = REPOSITORY_ROOT / "data/audits/phase-8d-field-inp-approvals-v1.json"
TRACKED_OUTPUT = REPOSITORY_ROOT / "data/audits/phase-8d-field-inp-v1.json"

_TOP_LEVEL_KEYS = {
    "artifact_version",
    "evidence_id",
    "phase",
    "status",
    "observed_at",
    "deployment",
    "observation_window",
    "instrumentation_source",
    "sample_population",
    "aggregation",
    "segmentation",
    "collection_limitations",
    "privacy_review",
    "source_export",
    "evidence_references",
    "generic_pass_threshold",
    "claim_boundary",
}
_DEPLOYMENT_KEYS = {
    "approval_id",
    "origin",
    "build_commit",
    "environment",
    "deployment_reference",
}
_WINDOW_KEYS = {"start", "end"}
_SOURCE_KEYS = {
    "approval_id",
    "name",
    "kind",
    "documentation_url",
    "approval_reference",
}
_POPULATION_KEYS = {"description", "count"}
_AGGREGATION_KEYS = {"metric", "statistic", "value_ms"}
_SEGMENTATION_KEYS = {"scope", "description"}
_PRIVACY_KEYS = {
    "approval_id",
    "approval_reference",
    "approved",
    "reviewer",
    "reviewed_at",
    "aggregate_only",
    "contains_user_identifiers",
    "lumina_behavioral_tracking_added",
    "notes",
}
_SOURCE_EXPORT_KEYS = {"approval_id", "sha256", "reference"}
_APPROVAL_MANIFEST_KEYS = {
    "artifact_version",
    "manifest_id",
    "phase",
    "approved_sources",
    "approved_deployments",
    "approved_privacy_reviews",
    "approved_exports",
    "claim_boundary",
}
_APPROVED_SOURCE_KEYS = {
    "approval_id",
    "name",
    "kind",
    "documentation_url",
    "approval_reference",
}
_APPROVED_DEPLOYMENT_KEYS = {
    "approval_id",
    "origin",
    "build_commit",
    "environment",
    "deployment_reference",
}
_APPROVED_PRIVACY_KEYS = {
    "approval_id",
    "approval_reference",
    "reviewer",
    "approved_at",
    "scope",
}
_APPROVED_EXPORT_KEYS = {
    "approval_id",
    "source_approval_id",
    "deployment_approval_id",
    "privacy_approval_id",
    "sha256",
    "reference",
    "observation_start",
    "observation_end",
    "sample_count",
    "aggregation_metric",
    "aggregation_statistic",
    "aggregation_value_ms",
    "segmentation_scope",
    "segmentation_description",
}
_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class FieldInpEvidenceError(ValueError):
    """Raised when Phase 8D field-INP evidence is not admissible."""


def _parse_json_text(text: str, label: str) -> dict[str, object]:
    def reject_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise FieldInpEvidenceError(f"duplicate JSON key: {key}")
            result[key] = value
        return result

    def reject_constant(value: str) -> object:
        raise FieldInpEvidenceError(f"non-finite JSON number is not allowed: {value}")

    try:
        value = json.loads(
            text,
            object_pairs_hook=reject_duplicates,
            parse_constant=reject_constant,
        )
    except FieldInpEvidenceError:
        raise
    except (json.JSONDecodeError, ValueError) as exc:
        raise FieldInpEvidenceError(f"could not parse {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise FieldInpEvidenceError(f"{label} root must be an object")
    return cast(dict[str, object], value)


def _load_json(path: Path) -> dict[str, object]:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise FieldInpEvidenceError(f"could not read JSON evidence: {exc}") from exc
    return _parse_json_text(text, "JSON evidence")


def _read_tracked_file_no_follow(
    path: Path,
    label: str,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> str:
    try:
        relative = path.relative_to(repository_root)
    except ValueError as exc:
        raise FieldInpEvidenceError(f"{label} must remain inside the repository") from exc

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
    opened_directory_fds: list[int] = []
    file_fd: int | None = None
    try:
        for part in relative.parts[:-1]:
            next_fd = os.open(part, directory_flags, dir_fd=current_fd)
            opened_directory_fds.append(next_fd)
            current_fd = next_fd
        file_fd = os.open(relative.name, file_flags, dir_fd=current_fd)
        metadata = os.fstat(file_fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise FieldInpEvidenceError(f"{label} must be a regular file")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(file_fd, 64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > 1024 * 1024:
                raise FieldInpEvidenceError(f"{label} exceeds the 1 MiB trust-root bound")
            chunks.append(chunk)
        try:
            return b"".join(chunks).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise FieldInpEvidenceError(f"{label} must be UTF-8 JSON") from exc
    except OSError as exc:
        raise FieldInpEvidenceError(
            f"could not read tracked {label} without symlinks: {exc}"
        ) from exc
    finally:
        if file_fd is not None:
            os.close(file_fd)
        for descriptor in reversed(opened_directory_fds):
            os.close(descriptor)
        os.close(root_fd)


def _load_tracked_json(
    path: Path,
    label: str,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> dict[str, object]:
    return _parse_json_text(
        _read_tracked_file_no_follow(path, label, repository_root=repository_root),
        label,
    )


def _sha256_file(path: Path) -> str:
    absolute = Path(os.path.abspath(path))
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        flags |= os.O_NONBLOCK
    try:
        descriptor = os.open(absolute, flags)
    except OSError as exc:
        raise FieldInpEvidenceError(f"could not open source export safely: {exc}") from exc
    digest = hashlib.sha256()
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise FieldInpEvidenceError("source export must be a regular file")
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    except OSError as exc:
        raise FieldInpEvidenceError(f"could not read source export: {exc}") from exc
    finally:
        os.close(descriptor)
    return digest.hexdigest()


def _object(value: object, label: str, keys: set[str]) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise FieldInpEvidenceError(f"{label} must be an object")
    result = cast(dict[str, object], value)
    actual = set(result)
    if actual != keys:
        missing = sorted(keys - actual)
        extra = sorted(actual - keys)
        raise FieldInpEvidenceError(f"{label} keys mismatch; missing={missing}, extra={extra}")
    return result


def _object_list(value: object, label: str, keys: set[str]) -> list[dict[str, object]]:
    if not isinstance(value, list):
        raise FieldInpEvidenceError(f"{label} must be a list")
    result: list[dict[str, object]] = []
    for index, item in enumerate(value):
        result.append(_object(item, f"{label}[{index}]", keys))
    return result


def _string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip() or any(ord(char) < 32 for char in value):
        raise FieldInpEvidenceError(f"{label} must be a non-empty printable string")
    return value


def _utc(value: object, label: str) -> datetime:
    raw = _string(value, label)
    if not raw.endswith("Z"):
        raise FieldInpEvidenceError(f"{label} must be an explicit UTC timestamp ending in Z")
    try:
        parsed = datetime.fromisoformat(raw[:-1] + "+00:00")
    except ValueError as exc:
        raise FieldInpEvidenceError(f"{label} must be an ISO-8601 UTC timestamp") from exc
    if parsed.tzinfo != UTC:
        raise FieldInpEvidenceError(f"{label} must use UTC")
    return parsed


def _https_url(value: object, label: str, *, origin_only: bool = False) -> str:
    raw = _string(value, label)
    parsed = urlsplit(raw)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise FieldInpEvidenceError(f"{label} must be an HTTPS URL without credentials")
    if origin_only and (parsed.path not in {"", "/"} or parsed.query or parsed.fragment):
        raise FieldInpEvidenceError(f"{label} must be an HTTPS origin without path/query/fragment")
    return raw


def _number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise FieldInpEvidenceError(f"{label} must be numeric")
    try:
        result = float(value)
    except (OverflowError, ValueError) as exc:
        raise FieldInpEvidenceError(f"{label} must be a finite numeric value") from exc
    if not math.isfinite(result):
        raise FieldInpEvidenceError(f"{label} must be finite")
    if result < 0:
        raise FieldInpEvidenceError(f"{label} must be non-negative")
    return result


def _protocol_field_inp() -> dict[str, object]:
    protocol = _load_tracked_json(MANUAL_PROTOCOL, "manual protocol")
    version = protocol.get("artifact_version")
    if (
        type(version) is not int
        or version != 1
        or protocol.get("protocol_id") != "phase-8d-manual-protocol-v1"
        or protocol.get("phase") != "8D"
    ):
        raise FieldInpEvidenceError("manual protocol identity is invalid")
    raw_items = protocol.get("evidence_items")
    if not isinstance(raw_items, dict) or not all(isinstance(key, str) for key in raw_items):
        raise FieldInpEvidenceError("manual protocol evidence_items must be an object")
    items = cast(dict[str, object], raw_items)
    return _object(
        items.get("field-inp"),
        "manual protocol field-inp",
        {"journeys", "checks", "allowed_statuses", "generic_pass_threshold", "claim_boundary"},
    )


def _approval_manifest(document: dict[str, object]) -> dict[str, object]:
    manifest = _object(document, "approval manifest", _APPROVAL_MANIFEST_KEYS)
    manifest_version = manifest["artifact_version"]
    if type(manifest_version) is not int or manifest_version != 1:
        raise FieldInpEvidenceError("approval manifest artifact_version must be 1")
    if manifest["manifest_id"] != "phase-8d-field-inp-approvals-v1":
        raise FieldInpEvidenceError("approval manifest id must be phase-8d-field-inp-approvals-v1")
    if manifest["phase"] != "8D":
        raise FieldInpEvidenceError("approval manifest phase must be 8D")
    _string(manifest["claim_boundary"], "approval manifest claim_boundary")

    source_entries = _object_list(
        manifest["approved_sources"], "approved_sources", _APPROVED_SOURCE_KEYS
    )
    deployment_entries = _object_list(
        manifest["approved_deployments"],
        "approved_deployments",
        _APPROVED_DEPLOYMENT_KEYS,
    )
    privacy_entries = _object_list(
        manifest["approved_privacy_reviews"],
        "approved_privacy_reviews",
        _APPROVED_PRIVACY_KEYS,
    )
    export_entries = _object_list(
        manifest["approved_exports"],
        "approved_exports",
        _APPROVED_EXPORT_KEYS,
    )

    for label, entries in (
        ("approved_sources", source_entries),
        ("approved_deployments", deployment_entries),
        ("approved_privacy_reviews", privacy_entries),
        ("approved_exports", export_entries),
    ):
        ids = [_string(item["approval_id"], f"{label}.approval_id") for item in entries]
        if len(ids) != len(set(ids)):
            raise FieldInpEvidenceError(f"{label} approval_id values must be unique")

    for index, item in enumerate(export_entries):
        sha256 = _string(item["sha256"], f"approved_exports[{index}].sha256")
        if _SHA256_PATTERN.fullmatch(sha256) is None:
            raise FieldInpEvidenceError(
                f"approved_exports[{index}].sha256 must be a lowercase SHA-256 digest"
            )
        _string(item["reference"], f"approved_exports[{index}].reference")
        _string(item["source_approval_id"], f"approved_exports[{index}].source_approval_id")
        _string(
            item["deployment_approval_id"],
            f"approved_exports[{index}].deployment_approval_id",
        )
        _string(item["privacy_approval_id"], f"approved_exports[{index}].privacy_approval_id")
        _utc(item["observation_start"], f"approved_exports[{index}].observation_start")
        _utc(item["observation_end"], f"approved_exports[{index}].observation_end")
        sample_count = item["sample_count"]
        if isinstance(sample_count, bool) or not isinstance(sample_count, int) or sample_count < 0:
            raise FieldInpEvidenceError(
                f"approved_exports[{index}].sample_count must be a non-negative integer"
            )
        _string(item["aggregation_metric"], f"approved_exports[{index}].aggregation_metric")
        _string(
            item["aggregation_statistic"],
            f"approved_exports[{index}].aggregation_statistic",
        )
        approved_value = item["aggregation_value_ms"]
        if approved_value is not None:
            _number(approved_value, f"approved_exports[{index}].aggregation_value_ms")
        _string(item["segmentation_scope"], f"approved_exports[{index}].segmentation_scope")
        _string(
            item["segmentation_description"],
            f"approved_exports[{index}].segmentation_description",
        )

    return manifest


def _find_approval(
    approvals: list[dict[str, object]], approval_id: str, label: str
) -> dict[str, object]:
    matches = [
        item
        for item in approvals
        if isinstance(item.get("approval_id"), str) and item["approval_id"] == approval_id
    ]
    if len(matches) != 1:
        raise FieldInpEvidenceError(
            f"{label} approval_id is not uniquely present in the tracked approval manifest"
        )
    return matches[0]


def _match_exact_fields(
    evidence: dict[str, object],
    approval: dict[str, object],
    fields: tuple[str, ...],
    label: str,
) -> None:
    for field in fields:
        if evidence[field] != approval[field]:
            raise FieldInpEvidenceError(
                f"{label}.{field} does not match the tracked approval manifest"
            )


def validate_field_inp_evidence(
    document: dict[str, object],
    *,
    approvals_document: dict[str, object] | None = None,
    source_export_sha256: str | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    """Validate one aggregate field-INP artifact and return it unchanged."""

    if set(document) != _TOP_LEVEL_KEYS:
        missing = sorted(_TOP_LEVEL_KEYS - set(document))
        extra = sorted(set(document) - _TOP_LEVEL_KEYS)
        raise FieldInpEvidenceError(f"top-level keys mismatch; missing={missing}, extra={extra}")

    protocol = _protocol_field_inp()
    allowed_statuses = protocol["allowed_statuses"]
    if not isinstance(allowed_statuses, list) or not all(
        isinstance(item, str) for item in allowed_statuses
    ):
        raise FieldInpEvidenceError("manual protocol allowed_statuses is invalid")

    approvals = _approval_manifest(
        _load_tracked_json(APPROVAL_MANIFEST, "field-INP approval manifest")
        if approvals_document is None
        else approvals_document
    )
    approved_sources = _object_list(
        approvals["approved_sources"], "approved_sources", _APPROVED_SOURCE_KEYS
    )
    approved_deployments = _object_list(
        approvals["approved_deployments"],
        "approved_deployments",
        _APPROVED_DEPLOYMENT_KEYS,
    )
    approved_privacy = _object_list(
        approvals["approved_privacy_reviews"],
        "approved_privacy_reviews",
        _APPROVED_PRIVACY_KEYS,
    )
    approved_exports = _object_list(
        approvals["approved_exports"],
        "approved_exports",
        _APPROVED_EXPORT_KEYS,
    )

    current_time = datetime.now(UTC) if now is None else now
    if current_time.tzinfo != UTC:
        raise FieldInpEvidenceError("validator current time must use UTC")

    artifact_version = document["artifact_version"]
    if type(artifact_version) is not int or artifact_version != 1:
        raise FieldInpEvidenceError("artifact_version must be 1")
    if document["evidence_id"] != "phase-8d-field-inp-v1":
        raise FieldInpEvidenceError("evidence_id must be phase-8d-field-inp-v1")
    if document["phase"] != "8D":
        raise FieldInpEvidenceError("phase must be 8D")
    status = _string(document["status"], "status")
    if status not in allowed_statuses:
        raise FieldInpEvidenceError("status is not allowed by the Phase 8D manual protocol")
    if status == "observed_pass":
        raise FieldInpEvidenceError(
            "observed_pass is not locally admissible until a project field-INP "
            "threshold policy is explicitly frozen"
        )
    if document["generic_pass_threshold"] is not None:
        raise FieldInpEvidenceError("generic_pass_threshold must remain null")
    if document["claim_boundary"] != protocol["claim_boundary"]:
        raise FieldInpEvidenceError(
            "claim_boundary must exactly match the Phase 8D manual protocol"
        )

    observed_at = _utc(document["observed_at"], "observed_at")
    if observed_at > current_time:
        raise FieldInpEvidenceError("observed_at must not be in the future")

    deployment = _object(document["deployment"], "deployment", _DEPLOYMENT_KEYS)
    deployment_approval_id = _string(deployment["approval_id"], "deployment.approval_id")
    _https_url(deployment["origin"], "deployment.origin", origin_only=True)
    build_commit = _string(deployment["build_commit"], "deployment.build_commit")
    if _COMMIT_PATTERN.fullmatch(build_commit) is None:
        raise FieldInpEvidenceError(
            "deployment.build_commit must be a lowercase 40-character Git SHA"
        )
    _string(deployment["environment"], "deployment.environment")
    _string(deployment["deployment_reference"], "deployment.deployment_reference")
    deployment_approval = _find_approval(approved_deployments, deployment_approval_id, "deployment")
    _match_exact_fields(
        deployment,
        deployment_approval,
        ("origin", "build_commit", "environment", "deployment_reference"),
        "deployment",
    )

    window = _object(document["observation_window"], "observation_window", _WINDOW_KEYS)
    window_start = _utc(window["start"], "observation_window.start")
    window_end = _utc(window["end"], "observation_window.end")
    if window_end <= window_start:
        raise FieldInpEvidenceError("observation window end must be after start")
    if window_end > current_time:
        raise FieldInpEvidenceError("observation window end must not be in the future")
    if observed_at < window_end:
        raise FieldInpEvidenceError("observed_at must not precede the observation window end")

    source = _object(document["instrumentation_source"], "instrumentation_source", _SOURCE_KEYS)
    source_approval_id = _string(source["approval_id"], "instrumentation_source.approval_id")
    _string(source["name"], "instrumentation_source.name")
    _string(source["kind"], "instrumentation_source.kind")
    _https_url(source["documentation_url"], "instrumentation_source.documentation_url")
    _string(source["approval_reference"], "instrumentation_source.approval_reference")
    source_approval = _find_approval(approved_sources, source_approval_id, "instrumentation_source")
    _match_exact_fields(
        source,
        source_approval,
        ("name", "kind", "documentation_url", "approval_reference"),
        "instrumentation_source",
    )

    population = _object(document["sample_population"], "sample_population", _POPULATION_KEYS)
    _string(population["description"], "sample_population.description")
    count = population["count"]
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise FieldInpEvidenceError("sample_population.count must be a non-negative integer")

    aggregation = _object(document["aggregation"], "aggregation", _AGGREGATION_KEYS)
    if aggregation["metric"] != "INP":
        raise FieldInpEvidenceError("aggregation.metric must be INP")
    _string(aggregation["statistic"], "aggregation.statistic")
    value_ms = aggregation["value_ms"]
    if status == "unavailable":
        if count != 0 or value_ms is not None:
            raise FieldInpEvidenceError(
                "unavailable evidence must have sample count 0 and null value_ms"
            )
    else:
        if count <= 0:
            raise FieldInpEvidenceError(
                "observed or inconclusive evidence must have a positive sample count"
            )
        _number(value_ms, "aggregation.value_ms")

    segmentation = _object(document["segmentation"], "segmentation", _SEGMENTATION_KEYS)
    _string(segmentation["scope"], "segmentation.scope")
    _string(segmentation["description"], "segmentation.description")

    limitations = document["collection_limitations"]
    if not isinstance(limitations, list) or not limitations:
        raise FieldInpEvidenceError("collection_limitations must be a non-empty list")
    for index, limitation in enumerate(limitations):
        _string(limitation, f"collection_limitations[{index}]")

    privacy = _object(document["privacy_review"], "privacy_review", _PRIVACY_KEYS)
    privacy_approval_id = _string(privacy["approval_id"], "privacy_review.approval_id")
    privacy_approval_reference = _string(
        privacy["approval_reference"], "privacy_review.approval_reference"
    )
    if privacy["approved"] is not True:
        raise FieldInpEvidenceError("privacy_review.approved must be true")
    privacy_reviewer = _string(privacy["reviewer"], "privacy_review.reviewer")
    reviewed_at_raw = _string(privacy["reviewed_at"], "privacy_review.reviewed_at")
    reviewed_at = _utc(reviewed_at_raw, "privacy_review.reviewed_at")
    if reviewed_at > current_time:
        raise FieldInpEvidenceError("privacy_review.reviewed_at must not be in the future")
    if privacy["aggregate_only"] is not True:
        raise FieldInpEvidenceError("privacy_review.aggregate_only must be true")
    if privacy["contains_user_identifiers"] is not False:
        raise FieldInpEvidenceError("privacy_review.contains_user_identifiers must be false")
    if privacy["lumina_behavioral_tracking_added"] is not False:
        raise FieldInpEvidenceError("privacy_review.lumina_behavioral_tracking_added must be false")
    _string(privacy["notes"], "privacy_review.notes")

    privacy_approval = _find_approval(approved_privacy, privacy_approval_id, "privacy_review")
    _string(privacy_approval["scope"], "approved_privacy_reviews.scope")
    _utc(privacy_approval["approved_at"], "approved_privacy_reviews.approved_at")
    _match_exact_fields(
        {
            "approval_reference": privacy_approval_reference,
            "reviewer": privacy_reviewer,
            "approved_at": reviewed_at_raw,
        },
        privacy_approval,
        ("approval_reference", "reviewer", "approved_at"),
        "privacy_review",
    )

    source_export = _object(document["source_export"], "source_export", _SOURCE_EXPORT_KEYS)
    export_approval_id = _string(source_export["approval_id"], "source_export.approval_id")
    export_sha256 = _string(source_export["sha256"], "source_export.sha256")
    if _SHA256_PATTERN.fullmatch(export_sha256) is None:
        raise FieldInpEvidenceError("source_export.sha256 must be a lowercase SHA-256 digest")
    export_reference = _string(source_export["reference"], "source_export.reference")
    if source_export_sha256 is None:
        raise FieldInpEvidenceError(
            "source export SHA-256 must be supplied by the validator caller"
        )
    if source_export_sha256 != export_sha256:
        raise FieldInpEvidenceError("source export bytes do not match source_export.sha256")

    export_approval = _find_approval(approved_exports, export_approval_id, "source_export")
    _match_exact_fields(
        {"sha256": export_sha256, "reference": export_reference},
        export_approval,
        ("sha256", "reference"),
        "source_export",
    )
    expected_export_fields: dict[str, object] = {
        "source_approval_id": source_approval_id,
        "deployment_approval_id": deployment_approval_id,
        "privacy_approval_id": privacy_approval_id,
        "observation_start": window["start"],
        "observation_end": window["end"],
        "sample_count": count,
        "aggregation_metric": aggregation["metric"],
        "aggregation_statistic": aggregation["statistic"],
        "aggregation_value_ms": value_ms,
        "segmentation_scope": segmentation["scope"],
        "segmentation_description": segmentation["description"],
    }
    _match_exact_fields(
        expected_export_fields,
        export_approval,
        (
            "source_approval_id",
            "deployment_approval_id",
            "privacy_approval_id",
            "observation_start",
            "observation_end",
            "sample_count",
            "aggregation_metric",
            "aggregation_statistic",
            "aggregation_value_ms",
            "segmentation_scope",
            "segmentation_description",
        ),
        "source_export",
    )

    references = document["evidence_references"]
    if not isinstance(references, list) or not references:
        raise FieldInpEvidenceError("evidence_references must be a non-empty list")
    for index, reference in enumerate(references):
        _string(reference, f"evidence_references[{index}]")
    if export_reference not in references:
        raise FieldInpEvidenceError(
            "source_export.reference must be present in evidence_references"
        )

    return document


def _canonical_bytes(document: dict[str, object]) -> bytes:
    return (json.dumps(document, indent=2, ensure_ascii=False) + "\n").encode()


def _open_output_parent_no_follow(
    requested: Path,
    *,
    repository_root: Path = REPOSITORY_ROOT,
    tracked_output: Path = TRACKED_OUTPUT,
) -> tuple[int, str]:
    requested_absolute = Path(os.path.abspath(requested))
    tracked_absolute = Path(os.path.abspath(tracked_output))
    if requested_absolute != tracked_absolute:
        raise FieldInpEvidenceError(
            "--output may only write data/audits/phase-8d-field-inp-v1.json"
        )

    root_absolute = Path(os.path.abspath(repository_root))
    try:
        relative = tracked_absolute.relative_to(root_absolute)
    except ValueError as exc:
        raise FieldInpEvidenceError(
            "tracked field-INP output must remain inside the repository"
        ) from exc

    directory_flags = os.O_RDONLY | os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        directory_flags |= os.O_NONBLOCK

    try:
        current_fd = os.open(root_absolute, directory_flags)
    except OSError as exc:
        raise FieldInpEvidenceError(
            f"could not open repository root safely for tracked output: {exc}"
        ) from exc

    try:
        for part in relative.parts[:-1]:
            try:
                next_fd = os.open(part, directory_flags, dir_fd=current_fd)
            except OSError as exc:
                raise FieldInpEvidenceError(
                    "tracked field-INP output parents must be real directories without symlinks"
                ) from exc
            os.close(current_fd)
            current_fd = next_fd
        return current_fd, relative.name
    except Exception:
        os.close(current_fd)
        raise


def _write_tracked_output(
    document: dict[str, object],
    requested: Path,
    *,
    repository_root: Path = REPOSITORY_ROOT,
    tracked_output: Path = TRACKED_OUTPUT,
) -> None:
    parent_fd, target_name = _open_output_parent_no_follow(
        requested,
        repository_root=repository_root,
        tracked_output=tracked_output,
    )
    temporary_name = f".{target_name}.{secrets.token_hex(8)}.tmp"
    temporary_fd: int | None = None
    temporary_created = False
    try:
        temporary_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            temporary_flags |= os.O_NOFOLLOW
        temporary_fd = os.open(
            temporary_name,
            temporary_flags,
            0o600,
            dir_fd=parent_fd,
        )
        temporary_created = True
        payload = _canonical_bytes(document)
        view = memoryview(payload)
        while view:
            written = os.write(temporary_fd, view)
            if written <= 0:
                raise FieldInpEvidenceError("could not write tracked field-INP evidence atomically")
            view = view[written:]
        os.fsync(temporary_fd)
        os.close(temporary_fd)
        temporary_fd = None

        try:
            target_stat = os.stat(target_name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            target_stat = None
        if target_stat is not None and stat.S_ISLNK(target_stat.st_mode):
            raise FieldInpEvidenceError("tracked field-INP output must not be a symlink")

        os.replace(
            temporary_name,
            target_name,
            src_dir_fd=parent_fd,
            dst_dir_fd=parent_fd,
        )
        temporary_created = False
        os.fsync(parent_fd)
    finally:
        if temporary_fd is not None:
            os.close(temporary_fd)
        if temporary_created:
            with suppress(FileNotFoundError):
                os.unlink(temporary_name, dir_fd=parent_fd)
        os.close(parent_fd)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Validate aggregate Phase 8D field-INP evidence without adding runtime telemetry "
            "to Lumina."
        )
    )
    parser.add_argument("--input", required=True, type=Path, help="JSON evidence file to validate")
    parser.add_argument(
        "--source-export",
        required=True,
        type=Path,
        help=(
            "approved aggregate source-export file whose SHA-256 is frozen in the approval manifest"
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="optional tracked output; only data/audits/phase-8d-field-inp-v1.json is allowed",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    source_export_sha256 = _sha256_file(args.source_export)
    document = validate_field_inp_evidence(
        _load_json(args.input),
        source_export_sha256=source_export_sha256,
    )
    if args.output is not None:
        output = args.output if args.output.is_absolute() else REPOSITORY_ROOT / args.output
        _write_tracked_output(document, output)
    aggregation = cast(dict[str, object], document["aggregation"])
    population = cast(dict[str, object], document["sample_population"])
    print(
        "Phase 8D field-INP evidence valid: "
        f"status={document['status']}, statistic={aggregation['statistic']}, "
        f"value_ms={aggregation['value_ms']}, sample_count={population['count']}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FieldInpEvidenceError as exc:
        raise SystemExit(f"Phase 8D field-INP evidence invalid: {exc}") from exc
