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


class FixtureHandler:
    def validate_payload(self, payload: PersistedJobPayload) -> None:
        del payload

    async def handle(self, payload: PersistedJobPayload) -> object:
        del payload
        return {"fixture": True}


def test_registry_copies_explicit_mapping_and_uses_exact_lookup() -> None:
    fixture = FixtureHandler()
    source = {"fixture.type": fixture}
    registry = StaticHandlerRegistry(source)
    source["fixture.other"] = fixture

    assert registry.resolve(PersistedJobTypeName("fixture.type")) is fixture
    assert registry.resolve(PersistedJobTypeName("Fixture.Type")) is None
    assert registry.registered_types == frozenset({"fixture.type"})


def test_production_registry_contains_exactly_internal_noop() -> None:
    registry = production_handler_registry()

    assert registry.registered_types == frozenset({"system.noop"})
    assert isinstance(
        registry.resolve(PersistedJobTypeName("system.noop")),
        SystemNoopHandler,
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
