from __future__ import annotations

from lumina.jobs.application.handlers import (
    StaticHandlerRegistry,
    SystemNoopHandler,
    production_handler_registry,
)


def noop_production_registry() -> StaticHandlerRegistry:
    provider_sync = SystemNoopHandler()
    identification_solve = SystemNoopHandler()
    return production_handler_registry(
        provider_sync=provider_sync,
        provider_sync_validator=provider_sync.validate_payload,
        identification_solve=identification_solve,
        identification_solve_validator=identification_solve.validate_payload,
    )
