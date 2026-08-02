"""Strict, immutable provenance manifest contracts and canonical JSON handling."""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StrictStr,
    TypeAdapter,
    ValidationError,
    field_serializer,
    field_validator,
)

_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,128}", re.ASCII)
_FIELD_PATH_SEGMENT_PATTERN = re.compile(r"[A-Za-z0-9_.-]{1,128}", re.ASCII)
_UTC_TIMESTAMP_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)"
)
_WINDOWS_DRIVE_PATTERN = re.compile(r"[A-Za-z]:")

_ERROR_MESSAGES = {
    "manifest.input_invalid": "The manifest input was invalid.",
    "manifest.json_invalid": "The manifest was not valid JSON.",
    "manifest.json_duplicate_key": "The manifest contained a duplicate JSON key.",
    "manifest.top_level_invalid": "The manifest top level was not an object.",
    "manifest.schema_invalid": "The manifest did not match its declared schema.",
}


class ManifestContractError(ValueError):
    """A stable, value-free error raised by the public manifest parser."""

    def __init__(self, code: str, *, field_path: str = "$") -> None:
        self.code = code
        self.safe_message = _ERROR_MESSAGES[code]
        self.field_path = field_path
        super().__init__(f"{self.code}: {self.safe_message} Field: {self.field_path}.")

    def __repr__(self) -> str:
        """Keep raw manifest values and parser exceptions out of diagnostics."""
        return f"ManifestContractError(code={self.code!r}, field_path={self.field_path!r})"


class _DuplicateJsonKey(ValueError):
    """Internal sentinel that deliberately retains no duplicate key value."""


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateJsonKey()
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def _validate_token(value: str) -> str:
    if _TOKEN_PATTERN.fullmatch(value) is None:
        raise ValueError("invalid token")
    return value


def _contains_disallowed_character(value: str) -> bool:
    return any(unicodedata.category(character) in {"Cc", "Cs"} for character in value)


def _validate_text(value: str) -> str:
    if not value or value != value.strip() or _contains_disallowed_character(value):
        raise ValueError("invalid text")
    return value


def _validate_opaque_text(value: str) -> str:
    if not value or value != value.strip() or _contains_disallowed_character(value):
        raise ValueError("invalid opaque text")
    return value


def _validate_http_url(value: str) -> str:
    if not value or value != value.strip() or _contains_disallowed_character(value):
        raise ValueError("invalid URL")
    if any(character.isspace() for character in value) or "\\" in value:
        raise ValueError("invalid URL")
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError as error:
        raise ValueError("invalid URL") from error
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or hostname is None
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("invalid URL")
    return value


def _validate_repository_path(value: str) -> str:
    if (
        not value
        or value != value.strip()
        or _contains_disallowed_character(value)
        or "\\" in value
        or value.startswith("/")
        or _WINDOWS_DRIVE_PATTERN.match(value) is not None
    ):
        raise ValueError("invalid repository path")
    segments = value.split("/")
    if any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError("invalid repository path")
    return value


def _validate_path_or_url(value: str) -> str:
    if value.startswith(("http://", "https://")):
        return _validate_http_url(value)
    return _validate_repository_path(value)


def _parse_utc_timestamp(value: object) -> object:
    if isinstance(value, str):
        if _UTC_TIMESTAMP_PATTERN.fullmatch(value) is None:
            raise ValueError("invalid UTC timestamp")
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("invalid UTC timestamp") from error
    return value


def _validate_utc_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("timestamp must use UTC")
    return value.astimezone(UTC)


