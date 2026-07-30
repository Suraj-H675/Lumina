"""Installation and exact restoration of worker shutdown signal handlers."""

from __future__ import annotations

import asyncio
import signal
from collections.abc import Callable
from contextlib import suppress
from typing import Protocol


class SignalRegistration(Protocol):
    """Injectable event-loop and process signal registration boundary."""

    def capture(self, signal_number: int) -> object:
        """Capture one prior process handler."""
        ...

    def add(self, signal_number: int, callback: Callable[[], None]) -> None:
        """Install one event-loop callback."""
        ...

    def remove(self, signal_number: int) -> bool:
        """Remove one event-loop callback."""
        ...

    def restore(self, signal_number: int, previous: object) -> None:
        """Restore one captured process handler."""
        ...


class _EventLoopSignalRegistration:
    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def capture(self, signal_number: int) -> object:
        return signal.getsignal(signal_number)

    def add(self, signal_number: int, callback: Callable[[], None]) -> None:
        self._loop.add_signal_handler(signal_number, callback)

    def remove(self, signal_number: int) -> bool:
        return self._loop.remove_signal_handler(signal_number)

    def restore(self, signal_number: int, previous: object) -> None:
        signal.signal(signal_number, previous)  # type: ignore[arg-type]


class WorkerSignalError(RuntimeError):
    """Fixed startup or cleanup failure without signal/platform evidence."""

    def __init__(self) -> None:
        super().__init__("Worker signal handling failed.")

    def __repr__(self) -> str:
        return "WorkerSignalError(<redacted>)"


class InstalledSignalHandlers:
    """Exactly-once restoration handle for installed worker callbacks."""

    def __init__(
        self,
        registration: SignalRegistration,
        previous: tuple[tuple[int, object], ...],
        installed: tuple[int, ...],
    ) -> None:
        self._registration = registration
        self._previous = previous
        self._installed = installed
        self._restored = False

    def restore(self) -> None:
        """Remove Lumina callbacks and restore every captured prior handler once."""
        if self._restored:
            return
        self._restored = True
        failed = False
        for signal_number in reversed(self._installed):
            try:
                self._registration.remove(signal_number)
            except (KeyboardInterrupt, SystemExit):
                raise
            except BaseException:
                failed = True
        for signal_number, previous in self._previous:
            try:
                self._registration.restore(signal_number, previous)
            except (KeyboardInterrupt, SystemExit):
                raise
            except BaseException:
                failed = True
        if failed:
            raise WorkerSignalError() from None

    def __repr__(self) -> str:
        return "InstalledSignalHandlers(<redacted>)"


def install_signal_handlers(
    shutdown_event: asyncio.Event,
    *,
    registration: SignalRegistration | None = None,
) -> InstalledSignalHandlers:
    """Install SIGINT/SIGTERM callbacks that only set one shutdown event."""
    if not isinstance(shutdown_event, asyncio.Event):
        raise WorkerSignalError()
    active_registration = registration or _EventLoopSignalRegistration(asyncio.get_running_loop())
    signal_numbers = (signal.SIGINT, signal.SIGTERM)
    captured: list[tuple[int, object]] = []
    installed: list[int] = []

    def request_shutdown() -> None:
        shutdown_event.set()

    try:
        for signal_number in signal_numbers:
            captured.append((signal_number, active_registration.capture(signal_number)))
        for signal_number in signal_numbers:
            active_registration.add(signal_number, request_shutdown)
            installed.append(signal_number)
    except (KeyboardInterrupt, SystemExit):
        _rollback(active_registration, captured, installed)
        raise
    except BaseException:
        _rollback(active_registration, captured, installed)
        raise WorkerSignalError() from None
    return InstalledSignalHandlers(
        active_registration,
        tuple(captured),
        tuple(installed),
    )


def _rollback(
    registration: SignalRegistration,
    captured: list[tuple[int, object]],
    installed: list[int],
) -> None:
    for signal_number in reversed(installed):
        with suppress(BaseException):
            registration.remove(signal_number)
    for signal_number, previous in captured:
        with suppress(BaseException):
            registration.restore(signal_number, previous)
