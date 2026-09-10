"""Composition boundary for the statically approved Phase 4A provider."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from lumina.jobs.application.handlers import StaticHandlerRegistry, production_handler_registry
from lumina.provenance.application.job_handler import ProviderSyncHandler
from lumina.provenance.application.read import CachedProviderSnapshotReader, ProviderSnapshotReader
from lumina.provenance.application.registry import ProviderRegistration, StaticProviderRegistry
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.domain.runtime import (
    ADAPTER_ID,
    ADAPTER_VERSION,
    APOD_ADAPTER_ID,
    APOD_ADAPTER_VERSION,
    APOD_CACHE_KEY,
    APOD_CONTENT_TYPE,
    APOD_FORMAT,
    APOD_FRESH_TTL,
    APOD_HOST,
    APOD_PATH,
    APOD_PROVIDER_CODE,
    APOD_SOURCE_SCHEMA_VERSION,
    APOD_STALE_IF_ERROR_GRACE,
    APOD_SUCCESS_REFRESH_INTERVAL,
    APOD_USER_AGENT,
    CACHE_KEY,
    FIXED_FORMAT,
    FIXED_HOST,
    FIXED_PATH,
    FIXED_QUERY,
    PROVIDER_CODE,
    SOURCE_SCHEMA_VERSION,
    HttpTimeoutPolicy,
    ProviderRuntimeConfig,
)
from lumina.provenance.infrastructure.http import BoundedHttpTransport
from lumina.provenance.infrastructure.nasa_apod import (
    NasaApodAdapter,
    NasaApodRequest,
    load_nasa_apod_source_manifest,
)
from lumina.provenance.infrastructure.nasa_exoplanet_archive import (
    NasaCountCodec,
    NasaCountRequest,
    NasaExoplanetArchiveAdapter,
    load_nasa_source_manifest,
)
from lumina.provenance.infrastructure.postgresql.runtime import PostgreSqlProviderRuntimeStore


@dataclass(frozen=True, slots=True)
class ProviderComposition:
    """Concrete provider services and handler registry assembled for one process."""

    registry: StaticProviderRegistry
    sync_service: ProviderSyncService
    snapshot_reader: ProviderSnapshotReader
    handler_registry: StaticHandlerRegistry


def nasa_runtime_config(*, repository_root: Path | None = None) -> ProviderRuntimeConfig:
    """Build the immutable code-owned NASA policy after loading its reviewed manifest."""
    source_manifest = load_nasa_source_manifest(repository_root)
    return ProviderRuntimeConfig(
        provider_code=PROVIDER_CODE,
        adapter_id=ADAPTER_ID,
        adapter_version=ADAPTER_VERSION,
        cache_key=CACHE_KEY,
        source_schema_version=SOURCE_SCHEMA_VERSION,
        source_manifest=source_manifest,
        endpoint_host=FIXED_HOST,
        endpoint_path=FIXED_PATH,
        query=FIXED_QUERY,
        output_format=FIXED_FORMAT,
        timeout=HttpTimeoutPolicy(),
    )


def nasa_apod_runtime_config(*, repository_root: Path | None = None) -> ProviderRuntimeConfig:
    """Build the immutable APOD policy after loading its reviewed manifest."""
    source_manifest = load_nasa_apod_source_manifest(repository_root)
    return ProviderRuntimeConfig(
        provider_code=APOD_PROVIDER_CODE,
        adapter_id=APOD_ADAPTER_ID,
        adapter_version=APOD_ADAPTER_VERSION,
        cache_key=APOD_CACHE_KEY,
        source_schema_version=APOD_SOURCE_SCHEMA_VERSION,
        source_manifest=source_manifest,
        endpoint_host=APOD_HOST,
        endpoint_path=APOD_PATH,
        query="",
        output_format=APOD_FORMAT,
        timeout=HttpTimeoutPolicy(),
        refresh_interval=APOD_SUCCESS_REFRESH_INTERVAL,
        fresh_ttl=APOD_FRESH_TTL,
        stale_if_error_grace=APOD_STALE_IF_ERROR_GRACE,
        expected_content_type=APOD_CONTENT_TYPE,
        user_agent=APOD_USER_AGENT,
    )


def production_provider_registry(
    *, repository_root: Path | None = None, nasa_api_key: SecretStr | None = None
) -> StaticProviderRegistry:
    """Construct the exact production registrations without performing network I/O."""
    exoplanet_config = nasa_runtime_config(repository_root=repository_root)
    apod_config = nasa_apod_runtime_config(repository_root=repository_root)
    exoplanet_adapter = NasaExoplanetArchiveAdapter(
        BoundedHttpTransport(timeout=exoplanet_config.timeout),
        source_manifest=exoplanet_config.source_manifest,
    )
    apod_adapter = NasaApodAdapter(
        BoundedHttpTransport(timeout=apod_config.timeout),
        api_key=nasa_api_key,
        source_manifest=apod_config.source_manifest,
    )
    return StaticProviderRegistry(
        {
            PROVIDER_CODE: ProviderRegistration(
                config=exoplanet_config,
                adapter=exoplanet_adapter,
                request_factory=NasaCountRequest,
                payload_codec=NasaCountCodec(),
            ),
            APOD_PROVIDER_CODE: ProviderRegistration(
                config=apod_config,
                adapter=apod_adapter,
                request_factory=NasaApodRequest,
                payload_codec=apod_adapter.codec,
                check_replacement=True,
                configuration_check=apod_adapter.is_configured,
            ),
        }
    )


def compose_provider_runtime(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    repository_root: Path | None = None,
    nasa_api_key: SecretStr | None = None,
) -> ProviderComposition:
    """Wire concrete provider infrastructure into application services once."""
    registry = production_provider_registry(
        repository_root=repository_root,
        nasa_api_key=nasa_api_key,
    )
    store = PostgreSqlProviderRuntimeStore(session_factory)
    sync_service = ProviderSyncService(
        registry=registry,
        store=store,
    )
    snapshot_reader = CachedProviderSnapshotReader(registry=registry, store=store)
    provider_handler = ProviderSyncHandler(sync_service)
    handler_registry = production_handler_registry(
        provider_sync=provider_handler,
        provider_sync_validator=provider_handler.validate_payload,
    )
    return ProviderComposition(
        registry=registry,
        sync_service=sync_service,
        snapshot_reader=snapshot_reader,
        handler_registry=handler_registry,
    )


__all__ = [
    "ProviderComposition",
    "compose_provider_runtime",
    "nasa_runtime_config",
    "nasa_apod_runtime_config",
    "production_provider_registry",
]
