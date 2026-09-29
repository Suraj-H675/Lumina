"""Fail-closed handling for obsolete queued identification jobs."""

from __future__ import annotations

import pytest
from lumina.identification.application.disabled import DisabledIdentificationHandler
from lumina.jobs.domain.handler import NonRetryableHandlerFailure
from lumina.jobs.domain.payload import PersistedJobPayload


@pytest.mark.asyncio
async def test_disabled_handler_rejects_persisted_work_without_inspection() -> None:
    handler = DisabledIdentificationHandler()
    payload = PersistedJobPayload.from_decoded({"private": "sentinel"})

    with pytest.raises(NonRetryableHandlerFailure):
        handler.validate_payload(payload)
    with pytest.raises(NonRetryableHandlerFailure):
        await handler.handle(payload)

    assert repr(handler) == "DisabledIdentificationHandler(<redacted>)"
