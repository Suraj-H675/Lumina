"""Public identification response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from lumina.identification.domain.public_read import IdentificationPublicState

AnnotationName = Annotated[str, Field(min_length=1, max_length=128)]


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
    status: IdentificationPublicState
    progress: float | None = Field(ge=0.0, le=1.0)
    result: FakeSolverResultResponse | None
    error_code: str | None = Field(pattern=r"^[a-z][a-z0-9_.-]{0,127}$")
    solution_available: bool
    created_at: datetime
    completed_at: datetime | None
    deleted_at: datetime | None
    solver_type: Literal["fake", "nova"]
    remote_processing: bool
    retention_hours: int = Field(ge=1, le=168)


class IdentificationCalibrationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    center_ra_deg: float = Field(ge=0.0, lt=360.0)
    center_dec_deg: float = Field(ge=-90.0, le=90.0)
    orientation_deg: float = Field(ge=0.0, lt=360.0)
    parity: Literal[-1, 1]
    pixel_scale_arcsec_per_pixel: float = Field(gt=0.0, le=36_000.0)
    radius_deg: float = Field(gt=0.0, le=180.0)


class IdentificationWcsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    coordinate_frame: Literal["icrs", "fk5_j2000"]
    header: str = Field(min_length=1, max_length=65_536)
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    image_width: int = Field(ge=1, le=100_000)
    image_height: int = Field(ge=1, le=100_000)


class IdentificationAnnotationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str = Field(pattern=r"^[a-z0-9_.-]{1,32}$")
    names: tuple[AnnotationName, ...] = Field(min_length=1, max_length=16)
    pixel_x: float = Field(ge=0.0)
    pixel_y: float = Field(ge=0.0)
    ra_deg: float = Field(ge=0.0, lt=360.0)
    dec_deg: float = Field(ge=-90.0, le=90.0)


class IdentificationSolutionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    submission_id: UUID
    solver_type: Literal["nova"] = "nova"
    remote_processing: Literal[True] = True
    solver_name: Literal["astrometry.net-nova"] = "astrometry.net-nova"
    solver_version: str | None = Field(max_length=64)
    calibration: IdentificationCalibrationResponse
    wcs: IdentificationWcsResponse
    annotations: tuple[IdentificationAnnotationResponse, ...] = Field(max_length=50)
    next_cursor: str | None = Field(min_length=1, max_length=512)
    has_more: bool
