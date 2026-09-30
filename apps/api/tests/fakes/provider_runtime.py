"""Deterministic provider transport scenarios; never imported by production code."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Final

from lumina.provenance.domain.provider import ProviderFetchTimeout, ProviderFetchUnavailable
from lumina.provenance.domain.runtime import (
    MAX_RESPONSE_BYTES,
    CacheState,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFinalization,
    ProviderFinalizationOutcome,
    ProviderLease,
    ProviderRuntimeConfig,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.http import FixedHttpRequest

VALID_COUNT_BODY: Final = b"count(pl_name)\n6360\n"


def response(
    body: bytes = VALID_COUNT_BODY,
    *,
    status_code: int = 200,
    content_type: str = "text/plain; charset=UTF-8",
    headers: dict[str, str] | None = None,
) -> RawProviderResponse:
    """Build one deterministic bounded response with exact raw bytes preserved."""
    response_headers = {"content-type": content_type}
    if headers is not None:
        response_headers.update(headers)
    return RawProviderResponse(
        status_code=status_code,
        headers=response_headers,
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=content_type.split(";", 1)[0].strip().lower() == "text/plain",
    )


def oversized_response(*, status_code: int = 200) -> RawProviderResponse:
    """Return bounded incomplete evidence for an oversized-body sync outcome."""
    prefix = b"x" * MAX_RESPONSE_BYTES
    return RawProviderResponse(
        status_code=status_code,
        headers={"content-type": "text/plain", "content-length": str(MAX_RESPONSE_BYTES + 1)},
        body=prefix,
        raw_complete=False,
        observed_bytes=MAX_RESPONSE_BYTES + 1,
        content_type_valid=False,
    )


@dataclass
class DeterministicProviderTransport:
    """Replay a finite sequence of responses or transport failures."""

    outcomes: list[RawProviderResponse | BaseException]
    requests: list[FixedHttpRequest] = field(default_factory=list)
    attempt_deadlines: list[float | None] = field(default_factory=list)

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        self.requests.append(request)
        self.attempt_deadlines.append(attempt_deadline)
        if not self.outcomes:
            raise AssertionError("deterministic provider transport was exhausted")
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


@dataclass
class DeterministicProviderStore:
    """Record sync finalization calls with configurable failure state."""

    lease_token: str
    failure_cache_state: CacheState = CacheState.STALE
    failure_stale_fallback: bool = True
    success_calls: list[dict[str, Any]] = field(default_factory=list)
    failure_calls: list[dict[str, Any]] = field(default_factory=list)

    async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
        del config, kwargs
        return ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease(self.lease_token, half_open_probe=False),
        )

    async def finalize_success(
        self,
        config: ProviderRuntimeConfig,
        **kwargs: Any,
    ) -> ProviderFinalization:
        self.success_calls.append({"config": config, **kwargs})
        return ProviderFinalization(ProviderFinalizationOutcome.COMMITTED, CacheState.FRESH)

    async def finalize_failure(
        self,
        config: ProviderRuntimeConfig,
        **kwargs: Any,
    ) -> ProviderFinalization:
        self.failure_calls.append({"config": config, **kwargs})
        return ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            self.failure_cache_state,
            stale_fallback=self.failure_stale_fallback,
        )

    async def status(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("status is not used by this deterministic provider store")

    async def set_enabled(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("set_enabled is not used by this deterministic provider store")


def timeout() -> ProviderFetchTimeout:
    """Return a safe deterministic timeout failure."""
    return ProviderFetchTimeout()


def unavailable() -> ProviderFetchUnavailable:
    """Return a safe deterministic network failure."""
    return ProviderFetchUnavailable()


@asynccontextmanager
async def no_timeout(_deadline: float) -> AsyncIterator[None]:
    """Provide a deterministic timeout boundary that never expires."""
    yield


async def sleep_noop(_delay: float) -> None:
    """Provide a deterministic sleeper that completes immediately."""
    return None
