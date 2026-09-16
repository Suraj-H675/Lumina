from __future__ import annotations

import json
import struct
from collections.abc import AsyncIterator
from typing import cast
from urllib.parse import parse_qs

import httpx
import pytest
from lumina.identification.domain.nova import (
    NovaJobId,
    NovaJobState,
    NovaSession,
    NovaSubmissionId,
    RemoteAstrometryBusy,
    RemoteAstrometryProtocolError,
    RemoteAstrometryRejected,
    RemoteAstrometryTimeout,
    RemoteAstrometryUnavailable,
)
from lumina.identification.domain.remote_raster import SanitizedRemoteRaster, sanitize_remote_raster
from lumina.identification.domain.uploads import UploadValidationPolicy, validate_raster_upload
from lumina.identification.infrastructure.nova import RemoteNovaAdapter
from pydantic import SecretStr

_API = "https://nova.astrometry.net/api"
_SECRET = "fixture-nova-key-2026"
_SESSION = "fixture-session-2026"


def _raster() -> SanitizedRemoteRaster:
    sof_data = bytes([8]) + struct.pack(">HHB", 16, 16, 3) + b"\x01\x11\x00"
    sos_data = b"\x03\x01\x00\x00"

    def segment(marker: int, data: bytes) -> bytes:
        return b"\xff" + bytes((marker,)) + struct.pack(">H", len(data) + 2) + data

    source = (
        b"\xff\xd8"
        + segment(0xE1, b"Exif\x00\x00private")
        + segment(0xC0, sof_data)
        + segment(0xDA, sos_data)
        + b"sanitized-image-bytes"
        + b"\xff\xd9"
    )
    validated = validate_raster_upload(
        source,
        declared_media_type="image/jpeg",
        policy=UploadValidationPolicy(max_bytes=1_000_000, max_pixels=1_000_000, min_dimension=8),
    )
    return sanitize_remote_raster(validated)


def _adapter(handler: httpx.AsyncBaseTransport | object) -> RemoteNovaAdapter:
    if isinstance(handler, httpx.AsyncBaseTransport):
        transport = handler
    else:
        transport = httpx.MockTransport(handler)  # type: ignore[arg-type]
    return RemoteNovaAdapter(
        api_url=_API,
        api_key=SecretStr(_SECRET),
        client_factory=lambda *, timeout: httpx.AsyncClient(transport=transport, timeout=timeout),
    )


def _form_json(request: httpx.Request) -> dict[str, object]:
    values = parse_qs(request.content.decode("ascii"), strict_parsing=True)
    assert set(values) == {"request-json"}
    decoded = json.loads(values["request-json"][0])
    assert type(decoded) is dict
    return cast(dict[str, object], decoded)


@pytest.mark.asyncio
async def test_login_upload_and_poll_use_only_reviewed_private_contract() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.method == "POST"
        assert request.url.scheme == "https"
        assert request.url.host == "nova.astrometry.net"
        assert request.url.query == b""
        assert request.headers["accept"] == "application/json"
        assert request.headers["accept-encoding"] == "identity"
        assert request.headers["user-agent"] == "Lumina/0.0 Phase-6B remote-astrometry"
        path = request.url.path
        body: dict[str, object]
        if path == "/api/login":
            assert _form_json(request) == {"apikey": _SECRET}
            body = {"status": "success", "message": "authenticated", "session": _SESSION}
        elif path == "/api/upload":
            body_bytes = request.content
            assert b'name="request-json"' in body_bytes
            assert b'name="file"; filename="image.jpg"' in body_bytes
            assert b"sanitized-image-bytes" in body_bytes
            assert _SECRET.encode() not in body_bytes
            assert b"original_filename" not in body_bytes
            assert b"center_ra" not in body_bytes
            assert b"center_dec" not in body_bytes
            assert b"scale_lower" not in body_bytes
            assert b"scale_upper" not in body_bytes
            for fragment in (
                b'"allow_commercial_use":"n"',
                b'"allow_modifications":"n"',
                b'"publicly_visible":"n"',
                b'"session":"fixture-session-2026"',
            ):
                assert fragment in body_bytes
            body = {"status": "success", "subid": 101}
        elif path == "/api/submissions/101":
            assert _form_json(request) == {"session": _SESSION}
            body = {"jobs": [None, 201], "job_calibrations": [[201, 301]]}
        elif path == "/api/jobs/201":
            assert _form_json(request) == {"session": _SESSION}
            body = {"status": "success"}
        else:
            raise AssertionError(path)
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            content=json.dumps(body).encode(),
            request=request,
        )

    adapter = _adapter(handler)
    assert repr(adapter) == str(adapter) == "RemoteNovaAdapter(<redacted>)"
    assert _SECRET not in repr(adapter)

    session = await adapter.login()
    submission = await adapter.upload(session, _raster())
    snapshot = await adapter.submission_status(session, submission)
    status = await adapter.job_status(session, snapshot.jobs[0])

    assert session.value == _SESSION
    assert submission == NovaSubmissionId(101)
    assert snapshot.jobs == (NovaJobId(201),)
    assert snapshot.calibrated_jobs == (NovaJobId(201),)
    assert status is NovaJobState.SUCCESS
    assert len(requests) == 4


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "wire_status,expected",
    [
        ("failure", NovaJobState.FAILURE),
        ("solving", NovaJobState.SOLVING),
        ("processing", NovaJobState.SOLVING),
        (None, NovaJobState.SOLVING),
    ],
)
async def test_job_poll_preserves_terminal_states_and_treats_other_safe_status_as_pending(
    wire_status: str | None, expected: NovaJobState
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={"status": wire_status},
            request=request,
        )

    result = await _adapter(handler).job_status(NovaSession(_SESSION), NovaJobId(1))
    assert result is expected


