"""Structured JSON logging and request-scoped context."""

from __future__ import annotations

import contextvars
import json
import logging
import sys
from datetime import UTC, datetime
from typing import Final, TextIO

_REQUEST_ID: Final[contextvars.ContextVar[str | None]] = contextvars.ContextVar(
    "lumina_request_id",
    default=None,
)
_MANAGED_HANDLER_NAME = "lumina-json"


class CurrentStdoutHandler(logging.StreamHandler[TextIO]):
    """Write to the active stdout stream so test capture cannot retain a stale stream."""

    def emit(self, record: logging.LogRecord) -> None:
        self.stream = sys.stdout
        super().emit(record)


class JsonFormatter(logging.Formatter):
    """Serialize safe structured log fields as one JSON object per line."""

    _SAFE_FIELDS = (
        "request_id",
        "route",
        "method",
        "status",
        "duration_ms",
        "error_code",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "level": record.levelname,
            "event": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None) or _REQUEST_ID.get()
        if request_id is not None:
            payload["request_id"] = request_id
        for field in self._SAFE_FIELDS[1:]:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, separators=(",", ":"), ensure_ascii=True)


def configure_logging(level: str) -> None:
    """Configure Lumina-owned loggers without replacing host logging."""
    logger = logging.getLogger("lumina")
    logger.setLevel(level)
    logger.propagate = False
    for name, candidate in logging.Logger.manager.loggerDict.items():
        if name.startswith("lumina.") and isinstance(candidate, logging.Logger):
            candidate.disabled = False
            candidate.setLevel(logging.NOTSET)

    for handler in tuple(logger.handlers):
        if handler.get_name() == _MANAGED_HANDLER_NAME:
            logger.removeHandler(handler)

    handler = CurrentStdoutHandler()
    handler.set_name(_MANAGED_HANDLER_NAME)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)


def bind_request_id(request_id: str) -> contextvars.Token[str | None]:
    """Bind a request ID to the current asynchronous context."""
    return _REQUEST_ID.set(request_id)


def reset_request_id(token: contextvars.Token[str | None]) -> None:
    """Restore the previous asynchronous request context."""
    _REQUEST_ID.reset(token)


def current_request_id() -> str | None:
    """Return the request ID bound to the current context, if any."""
    return _REQUEST_ID.get()
