"""Bounded HTTPS adapter for the Phase 6B Nova.astrometry.net API."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Protocol, cast

import httpx
from pydantic import SecretStr

from lumina.identification.domain.nova import (
    NovaJobId,
    NovaJobState,
    NovaSession,
    NovaSubmissionId,
    NovaSubmissionSnapshot,
    RemoteAstrometryProtocolError,
    RemoteAstrometryRejected,
    RemoteAstrometryTimeout,
    RemoteAstrometryUnavailable,
)
from lumina.identification.domain.remote_raster import SanitizedRemoteRaster
from lumina.identification.domain.uploads import UploadMediaType

_NOVA_API_URL = "https://nova.astrometry.net/api"
_USER_AGENT = "Lumina/0.0 Phase-6B remote-astrometry"
_MAX_RESPONSE_BYTES = 65_536
_MAX_JSON_DEPTH = 12
_MAX_JSON_COLLECTION_ITEMS = 1_024
_MAX_JOB_IDS = 256
_JSON_MEDIA_TYPES = frozenset({"application/json", "text/json", "text/plain"})


class NovaHttpClientFactory(Protocol):
    def __call__(self, *, timeout: httpx.Timeout) -> httpx.AsyncClient: ...


class RemoteNovaAdapter:
    """Expose only the reviewed login/upload/poll subset of Nova's API."""

    def __init__(
        self,
        *,
        api_url: str,
        api_key: SecretStr,
        client_factory: NovaHttpClientFactory | None = None,
    ) -> None:
        if api_url != _NOVA_API_URL or type(api_key) is not SecretStr:
            raise ValueError("Remote Nova adapter configuration is invalid.")
        secret = api_key.get_secret_value()
        if (
            not 1 <= len(secret) <= 256
            or not secret.isascii()
            or any(not 33 <= ord(character) <= 126 for character in secret)
        ):
            raise ValueError("Remote Nova adapter configuration is invalid.")
        self._api_url = api_url
        self._api_key = api_key
        self._client_factory = client_factory or _production_client

    async def login(self) -> NovaSession:
        payload = await self._request_json("login", {"apikey": self._api_key.get_secret_value()})
        _require_success(payload)
        raw = payload.get("session")
        if type(raw) is not str:
            raise RemoteAstrometryProtocolError()
        try:
            return NovaSession(raw)
        except ValueError:
            raise RemoteAstrometryProtocolError() from None

    async def upload(
        self,
        session: NovaSession,
        raster: SanitizedRemoteRaster,
    ) -> NovaSubmissionId:
        if type(session) is not NovaSession or type(raster) is not SanitizedRemoteRaster:
            raise RemoteAstrometryProtocolError()
        request_json = _encode_request(
            {
                "allow_commercial_use": "n",
                "allow_modifications": "n",
                "publicly_visible": "n",
                "session": session.value,
            }
        )
        filename = "image.png" if raster.media_type is UploadMediaType.PNG else "image.jpg"
        payload = await self._request_json(
            "upload",
            None,
            multipart=(request_json, filename, raster.content),
        )
        _require_success(payload)
        raw = payload.get("subid")
        if type(raw) is not int:
            raise RemoteAstrometryProtocolError()
        try:
            return NovaSubmissionId(raw)
        except ValueError:
            raise RemoteAstrometryProtocolError() from None

    async def submission_status(
        self,
        session: NovaSession,
        submission_id: NovaSubmissionId,
    ) -> NovaSubmissionSnapshot:
        if type(session) is not NovaSession or type(submission_id) is not NovaSubmissionId:
            raise RemoteAstrometryProtocolError()
        payload = await self._request_json(
            f"submissions/{submission_id.value}",
            {"session": session.value},
        )
        if payload.get("status") == "error":
            raise RemoteAstrometryRejected()
        jobs = _parse_jobs(payload.get("jobs"))
        calibrated = _parse_calibrated_jobs(payload.get("job_calibrations"))
        try:
            return NovaSubmissionSnapshot(jobs=jobs, calibrated_jobs=calibrated)
        except ValueError:
            raise RemoteAstrometryProtocolError() from None

    async def job_status(self, session: NovaSession, job_id: NovaJobId) -> NovaJobState:
        if type(session) is not NovaSession or type(job_id) is not NovaJobId:
            raise RemoteAstrometryProtocolError()
        payload = await self._request_json(
            f"jobs/{job_id.value}",
            {"session": session.value},
        )
        status = payload.get("status")
        if status == "error":
            raise RemoteAstrometryRejected()
        if status == "success":
            return NovaJobState.SUCCESS
        if status == "failure":
            return NovaJobState.FAILURE
        if status is None or (type(status) is str and _safe_status_text(status)):
            return NovaJobState.SOLVING
        raise RemoteAstrometryProtocolError()

    async def _request_json(
        self,
        service: str,
        arguments: Mapping[str, object] | None,
        *,
        multipart: tuple[str, str, bytes] | None = None,
    ) -> dict[str, object]:
        url = _service_url(service)
        timeout = httpx.Timeout(connect=5.0, read=30.0, write=120.0, pool=5.0)
        client = self._client_factory(timeout=timeout)
        try:
            async with client:
                if multipart is None:
                    async with client.stream(
                        "POST",
                        url,
                        data={"request-json": _encode_request(arguments or {})},
                        headers=_headers(),
                    ) as response:
                        body = await _bounded_body(response)
                else:
                    request_json, filename, content = multipart
                    async with client.stream(
                        "POST",
                        url,
                        files={
                            "request-json": (None, request_json, "text/plain"),
                            "file": (filename, content, "application/octet-stream"),
                        },
                        headers=_headers(),
                    ) as response:
                        body = await _bounded_body(response)
        except RemoteAstrometryProtocolError:
            raise
        except httpx.DecodingError:
            raise RemoteAstrometryProtocolError() from None
        except httpx.TimeoutException:
            raise RemoteAstrometryTimeout() from None
        except (httpx.NetworkError, httpx.RemoteProtocolError, httpx.HTTPError, OSError):
            raise RemoteAstrometryUnavailable() from None

        if response.status_code == 429 or 500 <= response.status_code <= 599:
            raise RemoteAstrometryUnavailable()
        if not 200 <= response.status_code <= 299:
            raise RemoteAstrometryRejected()
        media_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if media_type not in _JSON_MEDIA_TYPES:
            raise RemoteAstrometryProtocolError()
        return _decode_object(body)

    def __repr__(self) -> str:
        return "RemoteNovaAdapter(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def _headers() -> dict[str, str]:
    return {
        "Accept": "application/json",
        "Accept-Encoding": "identity",
        "User-Agent": _USER_AGENT,
    }