@pytest.mark.asyncio
async def test_submission_poll_accepts_known_nova_null_job_entries_but_rejects_bad_shapes() -> None:
    replies = iter(
        [
            {"jobs": [None, 4], "job_calibrations": []},
            {"jobs": [4, 4], "job_calibrations": []},
            {"jobs": [4], "job_calibrations": [[5, 9]]},
        ]
    )

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json=next(replies),
            request=request,
        )

    adapter = _adapter(handler)
    session = NovaSession(_SESSION)
    assert (await adapter.submission_status(session, NovaSubmissionId(2))).jobs == (NovaJobId(4),)
    with pytest.raises(RemoteAstrometryProtocolError):
        await adapter.submission_status(session, NovaSubmissionId(2))
    with pytest.raises(RemoteAstrometryProtocolError):
        await adapter.submission_status(session, NovaSubmissionId(2))


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [400, 401, 403])
async def test_http_client_rejection_is_safe_and_body_is_not_reflected(status: int) -> None:
    private = b"private upstream rejection details"

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status,
            headers={"content-type": "text/plain"},
            content=private,
            request=request,
        )

    with pytest.raises(RemoteAstrometryRejected) as captured:
        await _adapter(handler).login()
    assert private.decode() not in str(captured.value)
    assert private.decode() not in repr(captured.value)


@pytest.mark.asyncio
async def test_capacity_maps_to_safe_busy_without_provider_detail() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            headers={"content-type": "application/json"},
            json={"status": "error", "errormessage": "private provider detail"},
            request=request,
        )

    with pytest.raises(RemoteAstrometryBusy) as captured:
        await _adapter(handler).login()
    assert "private provider detail" not in repr(captured.value)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [500, 503])
async def test_provider_outage_maps_to_safe_unavailable(status: int) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status,
            headers={"content-type": "application/json"},
            json={"status": "error", "errormessage": "private provider detail"},
            request=request,
        )

    with pytest.raises(RemoteAstrometryUnavailable) as captured:
        await _adapter(handler).login()
    assert "private provider detail" not in repr(captured.value)


@pytest.mark.asyncio
async def test_provider_error_json_is_rejected_without_reflecting_error_message() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={"status": "error", "errormessage": "secret provider evidence"},
            request=request,
        )

    with pytest.raises(RemoteAstrometryRejected) as captured:
        await _adapter(handler).login()
    assert "secret provider evidence" not in str(captured.value)


