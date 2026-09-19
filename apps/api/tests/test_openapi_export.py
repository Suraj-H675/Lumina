"""Deterministic and isolated OpenAPI export tests."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, Mock

import anyio
import lumina.openapi_export as openapi_export
import pytest
from lumina.bootstrap import create_app
from lumina.openapi_export import export_openapi, main, serialize_openapi
from lumina.settings import AppSettings

_INERT_DATABASE_URL = "postgresql+asyncpg://openapi_test:nonsecret@127.0.0.1:1/lumina_openapi_test"


def _settings() -> AppSettings:
    return AppSettings.model_validate(
        {
            "LUMINA_DATABASE_URL": _INERT_DATABASE_URL,
            "LUMINA_ENABLE_API_DOCS": False,
            "LUMINA_ENV": "test",
            "LUMINA_LOG_LEVEL": "CRITICAL",
        }
    )


def test_export_matches_the_actual_disposable_fastapi_application() -> None:
    application = create_app(_settings())
    try:
        expected = serialize_openapi(application.openapi())
        assert export_openapi() == expected
    finally:
        anyio.run(application.state.database_runtime.engine.dispose)


def test_repeated_exports_are_byte_identical_stable_json() -> None:
    first = export_openapi()
    second = export_openapi()

    assert first == second
    assert first.endswith(b"\n")
    assert b"\r" not in first
    assert first.startswith(b'{\n  "components"')
    document: dict[str, Any] = json.loads(first)
    assert set(document["paths"]) == {
        "/api/v1/meta",
        "/api/v1/identification/capabilities",
        "/api/v1/identification/submissions",
        "/api/v1/identification/submissions/{submission_id}",
        "/api/v1/identification/submissions/{submission_id}/solution",
        "/api/v1/providers/status",
        "/api/v1/participate",
        "/api/v1/now/apod",
        "/api/v1/now/near-earth",
        "/api/v1/now/satellites",
        "/api/v1/now/satellites/passes",
        "/api/v1/now/launches",
        "/api/v1/now/launches/{launch_id}",
        "/api/v1/now/space-weather",
        "/api/v1/simulations/black-hole-relativity",
        "/api/v1/simulations/eclipse-simulator",
        "/api/v1/simulations/impact-simulator",
        "/api/v1/simulations/orbit-sandbox",
        "/api/v1/simulations/planetary-system-builder",
        "/api/v1/simulations/radial-velocity",
        "/api/v1/simulations/relativity-visualizations",
        "/api/v1/simulations/rocket-mission-designer",
        "/api/v1/simulations/seasons",
        "/api/v1/simulations/spectroscopy-lab",
        "/api/v1/simulations/stellar-laboratory",
        "/api/v1/simulations/telescope-builder",
        "/api/v1/simulations/transit-method",
        "/health/live",
        "/health/ready",
        "/api/v1/catalog/entities",
        "/api/v1/catalog/entities/by-slug/{slug}",
        "/api/v1/catalog/entities/{entity_id}",
        "/api/v1/catalog/entities/{entity_id}/measurements",
        "/api/v1/catalog/entities/{entity_id}/canonical-selections",
        "/api/v1/catalog/sources/{source_record_id}",
        "/api/v1/search",
        "/api/v1/search/suggest",
    }


def test_catalog_navigation_openapi_is_singular_and_four_field() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    paths = document["paths"]

    assert paths["/api/v1/catalog/entities"]["get"]["operationId"] == ("list_catalog_entities")
    assert paths["/api/v1/catalog/entities/by-slug/{slug}"]["get"]["operationId"] == (
        "get_catalog_entity_by_slug"
    )
    summary_schema = document["components"]["schemas"]["EntitySummaryResponse"]
    assert set(summary_schema["properties"]) == {"id", "slug", "entity_type", "canonical_name"}
    assert summary_schema["additionalProperties"] is False
    assert summary_schema["properties"]["slug"]["pattern"] == r"^[a-z0-9]+(?:-[a-z0-9]+)*$"

    browse_schema = document["components"]["schemas"]["EntityBrowsePageResponse"]
    assert set(browse_schema["properties"]) == {"items", "page"}
    assert browse_schema["additionalProperties"] is False

    parameters = paths["/api/v1/catalog/entities"]["get"]["parameters"]
    entity_type_parameters = [item for item in parameters if item["name"] == "entity_type"]
    assert len(entity_type_parameters) == 1
    entity_type_parameter = entity_type_parameters[0]
    assert entity_type_parameter["required"] is False
    assert entity_type_parameter["schema"]["anyOf"][0]["$ref"] == "#/components/schemas/EntityType"


def test_participate_openapi_is_one_read_only_no_query_contract() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/participate"]["get"]

    assert operation["operationId"] == "get_participate"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/ParticipateResponse"
    )
    assert operation.get("parameters", []) == []
    assert set(document["paths"]["/api/v1/participate"]) == {"get"}
    project_schema = document["components"]["schemas"]["ParticipateProjectResponse"]
    assert project_schema["additionalProperties"] is False
    assert set(project_schema["properties"]) == {
        "id",
        "title",
        "science_area",
        "summary",
        "task_type",
        "time_filter",
        "time_label",
        "device_filters",
        "device_label",
        "skill_focus",
        "knowledge_note",
        "external_url",
        "source_ids",
        "status",
        "status_stale",
        "source_updated_at",
    }


def test_seasons_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/seasons"]["get"]

    assert operation["operationId"] == "calculate_seasons_simulator"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/SeasonsCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "axial_tilt_deg",
        "orbital_position_deg",
        "latitude_deg",
        "eccentricity_preset",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert set(document["paths"]["/api/v1/simulations/seasons"]) == {"get"}


def test_radial_velocity_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/radial-velocity"]["get"]

    assert operation["operationId"] == "calculate_radial_velocity"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/RadialVelocityCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "stellar_mass_kg",
        "planet_mass_kg",
        "orbital_period_s",
        "eccentricity",
        "inclination_deg",
        "stellar_argument_of_periastron_deg",
        "mean_anomaly_at_epoch_deg",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert set(document["paths"]["/api/v1/simulations/radial-velocity"]) == {"get"}


def test_eclipse_simulator_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/eclipse-simulator"]["get"]

    assert operation["operationId"] == "calculate_eclipse_simulator"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/EclipseSimulatorCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {"at_utc", "latitude_deg", "longitude_deg", "elevation_m"}
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert set(document["paths"]["/api/v1/simulations/eclipse-simulator"]) == {"get"}


def test_black_hole_relativity_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/black-hole-relativity"]["get"]

    assert operation["operationId"] == "calculate_black_hole_relativity"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/BlackHoleRelativityCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {"mass_nominal_solar", "static_observer_radius_rs"}
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert parameters["mass_nominal_solar"]["schema"]["minimum"] == 1.0
    assert parameters["mass_nominal_solar"]["schema"]["maximum"] == 1.0e10
    assert parameters["static_observer_radius_rs"]["schema"]["minimum"] == 1.01
    assert parameters["static_observer_radius_rs"]["schema"]["maximum"] == 100.0
    assert set(document["paths"]["/api/v1/simulations/black-hole-relativity"]) == {"get"}


def test_relativity_visualizations_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/relativity-visualizations"]["get"]

    assert operation["operationId"] == "calculate_relativity_visualizations"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/RelativityVisualizationsCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "relative_speed_fraction_c",
        "proper_time_s",
        "proper_length_m",
        "simultaneous_event_separation_m",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert parameters["relative_speed_fraction_c"]["schema"]["minimum"] == 0.0
    assert parameters["relative_speed_fraction_c"]["schema"]["maximum"] == 0.99
    assert parameters["proper_time_s"]["schema"]["minimum"] == 1.0e-9
    assert parameters["proper_time_s"]["schema"]["maximum"] == 1.0e9
    assert parameters["proper_length_m"]["schema"]["minimum"] == 1.0e-6
    assert parameters["proper_length_m"]["schema"]["maximum"] == 1.0e15
    assert parameters["simultaneous_event_separation_m"]["schema"]["minimum"] == 0.0
    assert parameters["simultaneous_event_separation_m"]["schema"]["maximum"] == 1.0e15
    assert set(document["paths"]["/api/v1/simulations/relativity-visualizations"]) == {"get"}


def test_impact_simulator_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/impact-simulator"]["get"]

    assert operation["operationId"] == "calculate_impact_simulator"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/ImpactSimulatorCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "diameter_m",
        "impactor_density_kg_m3",
        "speed_km_s",
        "impact_angle_deg",
        "target_material",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert parameters["diameter_m"]["schema"]["minimum"] == 1_500.0
    assert parameters["diameter_m"]["schema"]["maximum"] == 20_000.0
    assert parameters["impactor_density_kg_m3"]["schema"]["minimum"] == 500.0
    assert parameters["impactor_density_kg_m3"]["schema"]["maximum"] == 8_000.0
    assert parameters["speed_km_s"]["schema"]["minimum"] == 11.0
    assert parameters["speed_km_s"]["schema"]["maximum"] == 72.0
    assert parameters["impact_angle_deg"]["schema"]["minimum"] == 15.0
    assert parameters["impact_angle_deg"]["schema"]["maximum"] == 90.0
    assert set(document["paths"]["/api/v1/simulations/impact-simulator"]) == {"get"}


def test_spectroscopy_lab_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/spectroscopy-lab"]["get"]

    assert operation["operationId"] == "calculate_spectroscopy_lab"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/SpectroscopyCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "mode",
        "temperature_k",
        "selected_elements",
        "radial_velocity_km_s",
        "resolving_power",
        "noise_sigma",
        "noise_seed",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert set(document["paths"]["/api/v1/simulations/spectroscopy-lab"]) == {"get"}


def test_planetary_system_builder_openapi_is_versioned_repeated_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/planetary-system-builder"]["get"]

    assert operation["operationId"] == "calculate_planetary_system_builder"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/PlanetarySystemBuilderCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "stellar_mass_msun",
        "stellar_luminosity_lsun",
        "stellar_effective_temperature_k",
        "planet_mass_mearth",
        "semi_major_axis_au",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    for name in ("planet_mass_mearth", "semi_major_axis_au"):
        schema = parameters[name]["schema"]
        assert schema["type"] == "array"
        assert schema["minItems"] == 1
        assert schema["maxItems"] == 8
        assert schema["items"]["type"] == "number"
    assert set(document["paths"]["/api/v1/simulations/planetary-system-builder"]) == {"get"}


def test_rocket_mission_designer_openapi_is_versioned_repeated_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/rocket-mission-designer"]["get"]

    assert operation["operationId"] == "calculate_rocket_mission_designer"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/RocketMissionDesignerCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "gravity_body",
        "delta_v_reference_id",
        "payload_mass_kg",
        "stage_dry_mass_kg",
        "stage_propellant_mass_kg",
        "stage_specific_impulse_s",
        "stage_thrust_n",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    for name in (
        "stage_dry_mass_kg",
        "stage_propellant_mass_kg",
        "stage_specific_impulse_s",
        "stage_thrust_n",
    ):
        schema = parameters[name]["schema"]
        assert schema["type"] == "array"
        assert schema["minItems"] == 1
        assert schema["maxItems"] == 4
        assert schema["items"]["type"] == "number"
    assert set(document["paths"]["/api/v1/simulations/rocket-mission-designer"]) == {"get"}


def test_stellar_laboratory_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/stellar-laboratory"]["get"]

    assert operation["operationId"] == "calculate_stellar_laboratory"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/StellarLaboratoryCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {"initial_mass_msun"}
    assert parameters["initial_mass_msun"]["required"] is True
    assert set(document["paths"]["/api/v1/simulations/stellar-laboratory"]) == {"get"}


def test_telescope_builder_calculation_openapi_is_versioned_and_read_only() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    operation = document["paths"]["/api/v1/simulations/telescope-builder"]["get"]

    assert operation["operationId"] == "calculate_telescope_builder"
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/TelescopeBuilderCalculationResponse"
    )
    parameters = {parameter["name"]: parameter for parameter in operation["parameters"]}
    assert set(parameters) == {
        "aperture_mm",
        "telescope_focal_length_mm",
        "telescope_type",
        "eyepiece_focal_length_mm",
        "eyepiece_apparent_field_deg",
        "optical_modifier_kind",
        "optical_modifier_factor",
        "target_angular_size_arcmin",
    }
    assert all(parameter["required"] is True for parameter in parameters.values())
    assert set(document["paths"]["/api/v1/simulations/telescope-builder"]) == {"get"}


def test_satellite_pass_openapi_is_post_only_bounded_and_typed() -> None:
    document: dict[str, Any] = json.loads(export_openapi())
    path = document["paths"]["/api/v1/now/satellites/passes"]

    assert set(path) == {"post"}
    operation = path["post"]
    assert operation["operationId"] == "post_now_satellite_passes"
    assert operation["requestBody"]["required"] is True
    assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/SatellitePassRequest"
    )
    assert set(operation["responses"]) == {"200", "404", "413", "422", "503"}
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/SatellitePassResponse"
    )


def test_export_does_not_open_network_or_database_connections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def reject_connection(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("OpenAPI export attempted a network connection")

    monkeypatch.setattr(socket.socket, "connect", reject_connection)

    assert b'"/health/live"' in export_openapi()


def test_export_module_does_not_import_process_owned_application() -> None:
    result = subprocess.run(
        (
            sys.executable,
            "-c",
            "import sys; import lumina.openapi_export; "
            "raise SystemExit(1 if 'lumina.main' in sys.modules else 0)",
        ),
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_cli_requires_no_lumina_environment_and_writes_only_requested_output(
    tmp_path: Path,
) -> None:
    output = tmp_path / "contract.json"
    environment = {key: value for key, value in os.environ.items() if not key.startswith("LUMINA_")}
    result = subprocess.run(
        (sys.executable, "-m", "lumina.openapi_export", "--output", str(output)),
        check=False,
        capture_output=True,
        env=environment,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert list(tmp_path.iterdir()) == [output]
    assert output.read_bytes() == export_openapi()


@pytest.mark.parametrize(
    "failure_stage",
    [
        "app-construction",
        "openapi-generation",
        "serialization",
        "output-writing",
        "disposal",
        "operation-and-disposal",
    ],
)
def test_operational_failures_emit_one_safe_line_and_leave_no_partial_output(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    failure_stage: str,
) -> None:
    sentinel = "PRIVATE-EXPORT-FAILURE-SENTINEL"
    output = tmp_path / "PRIVATE-OUTPUT-PATH.json"
    openapi_failure = failure_stage in {"openapi-generation", "operation-and-disposal"}
    disposal_failure = failure_stage in {"disposal", "operation-and-disposal"}
    dispose = AsyncMock(
        side_effect=RuntimeError(sentinel) if disposal_failure else None,
    )
    application = SimpleNamespace(
        openapi=Mock(
            side_effect=RuntimeError(sentinel) if openapi_failure else None,
            return_value={"openapi": "3.1.0"},
        ),
        state=SimpleNamespace(
            database_runtime=SimpleNamespace(engine=SimpleNamespace(dispose=dispose))
        ),
    )

    if failure_stage == "app-construction":
        monkeypatch.setattr(
            openapi_export,
            "create_app",
            Mock(side_effect=RuntimeError(sentinel)),
        )
    else:
        monkeypatch.setattr(openapi_export, "create_app", Mock(return_value=application))
    if failure_stage == "serialization":
        monkeypatch.setattr(
            openapi_export,
            "serialize_openapi",
            Mock(side_effect=RuntimeError(sentinel)),
        )
    if failure_stage == "output-writing":
        monkeypatch.setattr(
            os,
            "replace",
            Mock(side_effect=OSError(sentinel)),
        )

    assert main(["--output", str(output)]) == 1

    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == "Lumina OpenAPI export failed.\n"
    assert sentinel not in captured.err
    assert str(output) not in captured.err
    assert "Traceback" not in captured.err
    assert not output.exists()
    assert list(tmp_path.iterdir()) == []
    if failure_stage == "app-construction":
        dispose.assert_not_awaited()
    else:
        dispose.assert_awaited_once_with()


def test_keyboard_interrupt_during_app_construction_propagates_without_disposal(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    primary = KeyboardInterrupt("PRIVATE-PROCESS-CONTROL")
    dispose = AsyncMock()
    monkeypatch.setattr(
        openapi_export,
        "create_app",
        Mock(side_effect=primary),
    )

    with pytest.raises(KeyboardInterrupt) as caught:
        main(["--output", str(tmp_path / "contract.json")])

    assert caught.value is primary
    dispose.assert_not_awaited()
    assert capsys.readouterr() == ("", "")


def test_keyboard_interrupt_during_openapi_preserves_primary_across_disposal_failure(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    primary = KeyboardInterrupt("PRIVATE-PROCESS-CONTROL")
    dispose = AsyncMock(side_effect=RuntimeError("PRIVATE-DISPOSAL"))
    application = SimpleNamespace(
        openapi=Mock(side_effect=primary),
        state=SimpleNamespace(
            database_runtime=SimpleNamespace(engine=SimpleNamespace(dispose=dispose))
        ),
    )
    monkeypatch.setattr(openapi_export, "create_app", Mock(return_value=application))

    with pytest.raises(KeyboardInterrupt) as caught:
        main(["--output", str(tmp_path / "contract.json")])

    assert caught.value is primary
    dispose.assert_awaited_once_with()
    assert capsys.readouterr() == ("", "")


def test_system_exit_during_serialization_preserves_code_across_disposal_failure(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    primary = SystemExit(23)
    dispose = AsyncMock(side_effect=RuntimeError("PRIVATE-DISPOSAL"))
    application = SimpleNamespace(
        openapi=Mock(return_value={"openapi": "3.1.0"}),
        state=SimpleNamespace(
            database_runtime=SimpleNamespace(engine=SimpleNamespace(dispose=dispose))
        ),
    )
    monkeypatch.setattr(openapi_export, "create_app", Mock(return_value=application))
    monkeypatch.setattr(openapi_export, "serialize_openapi", Mock(side_effect=primary))

    with pytest.raises(SystemExit) as caught:
        main(["--output", str(tmp_path / "contract.json")])

    assert caught.value is primary
    assert caught.value.code == 23
    dispose.assert_awaited_once_with()
    assert capsys.readouterr() == ("", "")


def test_system_exit_during_publication_preserves_code_across_disposal_failure(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
) -> None:
    primary = SystemExit(47)
    dispose = AsyncMock(side_effect=RuntimeError("PRIVATE-DISPOSAL"))
    application = SimpleNamespace(
        openapi=Mock(return_value={"openapi": "3.1.0"}),
        state=SimpleNamespace(
            database_runtime=SimpleNamespace(engine=SimpleNamespace(dispose=dispose))
        ),
    )
    monkeypatch.setattr(openapi_export, "create_app", Mock(return_value=application))
    monkeypatch.setattr(openapi_export, "_publish_output", Mock(side_effect=primary))

    with pytest.raises(SystemExit) as caught:
        main(["--output", str(tmp_path / "contract.json")])

    assert caught.value is primary
    assert caught.value.code == 47
    dispose.assert_awaited_once_with()
    assert capsys.readouterr() == ("", "")
