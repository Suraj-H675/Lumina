"""HTTP contracts for the Phase 6A private identification surface."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.bootstrap import create_app
from lumina.identification.api.routes import router as identification_router
from lumina.identification.api.schemas import IdentificationStatusResponse
from lumina.identification.application.submissions import (
    StartedRemoteIdentification,
    SubmittedIdentification,
)
from lumina.identification.domain.public_read import (
    IdentificationPublicState,
    IdentificationSolutionNotReady,
    PublicIdentificationStatus,
    PublicSolutionPage,
)
from lumina.identification.domain.solution import (
    AstrometricFrame,
    NormalizedWcs,
    PlateAnnotation,
    PlateCalibration,
)
from lumina.identification.domain.submissions import (
    FakeSolverResult,
    IdentificationSolverType,
    IdentificationSubmissionState,
    SubmissionNotFound,
    SubmissionStorageFailure,
)
from lumina.identification.domain.uploads import (
    UploadMalformed,
    UploadTooLarge,
    UploadTypeUnsupported,
)
from lumina.settings import AppSettings
from pydantic import ValidationError

_SUBMISSION_ID = UUID("71000000-0000-4000-8000-000000000001")
_JOB_ID = UUID("72000000-0000-4000-8000-000000000001")
_NOW = datetime(2026, 9, 15, 12, tzinfo=UTC)


def _app(tmp_path: Path, **overrides: object) -> FastAPI:
    values: dict[str, object] = {
        "LUMINA_ENV": "test",
        "LUMINA_LOG_LEVEL": "CRITICAL",
        "LUMINA_ENABLE_API_DOCS": False,
        "LUMINA_DATABASE_URL": (
            "postgresql+asyncpg://route_test:nonsecret@127.0.0.1:1/lumina_route_test"
        ),
        "LUMINA_STORAGE_LOCAL_ROOT": str(tmp_path / "private-storage"),
    }
    values.update(overrides)
    return create_app(AppSettings.model_validate(values))


def _request(
    app: FastAPI,
    method: str,
    path: str,
    **kwargs: Any,
) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return anyio.run(send)


@dataclass
class SubmitSpy:
    failure: BaseException | None = None
    calls: list[tuple[bytes, object, str | None]] = field(default_factory=list)

    async def submit(
        self,
        content: bytes,
        *,
        original_filename: object,
        declared_media_type: str | None,
    ) -> SubmittedIdentification:
        self.calls.append((content, original_filename, declared_media_type))
        if self.failure is not None:
            raise self.failure
        return SubmittedIdentification(_SUBMISSION_ID, _JOB_ID)


@dataclass
class RemoteStartSpy:
    failure: BaseException | None = None
    calls: list[tuple[bytes, object, str | None]] = field(default_factory=list)

    async def start(
        self,
        content: bytes,
        *,
        original_filename: object,
        declared_media_type: str | None,
    ) -> StartedRemoteIdentification:
        self.calls.append((content, original_filename, declared_media_type))
        if self.failure is not None:
            raise self.failure
        return StartedRemoteIdentification(_SUBMISSION_ID)


@dataclass
class PublicReadSpy:
    status_value: PublicIdentificationStatus | BaseException
    solution_value: PublicSolutionPage | BaseException | None = None
    status_calls: list[UUID] = field(default_factory=list)
    solution_calls: list[tuple[UUID, object | None]] = field(default_factory=list)

    async def status(self, submission_id: UUID) -> PublicIdentificationStatus:
        self.status_calls.append(submission_id)
        if isinstance(self.status_value, BaseException):
            raise self.status_value
        return self.status_value

    async def solution(
        self, submission_id: UUID, *, cursor: object | None = None
    ) -> PublicSolutionPage:
        self.solution_calls.append((submission_id, cursor))
        if isinstance(self.solution_value, BaseException):
            raise self.solution_value
        if self.solution_value is None:
            raise AssertionError("solution was not configured")
        return self.solution_value


@dataclass
class DeleteSpy:
    failure: BaseException | None = None
    calls: list[UUID] = field(default_factory=list)

    async def delete(self, submission_id: UUID) -> object:
        self.calls.append(submission_id)
        if self.failure is not None:
            raise self.failure
        return object()


def _status(
    state: IdentificationSubmissionState = IdentificationSubmissionState.SUCCEEDED,
) -> PublicIdentificationStatus:
    terminal = state in {
        IdentificationSubmissionState.SUCCEEDED,
        IdentificationSubmissionState.FAILED,
        IdentificationSubmissionState.DEAD_LETTER,
    }
    return PublicIdentificationStatus(
        submission_id=_SUBMISSION_ID,
        job_id=_JOB_ID,
        solver_type=IdentificationSolverType.FAKE,
        remote_processing=False,
        state=IdentificationPublicState(state.value),
        progress=1.0 if terminal else 0.0,
        fake_result=(
            FakeSolverResult() if state is IdentificationSubmissionState.SUCCEEDED else None
        ),
        error_code="job.handler_non_retryable"
        if state
        in {IdentificationSubmissionState.FAILED, IdentificationSubmissionState.DEAD_LETTER}
        else None,
        solution_available=False,
        created_at=_NOW,
        completed_at=_NOW if terminal else None,
        deleted_at=None,
    )


def _solution() -> PublicSolutionPage:
    return PublicSolutionPage(
        submission_id=_SUBMISSION_ID,
        calibration=PlateCalibration(120.0, 20.0, 45.0, -1, 1.2, 0.5),
        wcs=NormalizedWcs(
            AstrometricFrame.FK5_J2000,
            "WCSAXES =                    2",
            "e" * 64,
            1000,
            800,
        ),
        annotations=(PlateAnnotation("ngc", ("NGC 1",), 10.0, 20.0, 119.99, 20.01),),
        solver_name="astrometry.net-nova",
        solver_version=None,
        next_cursor=None,
        has_more=False,
    )


def test_identification_routes_are_exact_and_add_only_the_solution_read() -> None:
    routes = [route for route in identification_router.routes if isinstance(route, APIRoute)]
    assert [(route.path, route.methods) for route in routes] == [
        ("/api/v1/identification/capabilities", {"GET"}),
        ("/api/v1/identification/submissions", {"POST"}),
        ("/api/v1/identification/submissions/{submission_id}", {"GET"}),
        ("/api/v1/identification/submissions/{submission_id}/solution", {"GET"}),
        ("/api/v1/identification/submissions/{submission_id}", {"DELETE"}),
    ]


def test_capabilities_exposes_only_safe_authoritative_policy(tmp_path: Path) -> None:
    app = _app(
        tmp_path,
        LUMINA_UPLOAD_MAX_BYTES=123456,
        LUMINA_UPLOAD_MAX_PIXELS=654321,
        LUMINA_UPLOAD_RETENTION_HOURS=36,
    )

    response = _request(app, "GET", "/api/v1/identification/capabilities")

    assert response.status_code == 200
    assert response.json() == {
        "solver_type": "fake",
        "remote_processing": False,
        "accepted_media_types": ["image/jpeg", "image/png"],
        "max_bytes": 123456,
        "max_pixels": 654321,
        "min_dimension_px": 32,
        "retention_hours": 36,
        "deletion_supported": True,
    }
    serialized = response.text.lower()
    for forbidden in ("storage", "database", "queue", "credential", "path"):
        assert forbidden not in serialized


def test_capabilities_advertises_nova_only_when_explicitly_enabled(tmp_path: Path) -> None:
    app = _app(
        tmp_path,
        LUMINA_ENABLE_REMOTE_ASTROMETRY=True,
        LUMINA_ASTROMETRY_API_KEY="server-secret-sentinel",
    )

    response = _request(app, "GET", "/api/v1/identification/capabilities")

    assert response.status_code == 200
    assert response.json()["solver_type"] == "nova"
    assert response.json()["remote_processing"] is True
    serialized = response.text.lower()
    for forbidden in ("api_key", "credential", "external", "nova.astrometry.net"):
        assert forbidden not in serialized


def test_capabilities_rejects_query_parameters(tmp_path: Path) -> None:
    response = _request(
        _app(tmp_path),
        "GET",
        "/api/v1/identification/capabilities?debug=true",
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"


def test_create_returns_coherent_queued_pair_without_private_metadata(tmp_path: Path) -> None:
    app = _app(tmp_path)
    service = SubmitSpy()
    app.state.identification_submit_service = service
    content = b"bounded-fixture"

    response = _request(
        app,
        "POST",
        "/api/v1/identification/submissions",
        files={"file": ("night.png", content, "image/png")},
        data={"consent_remote_processing": "false"},
    )

    assert response.status_code == 202
    assert response.json() == {
        "submission_id": str(_SUBMISSION_ID),
        "job_id": str(_JOB_ID),
        "status": "queued",
        "solver_type": "fake",
        "remote_processing": False,
        "retention_hours": 24,
    }
    assert service.calls == [(content, "night.png", "image/png")]
    assert "filename" not in response.text.lower()
    assert "sha256" not in response.text.lower()
    assert "storage" not in response.text.lower()


def test_remote_processing_consent_is_rejected_before_submission(tmp_path: Path) -> None:
    app = _app(tmp_path)
    service = SubmitSpy()
    app.state.identification_submit_service = service

    response = _request(
        app,
        "POST",
        "/api/v1/identification/submissions",
        files={"file": ("night.png", b"fixture", "image/png")},
        data={"consent_remote_processing": "true"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "feature.not_available"
    assert service.calls == []


def test_enabled_remote_solver_requires_explicit_consent_before_reading_upload(
    tmp_path: Path,
) -> None:
    app = _app(
        tmp_path,
        LUMINA_ENABLE_REMOTE_ASTROMETRY=True,
        LUMINA_ASTROMETRY_API_KEY="server-secret-sentinel",
    )
    remote = RemoteStartSpy()
    app.state.identification_remote_start_service = remote

    response = _request(
        app,
        "POST",
        "/api/v1/identification/submissions",
        files={"file": ("night.png", b"fixture", "image/png")},
        data={"consent_remote_processing": "false"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "identification.remote_consent_required"
    assert remote.calls == []


def test_enabled_remote_solver_starts_only_after_consent_without_provider_ids(
    tmp_path: Path,
) -> None:
    app = _app(
        tmp_path,
        LUMINA_ENABLE_REMOTE_ASTROMETRY=True,
        LUMINA_ASTROMETRY_API_KEY="server-secret-sentinel",
    )
    remote = RemoteStartSpy()
    fake = SubmitSpy()
    app.state.identification_remote_start_service = remote
    app.state.identification_submit_service = fake
    content = b"remote-bounded-fixture"

    response = _request(
        app,
        "POST",
        "/api/v1/identification/submissions",
        files={"file": ("night.png", content, "image/png")},
        data={"consent_remote_processing": "true"},
    )

    assert response.status_code == 202
    assert response.json() == {
        "submission_id": str(_SUBMISSION_ID),
        "job_id": None,
        "status": "submitting",
        "solver_type": "nova",
        "remote_processing": True,
        "retention_hours": 24,
    }
    assert remote.calls == [(content, "night.png", "image/png")]
    assert fake.calls == []
    serialized = response.text.lower()
    for forbidden in ("api_key", "external_job", "external_submission", "filename", "storage"):
        assert forbidden not in serialized


def test_file_byte_limit_is_enforced_after_multipart_parsing(tmp_path: Path) -> None:
    app = _app(tmp_path, LUMINA_UPLOAD_MAX_BYTES=8)
    service = SubmitSpy()
    app.state.identification_submit_service = service

    response = _request(
        app,
        "POST",
        "/api/v1/identification/submissions",
        files={"file": ("night.png", b"123456789", "image/png")},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "upload.too_large"
    assert service.calls == []


def test_asgi_body_bound_rejects_large_multipart_before_route_service(tmp_path: Path) -> None:
    app = _app(tmp_path, LUMINA_UPLOAD_MAX_BYTES=8)
    service = SubmitSpy()
    app.state.identification_submit_service = service

    response = _request(
        app,
        "POST",
        "/api/v1/identification/submissions",
        files={"file": ("night.png", b"x" * 70_000, "image/png")},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request.body_too_large"
    assert service.calls == []


@pytest.mark.parametrize(
    ("failure", "status_code", "code"),
    [
        (UploadTooLarge(), 413, "upload.too_large"),
        (UploadTypeUnsupported(), 415, "upload.invalid_type"),
        (UploadMalformed(), 422, "request.validation_failed"),
        (SubmissionStorageFailure(), 503, "identification.unavailable"),
    ],
)
def test_create_maps_only_safe_fixed_failures(
    tmp_path: Path,
    failure: BaseException,
    status_code: int,
    code: str,
) -> None:
    app = _app(tmp_path)
    app.state.identification_submit_service = SubmitSpy(failure=failure)

    response = _request(
        app,
        "POST",
        "/api/v1/identification/submissions",
        files={"file": ("PRIVATE-NAME.png", b"PRIVATE-BYTES", "image/png")},
    )

    assert response.status_code == status_code
    assert response.json()["error"]["code"] == code
    assert "PRIVATE-NAME" not in response.text
    assert "PRIVATE-BYTES" not in response.text


def test_status_returns_only_validated_synthetic_result_and_safe_job_state(tmp_path: Path) -> None:
    app = _app(tmp_path)
    service = PublicReadSpy(_status())
    app.state.identification_public_read_service = service

    response = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}",
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "submission_id": str(_SUBMISSION_ID),
        "job_id": str(_JOB_ID),
        "status": "succeeded",
        "progress": 1.0,
        "result": {
            "outcome": "fixture_solved",
            "solver_type": "fake",
            "solver_version": "phase6a-fixture-v1",
            "synthetic": True,
        },
        "error_code": None,
        "solution_available": False,
        "created_at": _NOW.isoformat().replace("+00:00", "Z"),
        "completed_at": _NOW.isoformat().replace("+00:00", "Z"),
        "deleted_at": None,
        "solver_type": "fake",
        "remote_processing": False,
        "retention_hours": 24,
    }
    assert service.status_calls == [_SUBMISSION_ID]
    for forbidden in ("filename", "sha256", "storage_object", "payload"):
        assert forbidden not in response.text.lower()


def test_status_schema_rejects_cross_solver_mode_mixtures() -> None:
    base = {
        "submission_id": _SUBMISSION_ID,
        "job_id": _JOB_ID,
        "status": "queued",
        "progress": 0.0,
        "result": None,
        "error_code": None,
        "solution_available": False,
        "created_at": _NOW,
        "completed_at": None,
        "deleted_at": None,
        "solver_type": "fake",
        "remote_processing": False,
        "retention_hours": 24,
    }
    IdentificationStatusResponse.model_validate(base)
    IdentificationStatusResponse.model_validate(
        {
            **base,
            "job_id": None,
            "status": "succeeded",
            "progress": None,
            "solver_type": "nova",
            "remote_processing": True,
            "solution_available": True,
        }
    )
    for invalid in (
        {**base, "remote_processing": True},
        {**base, "solver_type": "nova", "remote_processing": True},
        {
            **base,
            "job_id": None,
            "status": "succeeded",
            "progress": None,
            "solver_type": "nova",
            "remote_processing": True,
            "solution_available": False,
        },
    ):
        with pytest.raises(ValidationError):
            IdentificationStatusResponse.model_validate(invalid)


def test_status_not_found_is_safe_and_does_not_reflect_identifier(tmp_path: Path) -> None:
    app = _app(tmp_path)
    app.state.identification_public_read_service = PublicReadSpy(SubmissionNotFound())

    response = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}",
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "identification.not_found"
    assert str(_SUBMISSION_ID) not in response.text


def test_delete_is_idempotent_for_existing_deleted_or_missing_submission(tmp_path: Path) -> None:
    app = _app(tmp_path)
    success = DeleteSpy()
    app.state.identification_delete_service = success
    first = _request(
        app,
        "DELETE",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}",
    )
    assert first.status_code == 204
    assert first.content == b""
    assert success.calls == [_SUBMISSION_ID]

    missing = DeleteSpy(failure=SubmissionNotFound())
    app.state.identification_delete_service = missing
    second = _request(
        app,
        "DELETE",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}",
    )
    assert second.status_code == 204
    assert second.content == b""


def test_identification_routes_reject_query_options(tmp_path: Path) -> None:
    app = _app(tmp_path)
    app.state.identification_public_read_service = PublicReadSpy(_status())
    response = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}?include=private",
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"


def test_solution_returns_only_normalized_bounded_science(tmp_path: Path) -> None:
    app = _app(tmp_path)
    service = PublicReadSpy(_status(), _solution())
    app.state.identification_public_read_service = service

    response = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}/solution",
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json() == {
        "submission_id": str(_SUBMISSION_ID),
        "solver_type": "nova",
        "remote_processing": True,
        "solver_name": "astrometry.net-nova",
        "solver_version": None,
        "calibration": {
            "center_ra_deg": 120.0,
            "center_dec_deg": 20.0,
            "orientation_deg": 45.0,
            "parity": -1,
            "pixel_scale_arcsec_per_pixel": 1.2,
            "radius_deg": 0.5,
        },
        "wcs": {
            "coordinate_frame": "fk5_j2000",
            "header": "WCSAXES =                    2",
            "source_sha256": "e" * 64,
            "image_width": 1000,
            "image_height": 800,
        },
        "annotations": [
            {
                "category": "ngc",
                "names": ["NGC 1"],
                "pixel_x": 10.0,
                "pixel_y": 20.0,
                "ra_deg": 119.99,
                "dec_deg": 20.01,
            }
        ],
        "next_cursor": None,
        "has_more": False,
    }
    assert service.solution_calls == [(_SUBMISSION_ID, None)]
    serialized = response.text.lower()
    for forbidden in (
        "external_job_id",
        "external_submission_id",
        "filename",
        "storage_object",
        "api_key",
    ):
        assert forbidden not in serialized


def test_solution_not_ready_is_a_safe_conflict(tmp_path: Path) -> None:
    app = _app(tmp_path)
    app.state.identification_public_read_service = PublicReadSpy(
        _status(),
        IdentificationSolutionNotReady(),
    )

    response = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}/solution",
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "identification.solution_not_available"


def test_solution_rejects_unknown_or_duplicate_query_options(tmp_path: Path) -> None:
    app = _app(tmp_path)
    service = PublicReadSpy(_status(), _solution())
    app.state.identification_public_read_service = service

    unknown = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}/solution?debug=true",
    )
    duplicate = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}/solution?cursor=abc&cursor=def",
    )

    assert unknown.status_code == 422
    assert duplicate.status_code == 422
    assert service.solution_calls == []