@pytest.mark.asyncio
async def test_network_and_timeout_failures_are_fixed_and_cause_free() -> None:
    async def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private timeout", request=request)

    with pytest.raises(RemoteAstrometryTimeout) as timeout_error:
        await _adapter(timeout).login()
    assert "private timeout" not in repr(timeout_error.value)
    assert timeout_error.value.__cause__ is None

    async def network(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("private network", request=request)

    with pytest.raises(RemoteAstrometryUnavailable) as network_error:
        await _adapter(network).login()
    assert "private network" not in repr(network_error.value)
    assert network_error.value.__cause__ is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "headers,body",
    [
        ({"content-type": "text/html"}, b"{}"),
        ({"content-type": "application/json", "content-encoding": "gzip"}, b"{}"),
        ({"content-type": "application/json"}, b'{"status":"success","status":"failure"}'),
        ({"content-type": "application/json"}, b'{"status":NaN}'),
        ({"content-type": "application/json"}, b"[]"),
        ({"content-type": "application/json", "content-length": "not-a-number"}, b"{}"),
        ({"content-type": "application/json", "content-length": "65537"}, b"{}"),
    ],
)
async def test_malformed_or_ambiguous_responses_fail_closed(
    headers: dict[str, str], body: bytes
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers=headers, content=body, request=request)

    with pytest.raises(RemoteAstrometryProtocolError):
        await _adapter(handler).login()


@pytest.mark.asyncio
async def test_streamed_response_is_bounded_before_full_body_is_buffered() -> None:
    class OversizedStream(httpx.AsyncByteStream):
        def __init__(self) -> None:
            self.closed = False
            self.chunks = 0

        async def __aiter__(self) -> AsyncIterator[bytes]:
            self.chunks += 1
            yield b"x" * 65_536
            self.chunks += 1
            yield b"y"
            self.chunks += 1
            yield b"must-not-be-read"

        async def aclose(self) -> None:
            self.closed = True

    stream = OversizedStream()

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            stream=stream,
            request=request,
        )

    with pytest.raises(RemoteAstrometryProtocolError):
        await _adapter(handler).login()
    assert stream.closed is True
    assert stream.chunks == 2


