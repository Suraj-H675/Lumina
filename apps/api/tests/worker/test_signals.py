"""Deterministic worker signal installation and restoration tests."""

from __future__ import annotations

import asyncio
import signal
from collections.abc import Callable

import pytest
from lumina.worker.signals import WorkerSignalError, install_signal_handlers


class RecordingRegistration:
    def __init__(self, *, fail_add: int | None = None, fail_restore: bool = False) -> None:
        self.fail_add = fail_add
        self.fail_restore = fail_restore
        self.callbacks: dict[int, Callable[[], None]] = {}
        self.captured: list[int] = []
        self.added: list[int] = []
        self.removed: list[int] = []
        self.restored: list[int] = []

    def capture(self, signal_number: int) -> object:
        self.captured.append(signal_number)
        return f"previous-{signal_number}"

    def add(self, signal_number: int, callback: Callable[[], None]) -> None:
        self.added.append(signal_number)
        if signal_number == self.fail_add:
            raise RuntimeError("private")
        self.callbacks[signal_number] = callback

    def remove(self, signal_number: int) -> bool:
        self.removed.append(signal_number)
        self.callbacks.pop(signal_number, None)
        return True

    def restore(self, signal_number: int, previous: object) -> None:
        del previous
        self.restored.append(signal_number)
        if self.fail_restore:
            raise RuntimeError("private")


def test_callbacks_only_set_one_event_and_are_idempotent() -> None:
    event = asyncio.Event()
    registration = RecordingRegistration()
    installed = install_signal_handlers(event, registration=registration)

    registration.callbacks[signal.SIGTERM]()
    registration.callbacks[signal.SIGTERM]()
    registration.callbacks[signal.SIGINT]()

    assert event.is_set()
    installed.restore()
    installed.restore()
    assert registration.removed == [signal.SIGTERM, signal.SIGINT]
    assert registration.restored == [signal.SIGINT, signal.SIGTERM]


def test_partial_install_rolls_back_without_platform_evidence() -> None:
    registration = RecordingRegistration(fail_add=signal.SIGTERM)

    with pytest.raises(WorkerSignalError) as failure:
        install_signal_handlers(asyncio.Event(), registration=registration)

    assert registration.removed == [signal.SIGINT]
    assert registration.restored == [signal.SIGINT, signal.SIGTERM]
    assert "private" not in repr(failure.value)


def test_restoration_failure_is_fixed_and_attempted_once() -> None:
    registration = RecordingRegistration(fail_restore=True)
    installed = install_signal_handlers(asyncio.Event(), registration=registration)

    with pytest.raises(WorkerSignalError):
        installed.restore()
    installed.restore()

    assert registration.restored == [signal.SIGINT, signal.SIGTERM]
