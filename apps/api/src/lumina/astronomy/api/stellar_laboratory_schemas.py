"""Versioned public schemas for Stellar Laboratory's approximate model boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class StellarLaboratoryInputResponse(_ResponseModel):
    initial_mass_msun: StrictFloat


class StellarLaboratoryCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: StellarLaboratoryInputResponse
    luminosity_lsun: StrictFloat
    radius_rsun: StrictFloat
    effective_temperature_k: StrictFloat
    nearest_spectral_type_anchor: StrictStr
    colour_anchor_mass_msun: StrictFloat
    approximate_b_minus_v_mag: StrictFloat
    main_sequence_lifetime_years: StrictFloat
    evolutionary_path: list[StrictStr] = Field(min_length=3, max_length=4)
    expected_remnant: StrictStr
    remnant_boundary_note: StrictStr
    metallicity_scope: StrictStr


__all__ = [
    "StellarLaboratoryCalculationResponse",
    "StellarLaboratoryInputResponse",
]
