"""Secret-safe internal ``lumina-worker`` command boundary."""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Sequence
from contextlib import suppress
from typing import NoReturn

from lumina.worker.composition import run_worker_process
from lumina.worker.output import NonBlockingProcessOutput, ProcessOutputError


class InvalidWorkerInvocation(ValueError):
    """Fixed marker for a silent invalid command invocation."""


class _SilentArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        del message
        raise InvalidWorkerInvocation()


def _parser() -> _SilentArgumentParser:
    return _SilentArgumentParser(
        prog="lumina-worker",
        description="Run the internal sequential Lumina worker.",
        add_help=True,
    )


def main(argv: Sequence[str] | None = None) -> int:
    """Parse first, then activate output and construct worker startup."""
    parser = _parser()
    try:
        parser.parse_args(argv)
    except InvalidWorkerInvocation:
        return 2
    except SystemExit as error:
        return 0 if error.code == 0 else 2

    output = NonBlockingProcessOutput()
    try:
        output.activate()
    except (KeyboardInterrupt, SystemExit):
        raise
    except ProcessOutputError:
        return 1
    try:
        return asyncio.run(run_worker_process(output))
    except (KeyboardInterrupt, SystemExit):
        with suppress(BaseException):
            output.restore()
        return 1
    except BaseException:
        with suppress(BaseException):
            output.restore()
        return 1