def _service_url(service: str) -> str:
    if (
        type(service) is not str
        or not service
        or service.startswith("/")
        or "//" in service
        or "?" in service
        or "#" in service
        or "\\" in service
    ):
        raise RemoteAstrometryProtocolError()
    parts = service.split("/")
    if any(not part or (not part.isascii()) for part in parts):
        raise RemoteAstrometryProtocolError()
    return f"{_NOVA_API_URL}/{service}"


def _encode_request(value: Mapping[str, object]) -> str:
    try:
        return json.dumps(
            value, ensure_ascii=True, allow_nan=False, separators=(",", ":"), sort_keys=True
        )
    except (TypeError, ValueError):
        raise RemoteAstrometryProtocolError() from None


async def _bounded_body(response: httpx.Response) -> bytes:
    content_encoding = response.headers.get("content-encoding", "identity").lower()
    if content_encoding != "identity":
        raise RemoteAstrometryProtocolError()
    content_length = response.headers.get("content-length")
    if content_length is not None:
        if not content_length.isascii() or not content_length.isdecimal():
            raise RemoteAstrometryProtocolError()
        if len(content_length) > 20 or int(content_length) > _MAX_RESPONSE_BYTES:
            raise RemoteAstrometryProtocolError()
    body = bytearray()
    async for chunk in response.aiter_bytes():
        if len(body) + len(chunk) > _MAX_RESPONSE_BYTES:
            raise RemoteAstrometryProtocolError()
        body.extend(chunk)
    return bytes(body)


def _decode_object(body: bytes) -> dict[str, object]:
    try:
        decoded = json.loads(
            body.decode("utf-8", errors="strict"),
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_json_constant,
        )
        _validate_json_shape(decoded)
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError, TypeError, ValueError):
        raise RemoteAstrometryProtocolError() from None
    if type(decoded) is not dict:
        raise RemoteAstrometryProtocolError()
    return cast(dict[str, object], decoded)


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def _validate_json_shape(value: object, depth: int = 0) -> None:
    if depth > _MAX_JSON_DEPTH:
        raise ValueError("JSON is too deeply nested")
    if isinstance(value, dict):
        if len(value) > _MAX_JSON_COLLECTION_ITEMS:
            raise ValueError("JSON object is too large")
        for key, child in value.items():
            if type(key) is not str or len(key) > 256:
                raise ValueError("JSON key is invalid")
            _validate_json_shape(child, depth + 1)
    elif isinstance(value, list):
        if len(value) > _MAX_JSON_COLLECTION_ITEMS:
            raise ValueError("JSON list is too large")
        for child in value:
            _validate_json_shape(child, depth + 1)
    elif value is not None and type(value) not in {str, int, float, bool}:
        raise ValueError("JSON value is invalid")


def _require_success(payload: Mapping[str, object]) -> None:
    status = payload.get("status")
    if status == "error":
        raise RemoteAstrometryRejected()
    if status != "success":
        raise RemoteAstrometryProtocolError()


def _parse_jobs(value: object) -> tuple[NovaJobId, ...]:
    if type(value) is not list or len(value) > _MAX_JOB_IDS:
        raise RemoteAstrometryProtocolError()
    result: list[NovaJobId] = []
    for raw in cast(list[object], value):
        if raw is None:
            continue
        if type(raw) is not int:
            raise RemoteAstrometryProtocolError()
        try:
            result.append(NovaJobId(raw))
        except ValueError:
            raise RemoteAstrometryProtocolError() from None
    if len({job.value for job in result}) != len(result):
        raise RemoteAstrometryProtocolError()
    return tuple(result)


def _parse_calibrated_jobs(value: object) -> tuple[NovaJobId, ...]:
    if type(value) is not list or len(value) > _MAX_JOB_IDS:
        raise RemoteAstrometryProtocolError()
    result: list[NovaJobId] = []
    for raw in cast(list[object], value):
        if type(raw) is not list or len(raw) != 2:
            raise RemoteAstrometryProtocolError()
        job_raw, calibration_raw = cast(list[object], raw)
        if type(job_raw) is not int or type(calibration_raw) is not int or calibration_raw <= 0:
            raise RemoteAstrometryProtocolError()
        try:
            result.append(NovaJobId(job_raw))
        except ValueError:
            raise RemoteAstrometryProtocolError() from None
    if len({job.value for job in result}) != len(result):
        raise RemoteAstrometryProtocolError()
    return tuple(result)


def _safe_status_text(value: str) -> bool:
    return (
        len(value) <= 64
        and value.isascii()
        and all(character == " " or 33 <= ord(character) <= 126 for character in value)
    )


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


__all__ = ["NovaHttpClientFactory", "RemoteNovaAdapter"]
