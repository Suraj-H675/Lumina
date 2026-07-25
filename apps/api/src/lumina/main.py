"""ASGI export and console runner for Lumina's API."""

from __future__ import annotations

import uvicorn

from lumina.bootstrap import create_app
from lumina.settings import load_settings

_settings = load_settings()
app = create_app(_settings)


def run() -> None:
    """Run the module-level application with its already-resolved settings."""
    uvicorn.run(
        app,
        host=_settings.api_host,
        port=_settings.api_port,
        access_log=False,
        log_config=None,
    )
