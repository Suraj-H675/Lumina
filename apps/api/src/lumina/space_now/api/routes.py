"""Read-only HTTP translation for the Space Now Daily Visual."""

from __future__ import annotations

import json
from typing import Any, Final, cast

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from lumina.provenance.application.read import ProviderSnapshotReadError
from lumina.provenance.domain.runtime import ProviderStorageFailure
from lumina.shared.api.errors import ErrorResponse, error_response
from lumina.space_now.application.read import (
    ApodProjection,
    ApodReadService,
    NearEarthProjection,
    NearEarthReadService,
    SpaceWeatherProjection,
    SpaceWeatherReadService,
)

from .schemas import (
    ApodContentResponse,
    ApodFreshnessResponse,
    ApodResponse,
    ApodSourceResponse,
    NearEarthEncounterResponse,
    NearEarthFreshnessResponse,
    NearEarthResponse,
    NearEarthSourceResponse,
    NearEarthWindowResponse,
    SpaceWeatherAuroraResponse,
    SpaceWeatherFreshnessResponse,
    SpaceWeatherImpactResponse,
    SpaceWeatherKpResponse,
    SpaceWeatherKpRowResponse,
    SpaceWeatherNotificationResponse,
    SpaceWeatherResponse,
    SpaceWeatherScaleResponse,
    SpaceWeatherScalesResponse,
    SpaceWeatherSolarWindResponse,
    SpaceWeatherSourceResponse,
)

router = APIRouter(prefix="/api/v1/now", tags=["space-now"])
_ERROR_RESPONSES: dict[int, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Daily Visual request must not contain query parameters.",
    },
    503: {
        "model": ErrorResponse,
        "description": "The Daily Visual read projection is temporarily unavailable.",
    },
}
_NEAR_EARTH_ERROR_RESPONSES: dict[int, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Near-Earth Objects request must not contain query parameters.",
    },
    503: {
        "model": ErrorResponse,
        "description": "The Near-Earth Objects read projection is temporarily unavailable.",
    },
}
_SPACE_WEATHER_ERROR_RESPONSES: dict[int, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Space Weather request must not contain query parameters.",
    },
    503: {
        "model": ErrorResponse,
        "description": "The Space Weather read projection is temporarily unavailable.",
    },
}
_SPACE_WEATHER_PUBLIC_RESPONSE_MAX_BYTES: Final = 61_440


