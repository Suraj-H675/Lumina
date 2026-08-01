"""Isolated, deterministic OpenAPI export for generated clients."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import tempfile
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, cast

from lumina.bootstrap import create_app
from lumina.settings import AppSettings

_INERT_DATABASE_URL = "postgresql+asyncpg://openapi_export:nonsecret@127.0.0.1:1/lumina_openapi"
_EXPORT_FAILURE_MESSAGE = "Lumina OpenAPI export failed."


def serialize_openapi(document: dict[str, Any]) -> bytes:
    """Serialize an OpenAPI document with the repository's stable byte contract."""
    text = json.dumps(
        document,
        allow_nan=False,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    return f"{text}\n".encode()


def _with_openapi_application[Result](consumer: Callable[[bytes], Result]) -> Result:
    """Run one export operation while preserving its primary exception through disposal."""
    settings = AppSettings.model_validate(
        {
            "LUMINA_DATABASE_URL": _INERT_DATABASE_URL,
            "LUMINA_ENABLE_API_DOCS": False,
            "LUMINA_ENV": "test",
            "LUMINA_LOG_LEVEL": "CRITICAL",
        }
    )
    application = create_app(settings)
    primary_error: BaseException | None = None
    result: Result | None = None
    completed = False
    try:
        result = consumer(serialize_openapi(application.openapi()))
        completed = True
    except (Exception, KeyboardInterrupt, SystemExit) as error:
        primary_error = error
    try:
        asyncio.run(application.state.database_runtime.engine.dispose())
    except Exception:
        if primary_error is None:
            raise
    if primary_error is not None:
        raise primary_error.with_traceback(primary_error.__traceback__)
    if not completed:
        raise RuntimeError("OpenAPI export did not complete")
    return cast(Result, result)


def export_openapi() -> bytes:
    """Build a disposable application, export its real schema, and release its engine."""
    return _with_openapi_application(lambda content: content)


def _replace_output(output: Path, content: bytes) -> None:
    """Atomically replace one output path without exposing partial bytes."""
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=output.parent,
            prefix=f".{output.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _publish_output(output: Path, content: bytes) -> Callable[[], None]:
    """Publish output and return recovery that restores its exact prior state."""
    previously_present = output.is_file()
    if output.exists() and not previously_present:
        raise OSError("OpenAPI output is not a regular file")
    previous_content = output.read_bytes() if previously_present else None
    _replace_output(output, content)

    def rollback() -> None:
        if previous_content is None:
            output.unlink(missing_ok=True)
        else:
            _replace_output(output, previous_content)

    return rollback


def main(arguments: Sequence[str] | None = None) -> int:
    """Write one deterministic OpenAPI artifact without starting the API process."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parsed = parser.parse_args(arguments)
    try:
        rollback_output: Callable[[], None] | None = None

        def publish(content: bytes) -> None:
            nonlocal rollback_output
            rollback_output = _publish_output(parsed.output, content)

        try:
            _with_openapi_application(publish)
        except (Exception, KeyboardInterrupt, SystemExit) as primary_error:
            try:
                if rollback_output is not None:
                    rollback_output()
            except Exception:
                if not isinstance(primary_error, Exception):
                    raise primary_error.with_traceback(primary_error.__traceback__) from None
                raise
            raise
    except Exception:
        print(_EXPORT_FAILURE_MESSAGE, file=sys.stderr)
        return 1
    else:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
