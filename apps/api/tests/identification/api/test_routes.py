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
from lumina.identification.application.submissions import SubmittedIdentification
from lumina.identification.domain.submissions import (
    FakeSolverResult,
    IdentificationSubmissionState,
    IdentificationSubmissionStatus,
    SubmissionNotFound,
    SubmissionStorageFailure,
)
from lumina.identification.domain.uploads import (
    UploadMalformed,
    UploadTooLarge,
    UploadTypeUnsupported,
)
from lumina.settings import AppSettings

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
class StatusSpy:
    status: IdentificationSubmissionStatus | BaseException
    calls: list[UUID] = field(default_factory=list)

    async def read(self, submission_id: UUID) -> IdentificationSubmissionStatus:
        self.calls.append(submission_id)
        if isinstance(self.status, BaseException):
            raise self.status
        return self.status


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
) -> IdentificationSubmissionStatus:
    terminal = state in {
        IdentificationSubmissionState.SUCCEEDED,
        IdentificationSubmissionState.FAILED,
        IdentificationSubmissionState.DEAD_LETTER,
    }
    return IdentificationSubmissionStatus(
        submission_id=_SUBMISSION_ID,
        job_id=_JOB_ID,
        state=state,
        progress=1.0 if terminal else 0.0,
        result=FakeSolverResult() if state is IdentificationSubmissionState.SUCCEEDED else None,
        error_code="job.handler_non_retryable"
        if state
        in {IdentificationSubmissionState.FAILED, IdentificationSubmissionState.DEAD_LETTER}
        else None,
        created_at=_NOW,
        completed_at=_NOW if terminal else None,
        deleted_at=None,
    )


def test_identification_routes_are_exact_and_have_no_solution_endpoint() -> None:
    routes = [route for route in identification_router.routes if isinstance(route, APIRoute)]
    assert [(route.path, route.methods) for route in routes] == [
        ("/api/v1/identification/capabilities", {"GET"}),
        ("/api/v1/identification/submissions", {"POST"}),
        ("/api/v1/identification/submissions/{submission_id}", {"GET"}),
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
    service = StatusSpy(_status())
    app.state.identification_status_service = service

    response = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}",
    )

    assert response.status_code == 200
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
        "created_at": _NOW.isoformat().replace("+00:00", "Z"),
        "completed_at": _NOW.isoformat().replace("+00:00", "Z"),
        "deleted_at": None,
        "solver_type": "fake",
        "remote_processing": False,
        "retention_hours": 24,
    }
    assert service.calls == [_SUBMISSION_ID]
    for forbidden in ("filename", "sha256", "storage_object", "payload"):
        assert forbidden not in response.text.lower()


def test_status_not_found_is_safe_and_does_not_reflect_identifier(tmp_path: Path) -> None:
    app = _app(tmp_path)
    app.state.identification_status_service = StatusSpy(SubmissionNotFound())

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
    app.state.identification_status_service = StatusSpy(_status())
    response = _request(
        app,
        "GET",
        f"/api/v1/identification/submissions/{_SUBMISSION_ID}?include=private",
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"