@router.get(
    "/apod",
    operation_id="get_now_apod",
    response_model=ApodResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def now_apod(request: Request) -> ApodResponse | JSONResponse:
    """Return the durable last-known-good APOD projection without fetching NASA."""
    if request.query_params:
        return error_response(
            request,
            status_code=422,
            code="request.validation_failed",
            message="The request could not be validated.",
        )
    service: ApodReadService = request.app.state.apod_read_service
    try:
        projection = await service.read()
    except (ProviderSnapshotReadError, ProviderStorageFailure):
        return error_response(
            request,
            status_code=503,
            code="now.apod_unavailable",
            message="The Daily Visual is temporarily unavailable.",
        )
    return _response(projection)


@router.get(
    "/near-earth",
    operation_id="get_now_near_earth",
    response_model=NearEarthResponse,
    responses=cast(Any, _NEAR_EARTH_ERROR_RESPONSES),
)
async def now_near_earth(request: Request) -> NearEarthResponse | JSONResponse:
    """Return the durable last-known-good NeoWs projection without fetching NASA."""
    if request.query_params:
        return error_response(
            request,
            status_code=422,
            code="request.validation_failed",
            message="The request could not be validated.",
        )
    service: NearEarthReadService = request.app.state.near_earth_read_service
    try:
        projection = await service.read()
    except (ProviderSnapshotReadError, ProviderStorageFailure):
        return error_response(
            request,
            status_code=503,
            code="now.near_earth_unavailable",
            message="Near-Earth approach data is temporarily unavailable.",
        )
    return _near_earth_response(projection)


@router.get(
    "/space-weather",
    operation_id="get_now_space_weather",
    response_model=SpaceWeatherResponse,
    responses=cast(Any, _SPACE_WEATHER_ERROR_RESPONSES),
)
async def now_space_weather(request: Request) -> SpaceWeatherResponse | JSONResponse:
    """Return the durable SWPC projection without fetching NOAA."""
    if request.query_params:
        return error_response(
            request,
            status_code=422,
            code="request.validation_failed",
            message="The request could not be validated.",
        )
    service: SpaceWeatherReadService = request.app.state.space_weather_read_service
    try:
        projection = await service.read()
    except (ProviderSnapshotReadError, ProviderStorageFailure):
        return error_response(
            request,
            status_code=503,
            code="now.space_weather_unavailable",
            message="Space Weather data is currently unavailable.",
        )
    return _space_weather_response(projection)


def _response(projection: ApodProjection) -> ApodResponse:
    content = projection.content
    return ApodResponse(
        availability=projection.availability,
        unavailable_reason=projection.unavailable_reason,
        content=(
            None
            if content is None
            else ApodContentResponse(
                date=content.date,
                title=content.title,
                explanation=content.explanation,
                media_type=content.media_type,
                copyright=content.copyright,
                service_version=content.service_version,
                apod_page_url=content.apod_page_url,
            )
        ),
        freshness=ApodFreshnessResponse(
            cache_state=projection.freshness.cache_state,
            retrieved_at=projection.freshness.retrieved_at,
            fresh_until=projection.freshness.fresh_until,
            stale_until=projection.freshness.stale_until,
            last_refresh_failure_code=projection.freshness.last_refresh_failure_code,
        ),
        source=ApodSourceResponse(
            name=projection.source.name,
            official_url=projection.source.official_url,
            api_documentation_url=projection.source.api_documentation_url,
            media_usage_url=projection.source.media_usage_url,
            attribution_text=projection.source.attribution_text,
        ),
    )


def _near_earth_response(projection: NearEarthProjection) -> NearEarthResponse:
    return NearEarthResponse(
        availability=projection.availability,
        unavailable_reason=projection.unavailable_reason,
        window=(
            None
            if projection.window is None
            else NearEarthWindowResponse(
                start_date=projection.window.start_date,
                end_date=projection.window.end_date,
            )
        ),
        total_encounter_count=projection.total_encounter_count,
        returned_encounter_count=projection.returned_encounter_count,
        encounters=tuple(
            NearEarthEncounterResponse(
                encounter_id=encounter.encounter_id,
                object_id=encounter.object_id,
                neo_reference_id=encounter.neo_reference_id,
                name=encounter.name,
                approach_date=encounter.approach_date,
                approach_time_text=encounter.approach_time_text,
                absolute_magnitude_h=encounter.absolute_magnitude_h,
                nominal_distance_km=encounter.nominal_distance_km,
                nominal_distance_lunar=encounter.nominal_distance_lunar,
                relative_velocity_km_s=encounter.relative_velocity_km_s,
                estimated_diameter_min_m=encounter.estimated_diameter_min_m,
                estimated_diameter_max_m=encounter.estimated_diameter_max_m,
                is_potentially_hazardous_asteroid=encounter.is_potentially_hazardous_asteroid,
                distance_uncertainty_status=encounter.distance_uncertainty_status,
                time_uncertainty_status=encounter.time_uncertainty_status,
            )
            for encounter in projection.encounters
        ),
        freshness=NearEarthFreshnessResponse(
            cache_state=projection.freshness.cache_state,
            retrieved_at=projection.freshness.retrieved_at,
            fresh_until=projection.freshness.fresh_until,
            stale_until=projection.freshness.stale_until,
            last_refresh_failure_code=projection.freshness.last_refresh_failure_code,
        ),
        source=NearEarthSourceResponse(
            name=projection.source.name,
            official_documentation_url=projection.source.official_documentation_url,
            attribution_text=projection.source.attribution_text,
        ),
    )


def _space_weather_response(projection: SpaceWeatherProjection) -> SpaceWeatherResponse:
    response = SpaceWeatherResponse(
        availability=projection.availability,
        unavailable_reason=projection.unavailable_reason,
        scales=(
            None
            if projection.scales is None
            else SpaceWeatherScalesResponse(
                date_text=projection.scales.date_text,
                time_text=projection.scales.time_text,
                radio_blackout=SpaceWeatherScaleResponse(
                    level=projection.scales.radio_blackout.level,
                    text=projection.scales.radio_blackout.text,
                ),
                solar_radiation=SpaceWeatherScaleResponse(
                    level=projection.scales.solar_radiation.level,
                    text=projection.scales.solar_radiation.text,
                ),
                geomagnetic=SpaceWeatherScaleResponse(
                    level=projection.scales.geomagnetic.level,
                    text=projection.scales.geomagnetic.text,
                ),
            )
        ),
        kp=SpaceWeatherKpResponse(
            latest_observed=(
                None
                if projection.latest_observed_kp is None
                else _space_weather_kp_row(projection.latest_observed_kp)
            ),
            latest_estimated=(
                None
                if projection.latest_estimated_kp is None
                else _space_weather_kp_row(projection.latest_estimated_kp)
            ),
            forecast=tuple(_space_weather_kp_row(row) for row in projection.forecast_kp),
        ),
        solar_wind=(
            None
            if projection.solar_wind is None
            else SpaceWeatherSolarWindResponse(
                speed_time_utc=projection.solar_wind.speed_time_utc,
                proton_speed_km_s=projection.solar_wind.proton_speed_km_s,
                field_time_utc=projection.solar_wind.field_time_utc,
                bt_nt=projection.solar_wind.bt_nt,
                bz_gsm_nt=projection.solar_wind.bz_gsm_nt,
            )
        ),
        latest_notifications=tuple(
            SpaceWeatherNotificationResponse(
                product_id=notification.product_id,
                issue_time_text=notification.issue_time_text,
                message=notification.message,
            )
            for notification in projection.latest_notifications
        ),
        impacts=tuple(
            SpaceWeatherImpactResponse(family=impact.family, summary=impact.summary)
            for impact in projection.impacts
        ),
        freshness=SpaceWeatherFreshnessResponse(
            cache_state=projection.freshness.cache_state,
            retrieved_at=projection.freshness.retrieved_at,
            fresh_until=projection.freshness.fresh_until,
            stale_until=projection.freshness.stale_until,
            last_refresh_failure_code=projection.freshness.last_refresh_failure_code,
        ),
        source=SpaceWeatherSourceResponse(
            name=projection.source.name,
            official_documentation_url=projection.source.official_documentation_url,
            attribution_text=projection.source.attribution_text,
        ),
        aurora=SpaceWeatherAuroraResponse(
            mode=projection.aurora.mode,
            official_url=projection.aurora.official_url,
            label=projection.aurora.label,
            explanation=projection.aurora.explanation,
        ),
    )
    while (
        len(
            json.dumps(
                response.model_dump(mode="json"),
                allow_nan=False,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        )
        > _SPACE_WEATHER_PUBLIC_RESPONSE_MAX_BYTES
        and response.latest_notifications
    ):
        response = response.model_copy(
            update={"latest_notifications": response.latest_notifications[:-1]}
        )
    return response


def _space_weather_kp_row(value: Any) -> SpaceWeatherKpRowResponse:
    return SpaceWeatherKpRowResponse(
        time_text=value.time_text,
        kp=value.kp,
        status=value.status,
        noaa_scale=value.noaa_scale,
    )


__all__ = ["router"]
