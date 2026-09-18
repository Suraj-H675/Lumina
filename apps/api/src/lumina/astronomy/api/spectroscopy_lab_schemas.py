"""Versioned public schemas for the Spectroscopy Lab v1 boundary."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SpectroscopyInputResponse(_ResponseModel):
    mode: Literal["continuum", "emission", "absorption", "doppler", "element_match"]
    temperature_k: StrictFloat
    selected_elements: list[Literal["H I", "He I", "Na I", "Ca II"]] = Field(max_length=4)
    radial_velocity_km_s: StrictFloat
    resolving_power: StrictFloat
    noise_sigma: StrictFloat
    noise_seed: StrictInt


class SpectroscopyRepresentativeLineResponse(_ResponseModel):
    element: Literal["H I", "He I", "Na I", "Ca II"]
    label: StrictStr
    rest_wavelength_vacuum_nm: StrictFloat
    shifted_wavelength_vacuum_nm: StrictFloat
    illustrative_fwhm_nm: StrictFloat
    nist_relative_intensity: StrictStr


class SpectroscopyElementFingerprintResponse(_ResponseModel):
    element: Literal["H I", "He I", "Na I", "Ca II"]
    representative_line_count: StrictInt


class SpectroscopyCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: SpectroscopyInputResponse
    wien_peak_nm: StrictFloat
    doppler_factor: StrictFloat
    wavelength_nm: list[StrictFloat] = Field(max_length=741)
    normalized_flux: list[StrictFloat] = Field(max_length=741)
    representative_lines: list[SpectroscopyRepresentativeLineResponse] = Field(max_length=12)
    fingerprints: list[SpectroscopyElementFingerprintResponse] = Field(max_length=4)
    identification_explanation: StrictStr
    continuum_note: StrictStr
    line_strength_note: StrictStr
    resolution_note: StrictStr
    noise_note: StrictStr


__all__ = [
    "SpectroscopyCalculationResponse",
    "SpectroscopyElementFingerprintResponse",
    "SpectroscopyInputResponse",
    "SpectroscopyRepresentativeLineResponse",
]
