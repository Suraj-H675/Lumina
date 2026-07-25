"""Readiness-service safety and timeout behavior."""

from __future__ import annotations

import anyio
from lumina.shared.application.readiness import DatabaseReadinessService


class _HealthyProbe:
    async def probe(self) -> None:
        return None


class _UnavailableProbe:
    async def probe(self) -> None:
        raise OSError("private database detail")


def test_readiness_service_reports_success() -> None:
    assert anyio.run(DatabaseReadinessService(_HealthyProbe()).is_ready)


def test_readiness_service_normalizes_probe_failure() -> None:
    assert not anyio.run(DatabaseReadinessService(_UnavailableProbe()).is_ready)