def _serialize_utc_timestamp(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _compact_short_scalar_arrays(serialized: str) -> str:
    """Match repository JSON formatting for short top-level scalar arrays."""
    lines = serialized.splitlines()
    output: list[str] = []
    index = 0
    while index < len(lines):
        opening = lines[index]
        if not opening.rstrip().endswith("["):
            output.append(opening)
            index += 1
            continue
        closing_index = index + 1
        while closing_index < len(lines) and lines[closing_index].strip() not in {"]", "],"}:
            closing_index += 1
        if closing_index >= len(lines):
            output.append(opening)
            index += 1
            continue
        try:
            candidate_values = json.loads(
                "\n".join(lines[index : closing_index + 1]).split(":", 1)[1].rstrip(",")
            )
        except (json.JSONDecodeError, IndexError):
            output.append(opening)
            index += 1
            continue
        if not isinstance(candidate_values, list) or any(
            isinstance(value, (dict, list)) for value in candidate_values
        ):
            output.append(opening)
            index += 1
            continue
        prefix = opening[: opening.rfind("[")]
        compact_values = json.dumps(candidate_values, ensure_ascii=False)
        comma = "," if lines[closing_index].strip().endswith(",") else ""
        candidate = f"{prefix}{compact_values}{comma}"
        if len(candidate) <= 100:
            output.append(candidate)
            index = closing_index + 1
        else:
            output.append(opening)
            index += 1
    return "\n".join(output)


StableToken = Annotated[StrictStr, AfterValidator(_validate_token)]
NarrativeText = Annotated[StrictStr, AfterValidator(_validate_text)]
OpaqueText = Annotated[StrictStr, AfterValidator(_validate_opaque_text)]
HttpUrl = Annotated[StrictStr, AfterValidator(_validate_http_url)]
RepositoryPath = Annotated[StrictStr, AfterValidator(_validate_repository_path)]
RepositoryPathOrUrl = Annotated[StrictStr, AfterValidator(_validate_path_or_url)]
UtcTimestamp = Annotated[
    datetime,
    BeforeValidator(_parse_utc_timestamp),
    AfterValidator(_validate_utc_timestamp),
]
Capability = Literal["batch_fetch", "lookup"]


class _ManifestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class SourceManifest(_ManifestModel):
    """One source identity and its non-executable adapter documentation."""

    manifest_type: Literal["source"]
    manifest_schema_version: Literal[1]
    source_id: StableToken
    source_name: NarrativeText
    adapter_id: StableToken
    adapter_version: StableToken
    purpose: NarrativeText
    official_documentation_url: HttpUrl
    terms_or_licence_url: HttpUrl
    attribution_text: NarrativeText
    endpoint_or_base_url: HttpUrl | None
    authentication_method: NarrativeText
    contact_or_user_agent_requirement: NarrativeText | None
    rate_or_fair_use_constraints: NarrativeText
    source_schema_version: StableToken
    cache_ttl: NarrativeText
    refresh_schedule: NarrativeText
    observation_or_publication_time_policy: NarrativeText
    fetch_time_policy: NarrativeText
    normalized_fields: tuple[StableToken, ...]
    failure_and_fallback_behaviour: NarrativeText
    fixture_and_checksum_strategy: NarrativeText
    known_limitations: tuple[NarrativeText, ...]
    last_verified_at: UtcTimestamp
    capabilities: tuple[Capability, ...]

    @field_validator("normalized_fields", "capabilities")
    @classmethod
    def _validate_set_like_collection(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("duplicate set-like collection member")
        return tuple(sorted(value))

    @field_serializer("last_verified_at", when_used="json")
    def _serialize_last_verified_at(self, value: datetime) -> str:
        return _serialize_utc_timestamp(value)


class DataManifest(_ManifestModel):
    """One exact fictional or approved dataset release tied to one source."""

    manifest_type: Literal["data"]
    manifest_schema_version: Literal[1]
    source_id: StableToken
    dataset_id: StableToken
    release_version: StableToken
    official_url: HttpUrl
    documentation_url: HttpUrl
    terms_or_licence: NarrativeText
    citation: NarrativeText
    retrieved_at: UtcTimestamp
    coverage: NarrativeText
    local_file: RepositoryPath | None
    checksum: NarrativeText | None
    parser_version: StableToken
    usage_notes: NarrativeText

    @field_serializer("retrieved_at", when_used="json")
    def _serialize_retrieved_at(self, value: datetime) -> str:
        return _serialize_utc_timestamp(value)


class AssetManifest(_ManifestModel):
    """One independently attributed media or repository asset."""

    manifest_type: Literal["asset"]
    manifest_schema_version: Literal[1]
    id: StableToken
    title: NarrativeText
    asset_type: NarrativeText
    local_path_or_url: RepositoryPathOrUrl
    source_page: HttpUrl
    creator: NarrativeText
    credit_line: NarrativeText
    licence: NarrativeText
    licence_url: HttpUrl | None
    usage_notes: NarrativeText
    modifications: tuple[NarrativeText, ...]
    downloaded_at: UtcTimestamp | None
    checksum: NarrativeText | None
    entity_ids: tuple[OpaqueText, ...]
    review_status: NarrativeText

    @field_serializer("downloaded_at", when_used="json")
    def _serialize_downloaded_at(self, value: datetime | None) -> str | None:
        return None if value is None else _serialize_utc_timestamp(value)


Manifest = Annotated[
    SourceManifest | DataManifest | AssetManifest,
    Field(discriminator="manifest_type"),
]
MANIFEST_ADAPTER: TypeAdapter[Manifest] = TypeAdapter(Manifest)


def _safe_field_path(error: ValidationError) -> str:
    first_error = error.errors(include_url=False, include_context=False, include_input=False)[0]
    if first_error.get("type") in {"union_tag_invalid", "union_tag_not_found"}:
        return "manifest_type"
    location = first_error.get("loc", ())
    if not location:
        return "$"
    segments: list[str] = []
    for segment in location:
        if segment in {"source", "data", "asset"}:
            continue
        rendered = str(segment)
        if _FIELD_PATH_SEGMENT_PATTERN.fullmatch(rendered) is None:
            return "$"
        segments.append(rendered)
    return ".".join(segments) or "$"


def parse_manifest_json(content: bytes | str) -> Manifest:
    """Parse untrusted JSON into one strict manifest without leaking its values."""
    if not isinstance(content, (bytes, str)):
        raise ManifestContractError("manifest.input_invalid")
    try:
        text = content.decode("utf-8") if isinstance(content, bytes) else content
    except UnicodeDecodeError as error:
        raise ManifestContractError("manifest.json_invalid") from error
    try:
        decoded = json.loads(
            text,
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_json_constant,
        )
    except _DuplicateJsonKey as error:
        raise ManifestContractError("manifest.json_duplicate_key") from error
    except (json.JSONDecodeError, ValueError) as error:
        raise ManifestContractError("manifest.json_invalid") from error
    if not isinstance(decoded, dict):
        raise ManifestContractError("manifest.top_level_invalid")
    try:
        validation_json = json.dumps(
            decoded,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return MANIFEST_ADAPTER.validate_json(validation_json, strict=True)
    except (TypeError, ValueError, ValidationError) as error:
        field_path = _safe_field_path(error) if isinstance(error, ValidationError) else "$"
        raise ManifestContractError(
            "manifest.schema_invalid",
            field_path=field_path,
        ) from error


def serialize_manifest(manifest: Manifest) -> bytes:
    """Serialize a validated manifest using the repository's canonical JSON bytes."""
    if not isinstance(manifest, (SourceManifest, DataManifest, AssetManifest)):
        raise ManifestContractError("manifest.input_invalid")
    document = manifest.model_dump(mode="json")
    try:
        serialized = json.dumps(
            document,
            allow_nan=False,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise ManifestContractError("manifest.input_invalid") from error
    return f"{_compact_short_scalar_arrays(serialized)}\n".encode()
