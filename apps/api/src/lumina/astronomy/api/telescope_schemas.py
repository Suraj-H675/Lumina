"""Versioned public schemas for Telescope Builder's calculation boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

from lumina.astronomy.domain.telescope_builder import (
    OpticalModifierKind,
    TelescopeTargetFit,
    TelescopeType,
    TelescopeWarningCode,
)


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TelescopeBuilderInputResponse(_ResponseModel):
    """Normalized validated inputs echoed by the deterministic result."""

    aperture_mm: StrictFloat = Field(description="Clear nominal aperture in millimetres.")
    telescope_focal_length_mm: StrictFloat = Field(
        description="Native telescope focal length in millimetres."
    )
    telescope_type: TelescopeType
    eyepiece_focal_length_mm: StrictFloat = Field(
        description="Hypothetical eyepiece focal length in millimetres."
    )
    eyepiece_apparent_field_deg: StrictFloat = Field(
        description="Nominal eyepiece apparent field in degrees."
    )
    optical_modifier_kind: OpticalModifierKind
    optical_modifier_factor: StrictFloat = Field(
        description="Supplied effective focal-length multiplier."
    )
    target_angular_size_arcmin: StrictFloat = Field(
        description="Scalar target angular extent in arcminutes."
    )


class TelescopeBuilderCalculationResponse(_ResponseModel):
    """Complete public result for one Telescope Builder evaluation."""

    model_version: StrictStr
    schema_version: StrictInt
    inputs: TelescopeBuilderInputResponse
    effective_focal_length_mm: StrictFloat
    native_focal_ratio: StrictFloat
    effective_focal_ratio: StrictFloat
    magnification_x: StrictFloat
    approx_true_field_deg: StrictFloat
    exit_pupil_mm: StrictFloat
    dawes_limit_arcsec: StrictFloat
    rayleigh_limit_arcsec: StrictFloat
    ideal_light_gathering_ratio_vs_7mm_pupil: StrictFloat
    target_angular_size_deg: StrictFloat
    target_field_fraction: StrictFloat
    target_fit: TelescopeTargetFit
    warning_codes: list[TelescopeWarningCode]


__all__ = [
    "TelescopeBuilderCalculationResponse",
    "TelescopeBuilderInputResponse",
]
