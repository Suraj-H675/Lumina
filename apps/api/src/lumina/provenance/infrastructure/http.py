"""Centralized bounded HTTPX transport for production provider adapters."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Final, Protocol
from urllib.parse import urlsplit

import httpx

from lumina.provenance.domain.provider import (
    ProviderFetchError,
    ProviderFetchTimeout,
    ProviderFetchUnavailable,
)
from lumina.provenance.domain.runtime import (
    FIXED_HOST,
    FIXED_PATH,
    FIXED_USER_AGENT,
    MAX_RESPONSE_BYTES,
    HttpTimeoutPolicy,
    RawProviderResponse,
)

_NASA_CSV_MEDIA_TYPE: Final = "text/plain"


# Compatibility aliases keep transport-focused test fixtures readable while the
# application imports the provider-neutral domain names directly.
ProviderTransportError = ProviderFetchError
ProviderTransportTimeout = ProviderFetchTimeout
ProviderTransportUnavailable = ProviderFetchUnavailable


@dataclass(frozen=True, slots=True)
class FixedHttpRequest:
    """A provider-owned request with no caller-controlled URL or headers."""

    url: str
    params: tuple[tuple[str, str], ...]
    expected_content_type: str = _NASA_CSV_MEDIA_TYPE
    max_response_bytes: int = MAX_RESPONSE_BYTES

    def __post_init__(self) -> None:
        parsed = urlsplit(self.url)
        if (
            parsed.scheme != "https"
            or parsed.hostname != FIXED_HOST
            or parsed.port is not None
            or parsed.path != FIXED_PATH
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
            or parsed.query
            or self.expected_content_type != _NASA_CSV_MEDIA_TYPE
            or self.max_response_bytes != MAX_RESPONSE_BYTES
            or self.params
            != (("query", "select count(pl_name) from ps where default_flag=1"), ("format", "csv"))
        ):
            raise ValueError("Provider HTTP request is outside the approved trust boundary")


class AsyncHttpClientFactory(Protocol):
    """Small test seam for HTTPX client construction."""

    def __call__(self, *, timeout: httpx.Timeout) -> httpx.AsyncClient:
        """Create one short-lived client with the supplied timeout."""
        ...


TimeoutAtFactory = Callable[[float], AbstractAsyncContextManager[object]]
MonotonicClock = Callable[[], float]


class BoundedHttpTransport:
    """Perform exactly one fixed, bounded request with no redirect or proxy inheritance."""

    def __init__(
        self,
        *,
        timeout: HttpTimeoutPolicy,
        client_factory: AsyncHttpClientFactory | None = None,
        timeout_at: TimeoutAtFactory | None = None,
        monotonic: MonotonicClock | None = None,
    ) -> None:
        self._timeout = timeout
        self._client_factory = client_factory or _production_client
        self._timeout_at = timeout_at or asyncio.timeout_at
        self._monotonic = monotonic or _event_loop_time

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        """Return bounded raw evidence or a fixed safe transport failure."""
        try:
            if attempt_deadline is not None:
                if attempt_deadline <= self._monotonic():
                    raise ProviderTransportTimeout()
                async with self._timeout_at(attempt_deadline):
                    return await self._request_unbounded(request)
            return await self._request_unbounded(request)
        except TimeoutError:
            raise ProviderTransportTimeout() from None
        except ProviderTransportError:
            raise
        except (OSError, ValueError):
            raise ProviderTransportUnavailable() from None

    async def _request_unbounded(self, request: FixedHttpRequest) -> RawProviderResponse:
        """Perform one request; the caller owns the total attempt deadline."""
        client = self._client_factory(
            timeout=httpx.Timeout(
                connect=self._timeout.connect_seconds,
                read=self._timeout.read_seconds,
                write=self._timeout.write_seconds,
                pool=self._timeout.pool_seconds,
            )
        )
        async with client:
            try:
                async with client.stream(
                    "GET",
                    request.url,
                    params=request.params,
                    headers={
                        "Accept": request.expected_content_type,
                        "Accept-Encoding": "identity",
                        "User-Agent": FIXED_USER_AGENT,
                    },
                ) as response:
                    headers = {key.lower(): value for key, value in response.headers.items()}
                    if headers.get("content-encoding", "identity").lower() != "identity":
                        raise ProviderTransportUnavailable()
                    content_length = _content_length(headers.get("content-length"))
                    if content_length is not None and content_length > request.max_response_bytes:
                        return RawProviderResponse(
                            status_code=response.status_code,
                            headers=headers,
                            body=b"",
                            raw_complete=False,
                            observed_bytes=content_length,
                            content_type_valid=False,
                        )
                    body = bytearray()
                    observed = 0
                    async for chunk in response.aiter_bytes():
                        observed += len(chunk)
                        if observed > request.max_response_bytes:
                            prefix_length = request.max_response_bytes - len(body)
                            if prefix_length > 0:
                                body.extend(chunk[:prefix_length])
                            return RawProviderResponse(
                                status_code=response.status_code,
                                headers=headers,
                                body=bytes(body),
                                raw_complete=False,
                                observed_bytes=observed,
                                content_type_valid=False,
                            )
                        body.extend(chunk)
                    return RawProviderResponse(
                        status_code=response.status_code,
                        headers=headers,
                        body=bytes(body),
                        raw_complete=True,
                        observed_bytes=observed,
                        content_type_valid=_media_type(headers.get("content-type"))
                        == request.expected_content_type,
                    )
            except ProviderFetchError:
                raise
            except httpx.TimeoutException:
                raise ProviderFetchTimeout() from None
            except (httpx.NetworkError, httpx.RemoteProtocolError, httpx.HTTPError):
                raise ProviderFetchUnavailable() from None


def _event_loop_time() -> float:
    return asyncio.get_running_loop().time()


def _production_client(*, timeout: httpx.Timeout) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=timeout,
        verify=True,
        trust_env=False,
        follow_redirects=False,
        cookies=None,
        auth=None,
        headers=None,
        http2=False,
    )


def _content_length(value: str | None) -> int | None:
    if value is None:
        return None
    if not value.isascii() or not value.isdecimal() or (len(value) > 1 and value.startswith("0")):
        raise ProviderTransportUnavailable()
    significant = value.lstrip("0") or "0"
    maximum_text = str(MAX_RESPONSE_BYTES)
    if len(significant) > len(maximum_text) or (
        len(significant) == len(maximum_text) and significant > maximum_text
    ):
        return MAX_RESPONSE_BYTES + 1
    return int(significant, 10)


def _media_type(value: str | None) -> str | None:
    return None if value is None else value.split(";", 1)[0].strip().lower()


__all__ = [
    "BoundedHttpTransport",
    "FixedHttpRequest",
    "ProviderTransportError",
    "ProviderTransportTimeout",
    "ProviderTransportUnavailable",
]
