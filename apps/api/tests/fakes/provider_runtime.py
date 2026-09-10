"""Deterministic Phase 4A transport scenarios; never imported by production code."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final

from lumina.provenance.domain.runtime import MAX_RESPONSE_BYTES, RawProviderResponse
from lumina.provenance.infrastructure.http import (
    FixedHttpRequest,
    ProviderTransportTimeout,
    ProviderTransportUnavailable,
)

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
class DeterministicNasaTransport:
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


def timeout() -> ProviderTransportTimeout:
    """Return a safe deterministic timeout failure."""
    return ProviderTransportTimeout()


def unavailable() -> ProviderTransportUnavailable:
    """Return a safe deterministic network failure."""
    return ProviderTransportUnavailable()
