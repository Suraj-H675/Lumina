"""Versioned public schemas for Relativity Visualizations v1."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, StrictFloat, StrictInt, StrictStr


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RelativityVisualizationsInputResponse(_ResponseModel):
    relative_speed_fraction_c: StrictFloat
    proper_time_s: StrictFloat
    proper_length_m: StrictFloat
    simultaneous_event_separation_m: StrictFloat


class RelativityVisualizationsCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: RelativityVisualizationsInputResponse
    relative_speed_m_s: StrictFloat
    lorentz_factor: StrictFloat
    dilated_time_s: StrictFloat
    contracted_length_m: StrictFloat
    simultaneity_offset_s: StrictFloat
    simultaneity_interpretation: StrictStr
    time_dilation_note: StrictStr
    length_contraction_note: StrictStr
    light_cone_note: StrictStr
    model_note: StrictStr


__all__ = [
    "RelativityVisualizationsCalculationResponse",
    "RelativityVisualizationsInputResponse",
]
