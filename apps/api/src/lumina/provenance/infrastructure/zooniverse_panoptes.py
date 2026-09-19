"""Fixed, bounded Zooniverse Panoptes project-status provider adapter."""

from __future__ import annotations

import json
import pkgutil
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Final, Protocol

from lumina.provenance.domain.citizen_science import (
    PANOPTES_COMPONENT_IDS,
    PANOPTES_NORMALIZED_FIELDS,
    PANOPTES_PROJECT_IDENTITIES,
    PanoptesCodec,
    PanoptesNormalized,
    PanoptesProjectStatus,
    PanoptesSourceEvidence,
)
from lumina.provenance.domain.manifests import SourceManifest, parse_manifest_json
from lumina.provenance.domain.provider import (
    ProviderBatchAdapter,
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from lumina.provenance.domain.request_plan import (
    ProviderComponentResult,
    ProviderRequestComponent,
    ProviderRequestPlan,
)
from lumina.provenance.domain.runtime import (
    PANOPTES_ACCEPT,
    PANOPTES_ADAPTER_ID,
    PANOPTES_ADAPTER_VERSION,
    PANOPTES_BASE_PATH,
    PANOPTES_COMPONENT_MAX_RESPONSE_BYTES,
    PANOPTES_CONTENT_TYPE,
    PANOPTES_HOST,
    PANOPTES_MAX_TOTAL_RESPONSE_BYTES,
    PANOPTES_PROVIDER_CODE,
    PANOPTES_SOURCE_SCHEMA_VERSION,
    PANOPTES_USER_AGENT,
    RawProviderResponse,
)

from .http import FixedHttpRequest

SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/zooniverse-panoptes.json"
_OPERATION: Final = "batch_fetch"
_MAX_JSON_DEPTH: Final = 16
_MAX_JSON_OBJECT_KEYS: Final = 128
_MAX_JSON_ARRAY_LENGTH: Final = 256
_IDENTITY_BY_COMPONENT: Final = {
    component_id: (project_id, slug)
    for component_id, project_id, slug in PANOPTES_PROJECT_IDENTITIES
}


def _find_repository_root(start: Path) -> Path | None:
    for parent in (start, *start.parents):
        if (parent / SOURCE_MANIFEST_PATH).is_file():
            return parent
    return None


REPOSITORY_ROOT: Final = _find_repository_root(Path(__file__).resolve())


@dataclass(frozen=True, slots=True)
class PanoptesComponentRequest:
    """One static direct-project request with no caller-controlled URL data."""

    component_id: str
    project_id: int
    slug: str
    path: str
    max_response_bytes: int

    def __post_init__(self) -> None:
        expected = _IDENTITY_BY_COMPONENT.get(self.component_id)
        if (
            expected is None
            or (self.project_id, self.slug) != expected
            or self.path != f"{PANOPTES_BASE_PATH}{self.project_id}"
            or self.max_response_bytes != PANOPTES_COMPONENT_MAX_RESPONSE_BYTES
        ):
            raise ProviderRequestRejected()

    def __repr__(self) -> str:
        return f"PanoptesComponentRequest(component_id={self.component_id!r})"


def zooniverse_panoptes_request_plan() -> ProviderRequestPlan:
    """Return the exact reviewed six-project request plan."""

    return ProviderRequestPlan(
        components=tuple(
            ProviderRequestComponent(
                component_id=component_id,
                request=PanoptesComponentRequest(
                    component_id=component_id,
                    project_id=project_id,
                    slug=slug,
                    path=f"{PANOPTES_BASE_PATH}{project_id}",
                    max_response_bytes=PANOPTES_COMPONENT_MAX_RESPONSE_BYTES,
                ),
                max_response_bytes=PANOPTES_COMPONENT_MAX_RESPONSE_BYTES,
            )
            for component_id, project_id, slug in PANOPTES_PROJECT_IDENTITIES
        ),
        max_total_response_bytes=PANOPTES_MAX_TOTAL_RESPONSE_BYTES,
        checksum_domain="LUMINA-PANOPTES-SNAPSHOT-V1",
    )


class PanoptesTransport(Protocol):
    """One-attempt fixed HTTP transport used by the Panoptes adapter."""

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        """Execute one HTTPS request within the provider cycle deadline."""
        ...


class ZooniversePanoptesAdapter(ProviderBatchAdapter):
    """Fetch and validate exactly the six approved public project records."""

    def __init__(self, transport: PanoptesTransport, *, source_manifest: SourceManifest) -> None:
        self._transport = transport
        self._source_manifest = source_manifest
        if (
            source_manifest.source_id != PANOPTES_PROVIDER_CODE
            or source_manifest.adapter_id != PANOPTES_ADAPTER_ID
            or source_manifest.adapter_version != PANOPTES_ADAPTER_VERSION
            or source_manifest.source_schema_version != PANOPTES_SOURCE_SCHEMA_VERSION
            or source_manifest.capabilities != (_OPERATION,)
            or source_manifest.normalized_fields != tuple(sorted(PANOPTES_NORMALIZED_FIELDS))
            or source_manifest.endpoint_or_base_url
            != f"https://{PANOPTES_HOST}{PANOPTES_BASE_PATH}"
        ):
            raise ValueError("Zooniverse Panoptes source manifest is incompatible with the adapter")

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the reviewed immutable Panoptes source identity."""

        return self._source_manifest

    @property
    def codec(self) -> PanoptesCodec:
        """Return the strict normalized cache codec owned by this adapter."""

        return PanoptesCodec()

    async def fetch(
        self,
        request: object,
        *,
        attempt_deadline: float | None = None,
    ) -> object:
        """Issue one exact direct-project request through the shared bounded transport."""

        if type(request) is not PanoptesComponentRequest:
            raise ProviderRequestRejected()
        return await self._transport.request(
            FixedHttpRequest(
                url=f"https://{PANOPTES_HOST}{request.path}",
                params=(),
                expected_content_type=PANOPTES_CONTENT_TYPE,
                max_response_bytes=request.max_response_bytes,
                user_agent=PANOPTES_USER_AGENT,
                accept_header=PANOPTES_ACCEPT,
            ),
            attempt_deadline=attempt_deadline,
        )

    def validate_payload(self, payload: object) -> object:
        """The shared batch seam supplies the component context for validation."""

        raise ProviderPayloadInvalid()

    def normalize(self, request: object, payload: object) -> object:
        """The shared batch seam supplies the component context for normalization."""

        del request, payload
        raise ProviderNormalizationFailed()

    def validate_component_payload(self, request: object, payload: object) -> object:
        """Parse one exact project row after bounded transport validation."""

        if type(request) is not PanoptesComponentRequest or not isinstance(
            payload, RawProviderResponse
        ):
            raise ProviderPayloadInvalid()
        if (
            payload.status_code != 200
            or not payload.raw_complete
            or not payload.content_type_valid
            or payload.max_response_bytes != request.max_response_bytes
        ):
            raise ProviderPayloadInvalid()
        try:
            decoded = _parse_json(payload.body)
            return _parse_project(request, decoded)
        except (TypeError, ValueError, RecursionError, UnicodeDecodeError):
            raise ProviderPayloadInvalid() from None

    def normalize_component(self, request: object, payload: object) -> object:
        """Return the already strict project-status DTO without source prose."""

        if (
            type(request) is not PanoptesComponentRequest
            or type(payload) is not PanoptesProjectStatus
        ):
            raise ProviderNormalizationFailed()
        if payload.component_id != request.component_id:
            raise ProviderNormalizationFailed()
        return payload


def compose_panoptes_snapshot(
    plan: ProviderRequestPlan,
    results: tuple[ProviderComponentResult, ...],
) -> PanoptesNormalized:
    """Compose exactly one complete ordered set of six validated project results."""

    if plan.component_ids != PANOPTES_COMPONENT_IDS or len(results) != len(PANOPTES_COMPONENT_IDS):
        raise ProviderNormalizationFailed()
    by_id = {result.component_id: result for result in results}
    if tuple(by_id) != PANOPTES_COMPONENT_IDS:
        raise ProviderNormalizationFailed()
    projects: list[PanoptesProjectStatus] = []
    evidence: list[PanoptesSourceEvidence] = []
    for component_id in PANOPTES_COMPONENT_IDS:
        result = by_id[component_id]
        if type(result.normalized) is not PanoptesProjectStatus:
            raise ProviderNormalizationFailed()
        projects.append(result.normalized)
        evidence.append(
            PanoptesSourceEvidence(
                component_id=component_id,
                raw_sha256=result.raw_sha256,
            )
        )
    normalized = PanoptesNormalized(
        projects=tuple(projects),
        source_evidence=tuple(evidence),
    )
    try:
        PanoptesCodec().encode(normalized)
    except ValueError:
        raise ProviderNormalizationFailed() from None
    return normalized


def _parse_json(body: bytes) -> object:
    decoded = json.loads(
        body.decode("utf-8", errors="strict"),
        object_pairs_hook=_object_without_duplicate_keys,
        parse_constant=_reject_json_constant,
    )
    _walk_json(decoded, depth=0)
    return decoded


def _walk_json(value: object, *, depth: int) -> None:
    if depth > _MAX_JSON_DEPTH:
        raise ValueError("Panoptes JSON nesting is too deep")
    if isinstance(value, Mapping):
        if len(value) > _MAX_JSON_OBJECT_KEYS:
            raise ValueError("Panoptes JSON object is too large")
        for key, item in value.items():
            if type(key) is not str:
                raise ValueError("Panoptes JSON key is invalid")
            _walk_json(item, depth=depth + 1)
    elif isinstance(value, list):
        if len(value) > _MAX_JSON_ARRAY_LENGTH:
            raise ValueError("Panoptes JSON array is too large")
        for item in value:
            _walk_json(item, depth=depth + 1)


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def _parse_project(
    request: PanoptesComponentRequest,
    value: object,
) -> PanoptesProjectStatus:
    if not isinstance(value, Mapping):
        raise ValueError("Panoptes envelope is not an object")
    projects = value.get("projects")
    if not isinstance(projects, list) or len(projects) != 1:
        raise ValueError("Panoptes direct-project envelope is invalid")
    project = projects[0]
    if not isinstance(project, Mapping):
        raise ValueError("Panoptes project row is invalid")
    project_id = project.get("id")
    slug = project.get("slug")
    private = project.get("private")
    live = project.get("live")
    updated_at = project.get("updated_at")
    if (
        type(project_id) is not str
        or project_id != str(request.project_id)
        or type(slug) is not str
        or slug != request.slug
        or type(private) is not bool
        or type(live) is not bool
        or type(updated_at) is not str
    ):
        raise ValueError("Panoptes project identity/status is invalid")
    _validate_utc(updated_at)
    return PanoptesProjectStatus(
        component_id=request.component_id,
        project_id=request.project_id,
        slug=request.slug,
        private=private,
        live=live,
        updated_at=updated_at,
    )


def _validate_utc(value: str) -> None:
    if not value.endswith("Z") or len(value) > 32:
        raise ValueError("Panoptes updated_at is invalid")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise ValueError("Panoptes updated_at is invalid") from None
    offset = parsed.utcoffset()
    if offset is None or offset.total_seconds() != 0:
        raise ValueError("Panoptes updated_at is invalid")


def load_zooniverse_panoptes_source_manifest(
    repository_root: Path | None = REPOSITORY_ROOT,
) -> SourceManifest:
    """Load the reviewed Zooniverse Panoptes documentary manifest."""

    manifest_bytes: bytes | None = None
    if repository_root is not None:
        try:
            manifest_bytes = (repository_root / SOURCE_MANIFEST_PATH).read_bytes()
        except OSError:
            manifest_bytes = None
    if manifest_bytes is None:
        try:
            manifest_bytes = pkgutil.get_data(
                "lumina",
                "data/manifests/sources/zooniverse-panoptes.json",
            )
        except (ImportError, OSError):
            raise ValueError("Zooniverse Panoptes source manifest is unavailable") from None
    if manifest_bytes is None:
        raise ValueError("Zooniverse Panoptes source manifest is unavailable")
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError("Zooniverse Panoptes source manifest is unavailable") from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError("Zooniverse Panoptes source manifest is unavailable")
    return manifest


__all__ = [
    "PanoptesComponentRequest",
    "PanoptesTransport",
    "REPOSITORY_ROOT",
    "SOURCE_MANIFEST_PATH",
    "ZooniversePanoptesAdapter",
    "compose_panoptes_snapshot",
    "load_zooniverse_panoptes_source_manifest",
    "zooniverse_panoptes_request_plan",
]
