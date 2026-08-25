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

    browse_schema = document["components"]["schemas"]["EntityBrowsePageResponse"]
    assert set(browse_schema["properties"]) == {"items", "page"}
    assert browse_schema["additionalProperties"] is False

    parameters = paths["/api/v1/catalog/entities"]["get"]["parameters"]
    entity_type_parameters = [item for item in parameters if item["name"] == "entity_type"]
    assert len(entity_type_parameters) == 1
    entity_type_parameter = entity_type_parameters[0]
    assert entity_type_parameter["required"] is False
    assert entity_type_parameter["schema"]["anyOf"][0]["$ref"] == "#/components/schemas/EntityType"


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
