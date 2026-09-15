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
    CELESTRAK_ADAPTER_ID,
    CELESTRAK_ADAPTER_VERSION,
    CELESTRAK_CACHE_KEY,
    CELESTRAK_CONTENT_TYPE,
    CELESTRAK_FORMAT,
    CELESTRAK_FRESH_TTL,
    CELESTRAK_HOST,
    CELESTRAK_MAX_TOTAL_RESPONSE_BYTES,
    CELESTRAK_PATH,
    CELESTRAK_PROVIDER_CODE,
    CELESTRAK_SOURCE_SCHEMA_VERSION,
    CELESTRAK_STALE_IF_ERROR_GRACE,
    CELESTRAK_SUCCESS_REFRESH_INTERVAL,
    CELESTRAK_USER_AGENT,
    FIXED_FORMAT,
    FIXED_HOST,
    FIXED_PATH,
    FIXED_QUERY,
    LL2_ADAPTER_ID,
    LL2_ADAPTER_VERSION,
    LL2_CACHE_KEY,
    LL2_CONTENT_TYPE,
    LL2_FORMAT,
    LL2_FRESH_TTL,
    LL2_HOST,
    LL2_MAX_RESPONSE_BYTES,
    LL2_PATH,
    LL2_PROVIDER_CODE,
    LL2_SOURCE_SCHEMA_VERSION,
    LL2_STALE_IF_ERROR_GRACE,
    LL2_SUCCESS_REFRESH_INTERVAL,
    LL2_USER_AGENT,
    NEOWS_ADAPTER_ID,
    NEOWS_ADAPTER_VERSION,
    NEOWS_CACHE_KEY,
    NEOWS_CONTENT_TYPE,
    NEOWS_FORMAT,
    NEOWS_FRESH_TTL,
    NEOWS_HOST,
    NEOWS_MAX_RESPONSE_BYTES,
    NEOWS_PATH,
    NEOWS_PROVIDER_CODE,
    NEOWS_SOURCE_SCHEMA_VERSION,
    NEOWS_STALE_IF_ERROR_GRACE,
    NEOWS_SUCCESS_REFRESH_INTERVAL,
    NEOWS_USER_AGENT,
    PROVIDER_CODE,
    SOURCE_SCHEMA_VERSION,
    SWPC_ADAPTER_ID,
    SWPC_ADAPTER_VERSION,
    SWPC_BASE_PATH,
    SWPC_CACHE_KEY,
    SWPC_CONTENT_TYPE,
    SWPC_FRESH_TTL,
    SWPC_HOST,
    SWPC_MAX_TOTAL_RESPONSE_BYTES,
    SWPC_PROVIDER_CODE,
    SWPC_SOURCE_SCHEMA_VERSION,
    SWPC_STALE_IF_ERROR_GRACE,
    SWPC_SUCCESS_REFRESH_INTERVAL,
    SWPC_USER_AGENT,
    HttpTimeoutPolicy,
    ProviderRuntimeConfig,
)
from lumina.provenance.infrastructure.celestrak import (
    CelestrakAdapter,
    celestrak_request_plan,
    compose_celestrak_snapshot,
    load_celestrak_source_manifest,
)
from lumina.provenance.infrastructure.http import BoundedHttpTransport
from lumina.provenance.infrastructure.launch_library import (
    LaunchLibraryAdapter,
    LaunchLibraryRequest,
    load_launch_library_source_manifest,
)
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
from lumina.provenance.infrastructure.nasa_neows import (
    NasaNeowsAdapter,
    load_nasa_neows_source_manifest,
)
from lumina.provenance.infrastructure.noaa_swpc import (
    NoaaSwpcAdapter,
    compose_swpc_snapshot,
    load_noaa_swpc_source_manifest,
    noaa_swpc_request_plan,
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


def nasa_neows_runtime_config(*, repository_root: Path | None = None) -> ProviderRuntimeConfig:
    """Build the immutable NeoWs policy after loading its reviewed manifest."""
    source_manifest = load_nasa_neows_source_manifest(repository_root)
    return ProviderRuntimeConfig(
        provider_code=NEOWS_PROVIDER_CODE,
        adapter_id=NEOWS_ADAPTER_ID,
        adapter_version=NEOWS_ADAPTER_VERSION,
        cache_key=NEOWS_CACHE_KEY,
        source_schema_version=NEOWS_SOURCE_SCHEMA_VERSION,
        source_manifest=source_manifest,
        endpoint_host=NEOWS_HOST,
        endpoint_path=NEOWS_PATH,
        query="start_date,end_date,api_key",
        output_format=NEOWS_FORMAT,
        timeout=HttpTimeoutPolicy(),
        refresh_interval=NEOWS_SUCCESS_REFRESH_INTERVAL,
        fresh_ttl=NEOWS_FRESH_TTL,
        stale_if_error_grace=NEOWS_STALE_IF_ERROR_GRACE,
        max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
        expected_content_type=NEOWS_CONTENT_TYPE,
        user_agent=NEOWS_USER_AGENT,
    )


def noaa_swpc_runtime_config(*, repository_root: Path | None = None) -> ProviderRuntimeConfig:
    """Build the fixed NOAA SWPC atomic-snapshot policy."""
    source_manifest = load_noaa_swpc_source_manifest(repository_root)
    return ProviderRuntimeConfig(
        provider_code=SWPC_PROVIDER_CODE,
        adapter_id=SWPC_ADAPTER_ID,
        adapter_version=SWPC_ADAPTER_VERSION,
        cache_key=SWPC_CACHE_KEY,
        source_schema_version=SWPC_SOURCE_SCHEMA_VERSION,
        source_manifest=source_manifest,
        endpoint_host=SWPC_HOST,
        endpoint_path=SWPC_BASE_PATH,
        query="",
        output_format="json",
        timeout=HttpTimeoutPolicy(),
        refresh_interval=SWPC_SUCCESS_REFRESH_INTERVAL,
        fresh_ttl=SWPC_FRESH_TTL,
        stale_if_error_grace=SWPC_STALE_IF_ERROR_GRACE,
        max_response_bytes=SWPC_MAX_TOTAL_RESPONSE_BYTES,
        expected_content_type=SWPC_CONTENT_TYPE,
        user_agent=SWPC_USER_AGENT,
    )


def launch_library_runtime_config(*, repository_root: Path | None = None) -> ProviderRuntimeConfig:
    """Build the fixed Launch Library 2 upcoming-launch policy."""
    source_manifest = load_launch_library_source_manifest(repository_root)
    return ProviderRuntimeConfig(
        provider_code=LL2_PROVIDER_CODE,
        adapter_id=LL2_ADAPTER_ID,
        adapter_version=LL2_ADAPTER_VERSION,
        cache_key=LL2_CACHE_KEY,
        source_schema_version=LL2_SOURCE_SCHEMA_VERSION,
        source_manifest=source_manifest,
        endpoint_host=LL2_HOST,
        endpoint_path=LL2_PATH,
        query="format=json,limit=20,mode=detailed,ordering=net",
        output_format=LL2_FORMAT,
        timeout=HttpTimeoutPolicy(),
        refresh_interval=LL2_SUCCESS_REFRESH_INTERVAL,
        fresh_ttl=LL2_FRESH_TTL,
        stale_if_error_grace=LL2_STALE_IF_ERROR_GRACE,
        max_response_bytes=LL2_MAX_RESPONSE_BYTES,
        expected_content_type=LL2_CONTENT_TYPE,
        user_agent=LL2_USER_AGENT,
    )


def celestrak_runtime_config(*, repository_root: Path | None = None) -> ProviderRuntimeConfig:
    """Build the fixed selected-group CelesTrak OMM policy."""
    source_manifest = load_celestrak_source_manifest(repository_root)
    return ProviderRuntimeConfig(
        provider_code=CELESTRAK_PROVIDER_CODE,
        adapter_id=CELESTRAK_ADAPTER_ID,
        adapter_version=CELESTRAK_ADAPTER_VERSION,
        cache_key=CELESTRAK_CACHE_KEY,
        source_schema_version=CELESTRAK_SOURCE_SCHEMA_VERSION,
        source_manifest=source_manifest,
        endpoint_host=CELESTRAK_HOST,
        endpoint_path=CELESTRAK_PATH,
        query="GROUP=STATIONS|VISUAL,FORMAT=JSON",
        output_format=CELESTRAK_FORMAT,
        timeout=HttpTimeoutPolicy(),
        refresh_interval=CELESTRAK_SUCCESS_REFRESH_INTERVAL,
        fresh_ttl=CELESTRAK_FRESH_TTL,
        stale_if_error_grace=CELESTRAK_STALE_IF_ERROR_GRACE,
        max_response_bytes=CELESTRAK_MAX_TOTAL_RESPONSE_BYTES,
        expected_content_type=CELESTRAK_CONTENT_TYPE,
        user_agent=CELESTRAK_USER_AGENT,
    )


def production_provider_registry(
    *, repository_root: Path | None = None, nasa_api_key: SecretStr | None = None
) -> StaticProviderRegistry:
    """Construct the exact production registrations without performing network I/O."""
    exoplanet_config = nasa_runtime_config(repository_root=repository_root)
    apod_config = nasa_apod_runtime_config(repository_root=repository_root)
    neows_config = nasa_neows_runtime_config(repository_root=repository_root)
    swpc_config = noaa_swpc_runtime_config(repository_root=repository_root)
    ll2_config = launch_library_runtime_config(repository_root=repository_root)
    celestrak_config = celestrak_runtime_config(repository_root=repository_root)
    exoplanet_adapter = NasaExoplanetArchiveAdapter(
        BoundedHttpTransport(timeout=exoplanet_config.timeout),
        source_manifest=exoplanet_config.source_manifest,
    )
    apod_adapter = NasaApodAdapter(
        BoundedHttpTransport(timeout=apod_config.timeout),
        api_key=nasa_api_key,
        source_manifest=apod_config.source_manifest,
    )
    neows_adapter = NasaNeowsAdapter(
        BoundedHttpTransport(timeout=neows_config.timeout),
        api_key=nasa_api_key,
        source_manifest=neows_config.source_manifest,
    )
    swpc_adapter = NoaaSwpcAdapter(
        BoundedHttpTransport(timeout=swpc_config.timeout),
        source_manifest=swpc_config.source_manifest,
    )
    ll2_adapter = LaunchLibraryAdapter(
        BoundedHttpTransport(timeout=ll2_config.timeout),
        source_manifest=ll2_config.source_manifest,
    )
    celestrak_adapter = CelestrakAdapter(
        BoundedHttpTransport(timeout=celestrak_config.timeout),
        source_manifest=celestrak_config.source_manifest,
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
            NEOWS_PROVIDER_CODE: ProviderRegistration(
                config=neows_config,
                adapter=neows_adapter,
                request_factory=neows_adapter.new_request,
                payload_codec=neows_adapter.codec,
                check_replacement=True,
                configuration_check=neows_adapter.is_configured,
            ),
            SWPC_PROVIDER_CODE: ProviderRegistration(
                config=swpc_config,
                adapter=swpc_adapter,
                request_factory=noaa_swpc_request_plan,
                payload_codec=swpc_adapter.codec,
                snapshot_normalizer=compose_swpc_snapshot,
            ),
            LL2_PROVIDER_CODE: ProviderRegistration(
                config=ll2_config,
                adapter=ll2_adapter,
                request_factory=LaunchLibraryRequest,
                payload_codec=ll2_adapter.codec,
                check_replacement=True,
            ),
            CELESTRAK_PROVIDER_CODE: ProviderRegistration(
                config=celestrak_config,
                adapter=celestrak_adapter,
                request_factory=celestrak_request_plan,
                payload_codec=celestrak_adapter.codec,
                check_replacement=True,
                snapshot_normalizer=compose_celestrak_snapshot,
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
    "celestrak_runtime_config",
    "compose_provider_runtime",
    "launch_library_runtime_config",
    "nasa_runtime_config",
    "nasa_apod_runtime_config",
    "nasa_neows_runtime_config",
    "noaa_swpc_runtime_config",
    "production_provider_registry",
]
