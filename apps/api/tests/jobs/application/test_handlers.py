"""Immutable registry and internal noop tests."""

from __future__ import annotations

from collections.abc import Mapping

import pytest
from lumina.jobs.application.handlers import (
    StaticHandlerRegistry,
    SystemNoopHandler,
    production_handler_registry,
)
from lumina.jobs.domain.handler import IncompatibleHandlerPayload
from lumina.jobs.domain.models import PersistedJobTypeName
from lumina.jobs.domain.payload import PersistedJobPayload
from lumina.provenance.application.job_handler import ProviderSyncHandler
from lumina.provenance.domain.runtime import PROVIDER_CODE, ProviderSyncOutcome


class FixtureHandler:
    def validate_payload(self, payload: PersistedJobPayload) -> None:
        del payload

    async def handle(self, payload: PersistedJobPayload) -> object:
        del payload
        return {"fixture": True}


class SyncServiceSpy:
    def __init__(self) -> None:
        self.provider_codes: list[str] = []

    async def sync(self, provider_code: str) -> object:
        self.provider_codes.append(provider_code)
        return type("Report", (), {"outcome": ProviderSyncOutcome.SUCCESS})()


def test_registry_copies_explicit_mapping_and_uses_exact_lookup() -> None:
    fixture = FixtureHandler()
    source = {"fixture.type": fixture}
    registry = StaticHandlerRegistry(source)
    source["fixture.other"] = fixture

    assert registry.resolve(PersistedJobTypeName("fixture.type")) is fixture
    assert registry.resolve(PersistedJobTypeName("Fixture.Type")) is None
    assert registry.registered_types == frozenset({"fixture.type"})


def test_production_registry_contains_exactly_approved_handlers() -> None:
    provider_sync = ProviderSyncHandler(SyncServiceSpy())
    registry = production_handler_registry(
        provider_sync=provider_sync,
        provider_sync_validator=provider_sync.validate_payload,
    )

    assert registry.registered_types == frozenset({"system.noop", "provider.sync"})
    assert isinstance(
        registry.resolve(PersistedJobTypeName("system.noop")),
        SystemNoopHandler,
    )
    assert isinstance(
        registry.resolve(PersistedJobTypeName("provider.sync")),
        ProviderSyncHandler,
    )


@pytest.mark.asyncio
async def test_noop_accepts_object_without_inspection_mutation_or_echo() -> None:
    source = {"secret": ["PAYLOAD-SENTINEL", {"nested": True}]}
    payload = PersistedJobPayload.from_decoded(source)
    handler = SystemNoopHandler()

    handler.validate_payload(payload)
    result = await handler.handle(payload)

    assert result == {}
    assert type(result) is dict
    assert isinstance(payload.value, Mapping)
    assert source == {"secret": ["PAYLOAD-SENTINEL", {"nested": True}]}
    assert "PAYLOAD-SENTINEL" not in repr(handler)


@pytest.mark.asyncio
@pytest.mark.parametrize("value", [[], "value", 42, 1.5, True, None])
async def test_noop_rejects_every_non_object_top_level(value: object) -> None:
    handler = SystemNoopHandler()
    payload = PersistedJobPayload.from_decoded(value)

    with pytest.raises(IncompatibleHandlerPayload):
        handler.validate_payload(payload)
    with pytest.raises(IncompatibleHandlerPayload):
        await handler.handle(payload)


def test_registry_and_handler_representations_are_redacted() -> None:
    sentinel = "FIXTURE-TYPE-REPRESENTATION-SENTINEL"
    registry = StaticHandlerRegistry({sentinel: FixtureHandler()})

    assert sentinel not in repr(registry)
    assert sentinel not in str(registry)
    assert sentinel not in repr(SystemNoopHandler())


@pytest.mark.asyncio
async def test_provider_sync_handler_requires_exact_payload_and_returns_handled_result() -> None:
    service = SyncServiceSpy()
    handler = ProviderSyncHandler(service)
    payload = PersistedJobPayload.from_decoded({"provider_code": PROVIDER_CODE})

    handler.validate_payload(payload)
    assert await handler.handle(payload) == {}
    assert service.provider_codes == [PROVIDER_CODE]

    for invalid in (
        {},
        {"provider_code": PROVIDER_CODE, "url": "https://private.invalid"},
        {"provider_code": "other-provider"},
    ):
        with pytest.raises(IncompatibleHandlerPayload):
            handler.validate_payload(PersistedJobPayload.from_decoded(invalid))