def test_adapter_rejects_arbitrary_origin_and_non_secret_key_contract() -> None:
    with pytest.raises(ValueError, match="configuration is invalid"):
        RemoteNovaAdapter(api_url="https://example.com/api", api_key=SecretStr(_SECRET))
    with pytest.raises(ValueError, match="configuration is invalid"):
        RemoteNovaAdapter(api_url=_API, api_key=_SECRET)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_result_fetches_use_reviewed_calibration_annotations_and_fits_contract() -> None:
    requests: list[httpx.Request] = []
    wcs_bytes = b"SIMPLE  =                    T" + b" " * 128

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url.scheme == "https"
        assert request.url.host == "nova.astrometry.net"
        if request.url.path == "/api/jobs/201/calibration":
            assert request.method == "POST"
            assert _form_json(request) == {"session": _SESSION}
            return httpx.Response(
                200,
                headers={"content-type": "text/plain"},
                json={
                    "ra": 169.96633791366915,
                    "dec": 13.221011585315143,
                    "orientation": 74.25057920908068,
                    "parity": 1.0,
                    "pixscale": 1.0906710701159739,
                    "radius": 0.8106715896625917,
                    "width_arcsec": 5027.99,
                    "height_arcsec": 2964.44,
                },
                request=request,
            )
        if request.url.path == "/api/jobs/201/annotations":
            assert request.method == "POST"
            assert _form_json(request) == {"session": _SESSION}
            return httpx.Response(
                200,
                headers={"content-type": "text/plain"},
                json={
                    "annotations": [
                        {
                            "type": "ngc",
                            "names": ["NGC 3627", "M 66"],
                            "pixelx": 2950.8042732485815,
                            "pixely": 1861.4646281549635,
                            "radius": 282.7616882324219,
                        }
                    ]
                },
                request=request,
            )
        if request.url.path == "/wcs_file/201":
            assert request.method == "GET"
            assert request.headers["accept"] == "application/fits"
            assert request.headers["accept-encoding"] == "identity"
            assert _SESSION.encode() not in request.content
            assert _SECRET.encode() not in request.content
            return httpx.Response(
                200,
                headers={"content-type": "application/fits"},
                content=wcs_bytes,
                request=request,
            )
        raise AssertionError(request.url.path)

    adapter = _adapter(handler)
    session = NovaSession(_SESSION)
    calibration = await adapter.calibration(session, NovaJobId(201))
    annotations = await adapter.annotations(session, NovaJobId(201))
    wcs = await adapter.wcs_file(NovaJobId(201))

    assert calibration.ra_deg == pytest.approx(169.96633791366915)
    assert calibration.dec_deg == pytest.approx(13.221011585315143)
    assert calibration.orientation_deg == pytest.approx(74.25057920908068)
    assert calibration.parity == 1
    assert calibration.pixel_scale_arcsec_per_pixel == pytest.approx(1.0906710701159739)
    assert calibration.radius_deg == pytest.approx(0.8106715896625917)
    assert len(annotations) == 1
    assert annotations[0].category == "ngc"
    assert annotations[0].names == ("NGC 3627", "M 66")
    assert annotations[0].pixel_x == pytest.approx(2950.8042732485815)
    assert annotations[0].pixel_y == pytest.approx(1861.4646281549635)
    assert wcs == wcs_bytes
    assert [request.url.path for request in requests] == [
        "/api/jobs/201/calibration",
        "/api/jobs/201/annotations",
        "/wcs_file/201",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"ra": 360.0, "dec": 0.0, "orientation": 0.0, "parity": 1, "pixscale": 1.0, "radius": 1.0},
        {"ra": 1.0, "dec": 91.0, "orientation": 0.0, "parity": 1, "pixscale": 1.0, "radius": 1.0},
        {"ra": 1.0, "dec": 0.0, "orientation": 360.0, "parity": 1, "pixscale": 1.0, "radius": 1.0},
        {"ra": 1.0, "dec": 0.0, "orientation": 0.0, "parity": 0, "pixscale": 1.0, "radius": 1.0},
        {"ra": 1.0, "dec": 0.0, "orientation": 0.0, "parity": 1, "pixscale": 0.0, "radius": 1.0},
    ],
)
async def test_invalid_calibration_fails_closed(payload: dict[str, object]) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json=payload,
            request=request,
        )

    with pytest.raises(RemoteAstrometryProtocolError):
        await _adapter(handler).calibration(NovaSession(_SESSION), NovaJobId(1))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "annotation",
    [
        {"type": "NGC", "names": ["NGC 1"], "pixelx": 1.0, "pixely": 1.0},
        {"type": "ngc", "names": [], "pixelx": 1.0, "pixely": 1.0},
        {"type": "ngc", "names": ["NGC 1", "NGC 1"], "pixelx": 1.0, "pixely": 1.0},
        {"type": "ngc", "names": ["NGC 1"], "pixelx": -1.0, "pixely": 1.0},
    ],
)
async def test_invalid_annotation_shape_fails_closed(annotation: dict[str, object]) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={"annotations": [annotation]},
            request=request,
        )

    with pytest.raises(RemoteAstrometryProtocolError):
        await _adapter(handler).annotations(NovaSession(_SESSION), NovaJobId(1))


@pytest.mark.asyncio
async def test_annotation_count_is_bounded() -> None:
    annotation = {"type": "hd", "names": ["HD 1"], "pixelx": 1.0, "pixely": 1.0}

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            json={"annotations": [annotation] * 2_049},
            request=request,
        )

    with pytest.raises(RemoteAstrometryProtocolError):
        await _adapter(handler).annotations(NovaSession(_SESSION), NovaJobId(1))


@pytest.mark.asyncio
async def test_wcs_download_requires_fits_and_is_stream_bounded() -> None:
    async def wrong_type(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/octet-stream"},
            content=b"not-fits",
            request=request,
        )

    with pytest.raises(RemoteAstrometryProtocolError):
        await _adapter(wrong_type).wcs_file(NovaJobId(1))

    class OversizedWcs(httpx.AsyncByteStream):
        def __init__(self) -> None:
            self.chunks = 0
            self.closed = False

        async def __aiter__(self) -> AsyncIterator[bytes]:
            self.chunks += 1
            yield b"x" * 262_144
            self.chunks += 1
            yield b"y"
            self.chunks += 1
            yield b"must-not-be-read"

        async def aclose(self) -> None:
            self.closed = True

    stream = OversizedWcs()

    async def oversized(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/fits"},
            stream=stream,
            request=request,
        )

    with pytest.raises(RemoteAstrometryProtocolError):
        await _adapter(oversized).wcs_file(NovaJobId(1))
    assert stream.closed is True
    assert stream.chunks == 2
