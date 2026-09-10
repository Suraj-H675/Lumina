"""Fixed NASA Exoplanet Archive TAP adapter for the Phase 4A count probe."""

from __future__ import annotations

import csv
import pkgutil
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from typing import Final, Literal, Protocol

from lumina.provenance.domain.manifests import SourceManifest, parse_manifest_json
from lumina.provenance.domain.provider import (
    ProviderAdapter,
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from lumina.provenance.domain.runtime import (
    ADAPTER_ID,
    ADAPTER_VERSION,
    FIXED_FORMAT,
    FIXED_HOST,
    FIXED_PATH,
    FIXED_QUERY,
    PROVIDER_CODE,
    SOURCE_SCHEMA_VERSION,
    NormalizedPayload,
    RawProviderResponse,
)

from .http import FixedHttpRequest

SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/nasa-exoplanet-archive.json"
WIRE_HEADER: Final = "count(pl_name)"
_OPERATION: Final = "batch_fetch"
EXPECTED_CONTENT_TYPE: Final = "text/plain"


def _find_repository_root(start: Path) -> Path | None:
    for parent in (start, *start.parents):
        if (parent / SOURCE_MANIFEST_PATH).is_file():
            return parent
    return None


REPOSITORY_ROOT: Final = _find_repository_root(Path(__file__).resolve())


@dataclass(frozen=True, slots=True)
class NasaCountRequest:
    """The sole typed request accepted by the fixed adapter."""

    operation: Literal["batch_fetch"] = _OPERATION

    def __post_init__(self) -> None:
        if self.operation != _OPERATION:
            raise ProviderRequestRejected()


@dataclass(frozen=True, slots=True)
class NasaCountPayload:
    """Strict validated wire payload with the observed NASA CSV header."""

    count: int


class NasaTransport(Protocol):
    """One-attempt transport capability required by the NASA adapter."""

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        """Execute one fixed NASA request within the framework deadline."""
        ...


class NasaExoplanetArchiveAdapter(
    ProviderAdapter[NasaCountRequest, NasaCountPayload, NormalizedPayload]
):
    """Fetch and normalize exactly one current confirmed-planet count."""

    def __init__(
        self,
        transport: NasaTransport,
        *,
        source_manifest: SourceManifest,
    ) -> None:
        self._transport = transport
        self._source_manifest = source_manifest
        if (
            source_manifest.source_id != PROVIDER_CODE
            or source_manifest.adapter_id != ADAPTER_ID
            or source_manifest.adapter_version != ADAPTER_VERSION
            or source_manifest.source_schema_version != SOURCE_SCHEMA_VERSION
            or source_manifest.capabilities != (_OPERATION,)
            or source_manifest.normalized_fields != ("confirmed_planet_count",)
        ):
            raise ValueError("NASA provider source manifest is incompatible with the adapter")

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the reviewed immutable provenance identity."""
        return self._source_manifest

    async def fetch(
        self,
        request: object,
        *,
        attempt_deadline: float | None = None,
    ) -> object:
        """Issue the fixed TAP request through the injected transport."""
        if type(request) is not NasaCountRequest:
            raise ProviderRequestRejected()
        return await self._transport.request(
            FixedHttpRequest(
                url=f"https://{FIXED_HOST}{FIXED_PATH}",
                params=(("query", FIXED_QUERY), ("format", FIXED_FORMAT)),
                expected_content_type=EXPECTED_CONTENT_TYPE,
            ),
            attempt_deadline=attempt_deadline,
        )

    def validate_payload(self, payload: object) -> NasaCountPayload:
        """Require exactly one CSV header, one row, and one positive integer."""
        if not isinstance(payload, RawProviderResponse):
            raise ProviderPayloadInvalid()
        if payload.status_code != 200 or not payload.raw_complete or not payload.content_type_valid:
            raise ProviderPayloadInvalid()
        try:
            text = payload.body.decode("utf-8", errors="strict")
            rows = list(csv.reader(StringIO(text, newline=""), strict=True))
        except (UnicodeDecodeError, csv.Error, ValueError):
            raise ProviderPayloadInvalid() from None
        if len(rows) != 2 or rows[0] != [WIRE_HEADER] or len(rows[1]) != 1:
            raise ProviderPayloadInvalid()
        value = rows[1][0]
        if not value.isascii() or not value.isdecimal():
            raise ProviderPayloadInvalid()
        try:
            count = int(value, 10)
        except ValueError:
            raise ProviderPayloadInvalid() from None
        if count <= 0:
            raise ProviderPayloadInvalid()
        return NasaCountPayload(count=count)

    def normalize(self, request: object, payload: object) -> NormalizedPayload:
        """Return the Lumina-owned normalized field without exposing the wire header."""
        if (
            type(request) is not NasaCountRequest
            or type(payload) is not NasaCountPayload
            or type(payload.count) is not int
            or payload.count <= 0
        ):
            raise ProviderNormalizationFailed()
        return {"confirmed_planet_count": payload.count}


def load_nasa_source_manifest(
    repository_root: Path | None = REPOSITORY_ROOT,
) -> SourceManifest:
    """Load the reviewed documentary manifest from source or wheel resources."""
    manifest_bytes: bytes | None = None
    if repository_root is not None:
        try:
            manifest_bytes = (repository_root / SOURCE_MANIFEST_PATH).read_bytes()
        except OSError:
            manifest_bytes = None
    if manifest_bytes is None:
        try:
            manifest_bytes = pkgutil.get_data(
                "lumina", "data/manifests/sources/nasa-exoplanet-archive.json"
            )
        except (ImportError, OSError):
            raise ValueError("NASA provider source manifest is unavailable") from None
    if manifest_bytes is None:
        raise ValueError("NASA provider source manifest is unavailable") from None
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError("NASA provider source manifest is unavailable") from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError("NASA provider source manifest is unavailable")
    return manifest


__all__ = [
    "NasaCountPayload",
    "NasaCountRequest",
    "NasaExoplanetArchiveAdapter",
    "NasaTransport",
    "REPOSITORY_ROOT",
    "EXPECTED_CONTENT_TYPE",
    "SOURCE_MANIFEST_PATH",
    "WIRE_HEADER",
    "load_nasa_source_manifest",
]
