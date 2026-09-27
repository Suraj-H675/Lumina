"""ASGI export and console runner for Lumina's API."""

from __future__ import annotations

import os

import uvicorn

from lumina.bootstrap import create_app
from lumina.settings import load_settings

_settings = load_settings()
app = create_app(_settings)


def _runtime_port(configured_port: int) -> int:
    """Honor a platform-assigned port without weakening Lumina's configured default."""
    raw = os.environ.get("PORT")
    if raw is None:
        return configured_port
    if raw == "" or raw != raw.strip() or not raw.isascii() or not raw.isdecimal():
        raise RuntimeError("PORT must be an integer from 1 through 65535")
    port = int(raw)
    if not 1 <= port <= 65535:
        raise RuntimeError("PORT must be an integer from 1 through 65535")
    return port


def run() -> None:
    """Run the module-level application with its already-resolved settings."""
    uvicorn.run(
        app,
        host=_settings.api_host,
        port=_runtime_port(_settings.api_port),
        access_log=False,
        log_config=None,
    )
