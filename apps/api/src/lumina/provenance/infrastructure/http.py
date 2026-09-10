"""Centralized bounded HTTPX transport for production provider adapters."""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass, field
from typing import Final, Protocol
from urllib.parse import urlsplit

import httpx

from lumina.provenance.domain.provider import (
    ProviderFetchError,
    ProviderFetchTimeout,
    ProviderFetchUnavailable,
)
from lumina.provenance.domain.runtime import (
    APOD_CONTENT_TYPE,
    APOD_HOST,
    APOD_PATH,
    APOD_USER_AGENT,
    FIXED_HOST,
    FIXED_PATH,
    FIXED_USER_AGENT,
    MAX_RESPONSE_BYTES,
    HttpTimeoutPolicy,
    RawProviderResponse,
)

_NASA_CSV_MEDIA_TYPE: Final = "text/plain"
_HTTPX_API_KEY_PATTERN: Final = re.compile(r"([?&]api_key=)[^&\s\"]*", re.ASCII)


# Compatibility aliases keep transport-focused test fixtures readable while the
# application imports the provider-neutral domain names directly.
ProviderTransportError = ProviderFetchError
ProviderTransportTimeout = ProviderFetchTimeout
ProviderTransportUnavailable = ProviderFetchUnavailable


@dataclass(frozen=True, repr=False, slots=True)
class FixedHttpRequest:
    """A provider-owned request with no caller-controlled URL or headers."""

    url: str
    params: tuple[tuple[str, str], ...] = field(repr=False)
    expected_content_type: str = _NASA_CSV_MEDIA_TYPE
    max_response_bytes: int = MAX_RESPONSE_BYTES
    user_agent: str = FIXED_USER_AGENT

    def __post_init__(self) -> None:
        if (
            type(self.url) is not str
            or type(self.params) is not tuple
            or any(
                type(pair) is not tuple
                or len(pair) != 2
                or any(type(value) is not str for value in pair)
                for pair in self.params
            )
            or self.url != self.url.strip()
            or any(ord(character) < 32 or ord(character) == 127 for character in self.url)
            or "\\" in self.url
        ):
            raise ValueError("Provider HTTP request is outside the approved trust boundary")
        parsed = urlsplit(self.url)
        try:
            hostname = parsed.hostname
            port = parsed.port
        except ValueError:
            raise ValueError(
                "Provider HTTP request is outside the approved trust boundary"
            ) from None
        if (
            parsed.scheme != "https"
            or hostname not in {FIXED_HOST, APOD_HOST}
            or port is not None
            or parsed.fragment
            or parsed.query
            or self.max_response_bytes != MAX_RESPONSE_BYTES
            or parsed.username is not None
            or parsed.password is not None
        ):
            raise ValueError("Provider HTTP request is outside the approved trust boundary")
        if hostname == FIXED_HOST:
            if (
                parsed.path != FIXED_PATH
                or self.expected_content_type != _NASA_CSV_MEDIA_TYPE
                or self.user_agent != FIXED_USER_AGENT
                or self.params
                != (
                    ("query", "select count(pl_name) from ps where default_flag=1"),
                    ("format", "csv"),
                )
            ):
                raise ValueError("Provider HTTP request is outside the approved trust boundary")
        elif (
            parsed.path != APOD_PATH
            or self.expected_content_type != APOD_CONTENT_TYPE
            or self.user_agent != APOD_USER_AGENT
            or len(self.params) != 1
            or self.params[0][0] != "api_key"
            or not _valid_api_key(self.params[0][1])
        ):
            raise ValueError("Provider HTTP request is outside the approved trust boundary")

    def __repr__(self) -> str:
        """Never expose an API key-bearing parameter tuple in diagnostics."""
        return "FixedHttpRequest(<redacted>)"


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
        _install_httpx_secret_redaction_filter()
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
                        "User-Agent": request.user_agent,
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


class _HttpxSecretRedactionFilter(logging.Filter):
    """Remove API-key query values before HTTPX records reach any handler."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            rendered = record.getMessage()
        except Exception:
            return True
        redacted = _HTTPX_API_KEY_PATTERN.sub(r"\1<redacted>", rendered)
        if redacted != rendered:
            record.msg = redacted
            record.args = ()
        return True


def _install_httpx_secret_redaction_filter() -> None:
    """Install the idempotent filter before any provider request is prepared."""
    logger = logging.getLogger("httpx")
    if not any(isinstance(candidate, _HttpxSecretRedactionFilter) for candidate in logger.filters):
        logger.addFilter(_HttpxSecretRedactionFilter())


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


def _valid_api_key(value: str) -> bool:
    return (
        type(value) is str
        and 1 <= len(value) <= 256
        and value != "DEMO_KEY"
        and value.isascii()
        and all(not character.isspace() and 32 <= ord(character) < 127 for character in value)
    )


__all__ = [
    "BoundedHttpTransport",
    "FixedHttpRequest",
    "ProviderTransportError",
    "ProviderTransportTimeout",
    "ProviderTransportUnavailable",
]
