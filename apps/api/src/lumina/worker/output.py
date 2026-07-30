"""Deadline-bounded process output with process-lifetime descriptor ownership."""

from __future__ import annotations

import asyncio
import errno
import os
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Protocol

WORKER_STARTED = b'{"event":"worker.started"}\n'
WORKER_STARTUP_FAILED = b"Lumina worker startup failed.\n"
HANDLER_SETTLEMENT_UNKNOWN = b'{"event":"worker.handler_settlement_unknown"}\n'
HEARTBEAT_SETTLEMENT_UNKNOWN = b'{"event":"worker.heartbeat_settlement_unknown"}\n'


class ProcessOutputError(RuntimeError):
    """Fixed failure for activation, output, confirmation, or restoration."""

    def __init__(self) -> None:
        super().__init__("Worker process output failed.")

    def __repr__(self) -> str:
        return "ProcessOutputError(<redacted>)"


class ProcessOutput(Protocol):
    """Narrow worker-only capability for authorized process output."""

    def activate(self) -> None:
        """Take process-lifetime nonblocking ownership of stdout and stderr."""
        ...

    async def write_stdout(self, data: bytes, *, deadline: float) -> None:
        """Write and confirm all authorized stdout bytes by an absolute deadline."""
        ...

    async def write_stderr(self, data: bytes, *, deadline: float) -> None:
        """Write and confirm all authorized stderr bytes by an absolute deadline."""
        ...

    def restore(self) -> None:
        """Restore the original descriptor modes exactly once."""
        ...


async def _confirmed() -> None:
    """Raw ``os.write`` acceptance is the production flush-equivalent boundary."""


class NonBlockingProcessOutput:
    """Own stdout/stderr nonblocking modes for the complete worker lifetime."""

    def __init__(
        self,
        *,
        stdout_fd: int = 1,
        stderr_fd: int = 2,
        get_blocking: Callable[[int], bool] = os.get_blocking,
        set_blocking: Callable[[int, bool], None] = os.set_blocking,
        write: Callable[[int, bytes | memoryview], int] = os.write,
        confirm: Callable[[], Awaitable[None]] = _confirmed,
    ) -> None:
        self._stdout_fd = stdout_fd
        self._stderr_fd = stderr_fd
        self._get_blocking = get_blocking
        self._set_blocking = set_blocking
        self._write = write
        self._confirm = confirm
        self._original_modes: dict[int, bool] = {}
        self._activated_fds: list[int] = []
        self._active = False
        self._restore_attempted = False

    def activate(self) -> None:
        """Set both descriptors nonblocking once, restoring partial activation."""
        if self._active or self._restore_attempted:
            raise ProcessOutputError()
        try:
            for descriptor in (self._stdout_fd, self._stderr_fd):
                original = self._get_blocking(descriptor)
                if type(original) is not bool:
                    raise ProcessOutputError()
                self._original_modes[descriptor] = original
                self._set_blocking(descriptor, False)
                self._activated_fds.append(descriptor)
        except (KeyboardInterrupt, SystemExit):
            self._restore_partial_activation()
            raise
        except BaseException:
            self._restore_partial_activation()
            raise ProcessOutputError() from None
        self._active = True

    async def write_stdout(self, data: bytes, *, deadline: float) -> None:
        """Write complete stdout bytes without changing descriptor ownership."""
        await self._write_all(self._stdout_fd, data, deadline=deadline)

    async def write_stderr(self, data: bytes, *, deadline: float) -> None:
        """Write complete stderr bytes without changing descriptor ownership."""
        await self._write_all(self._stderr_fd, data, deadline=deadline)

    def restore(self) -> None:
        """Restore both original modes once, attempting every owned descriptor."""
        if self._restore_attempted:
            return
        self._restore_attempted = True
        failed = False
        for descriptor in reversed(self._activated_fds):
            try:
                self._set_blocking(descriptor, self._original_modes[descriptor])
            except (KeyboardInterrupt, SystemExit):
                raise
            except BaseException:
                failed = True
        self._active = False
        if failed:
            raise ProcessOutputError() from None

    async def _write_all(self, descriptor: int, data: bytes, *, deadline: float) -> None:
        if not self._active or type(data) is not bytes or not data:
            raise ProcessOutputError()
        loop = asyncio.get_running_loop()
        if deadline <= loop.time():
            raise ProcessOutputError()
        view = memoryview(data)
        accepted = 0
        try:
            async with asyncio.timeout_at(deadline):
                while accepted < len(view):
                    try:
                        written = self._write(descriptor, view[accepted:])
                    except BlockingIOError:
                        await self._wait_writable(descriptor, deadline=deadline)
                        continue
                    except OSError as error:
                        if error.errno in {errno.EAGAIN, errno.EWOULDBLOCK}:
                            await self._wait_writable(descriptor, deadline=deadline)
                            continue
                        raise ProcessOutputError() from None
                    if type(written) is not int or written <= 0:
                        raise ProcessOutputError()
                    accepted += written
                await self._confirm()
        except asyncio.CancelledError:
            raise
        except (KeyboardInterrupt, SystemExit):
            raise
        except ProcessOutputError:
            raise
        except BaseException:
            raise ProcessOutputError() from None
        finally:
            view.release()

    async def _wait_writable(self, descriptor: int, *, deadline: float) -> None:
        loop = asyncio.get_running_loop()
        ready = loop.create_future()

        def mark_ready() -> None:
            if not ready.done():
                ready.set_result(None)

        installed = False
        try:
            loop.add_writer(descriptor, mark_ready)
            installed = True
            async with asyncio.timeout_at(deadline):
                await ready
        except asyncio.CancelledError:
            raise
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            raise ProcessOutputError() from None
        finally:
            if installed:
                with suppress(BaseException):
                    loop.remove_writer(descriptor)

    def _restore_partial_activation(self) -> None:
        for descriptor in reversed(self._activated_fds):
            with suppress(BaseException):
                self._set_blocking(descriptor, self._original_modes[descriptor])
        self._activated_fds.clear()
        self._original_modes.clear()
        self._active = False

    def __repr__(self) -> str:
        return "NonBlockingProcessOutput(<redacted>)"
