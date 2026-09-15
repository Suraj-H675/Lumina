"""Public Phase 6A identification response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from lumina.identification.domain.submissions import IdentificationSubmissionState


class FakeSolverResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Literal["fixture_solved"] = "fixture_solved"
    solver_type: Literal["fake"] = "fake"
    solver_version: Literal["phase6a-fixture-v1"] = "phase6a-fixture-v1"
    synthetic: Literal[True] = True


class IdentificationCapabilitiesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    solver_type: Literal["fake"] = "fake"
    remote_processing: Literal[False] = False
    accepted_media_types: tuple[Literal["image/jpeg", "image/png"], ...] = (
        "image/jpeg",
        "image/png",
    )
    max_bytes: int = Field(ge=1, le=100 * 1024 * 1024)
    max_pixels: int = Field(ge=1, le=100_000_000)
    min_dimension_px: Literal[32] = 32
    retention_hours: int = Field(ge=1, le=168)
    deletion_supported: Literal[True] = True


class IdentificationCreateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    submission_id: UUID
    job_id: UUID
    status: Literal["queued"] = "queued"
    solver_type: Literal["fake"] = "fake"
    remote_processing: Literal[False] = False
    retention_hours: int = Field(ge=1, le=168)


class IdentificationStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    submission_id: UUID
    job_id: UUID | None
    status: IdentificationSubmissionState
    progress: float = Field(ge=0.0, le=1.0)
    result: FakeSolverResultResponse | None
    error_code: str | None
    created_at: datetime
    completed_at: datetime | None
    deleted_at: datetime | None
    solver_type: Literal["fake"] = "fake"
    remote_processing: Literal[False] = False
    retention_hours: int = Field(ge=1, le=168)
