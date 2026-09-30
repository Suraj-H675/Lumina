"""Deterministic provider snapshot reader for cache-only projection tests."""

from __future__ import annotations

from lumina.provenance.application.read import ProviderSnapshot, ProviderSnapshotReader


class DeterministicSnapshotReader(ProviderSnapshotReader):
    def __init__(self, snapshot: ProviderSnapshot | BaseException) -> None:
        self.snapshot = snapshot
        self.calls: list[str] = []

    async def read(self, provider_code: str) -> ProviderSnapshot:
        self.calls.append(provider_code)
        if isinstance(self.snapshot, BaseException):
            raise self.snapshot
        return self.snapshot
