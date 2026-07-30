"""Isolated tests for the Phase 0B1 environment contract."""

from __future__ import annotations

import os
from pathlib import Path

import lumina.settings as settings_module
import pytest
from lumina.settings import AppSettings, UnknownLuminaSettingError, load_settings
from pydantic import ValidationError

_DATABASE_URL = "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test"


def _settings(values: dict[str, object]) -> AppSettings:
    return AppSettings.model_validate({"LUMINA_DATABASE_URL": _DATABASE_URL, **values})


@pytest.fixture(autouse=True)
def clear_lumina_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent developer configuration from influencing settings tests."""
    for key in tuple(os.environ):
        if key.startswith("LUMINA_"):
            monkeypatch.delenv(key)


def test_environment_is_required_without_dotenv(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValidationError):
        load_settings(env_file=None)


def test_default_dotenv_location_is_repository_root() -> None:
    repository_root = Path(__file__).resolve().parents[3]

    assert repository_root / ".env" == settings_module._REPOSITORY_ENV_FILE


def test_repository_style_dotenv_is_read_as_utf8(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# UTF-8 configuration note: प्रकाश\n"
        "LUMINA_ENV=development\n"
        "LUMINA_DATABASE_URL=postgresql+asyncpg://lumina_app:secret@127.0.0.1:5432/lumina\n"
        "LUMINA_BUILD_COMMIT=local-build\n",
        encoding="utf-8",
    )

    settings = load_settings(env_file=env_file)

    assert settings.env == "development"
    assert settings.build_commit == "local-build"


def test_real_environment_overrides_dotenv(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "LUMINA_ENV=development\nLUMINA_DATABASE_URL=postgresql+asyncpg://lumina_app:secret@127.0.0.1:5432/lumina\nLUMINA_API_PORT=8001\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("LUMINA_ENV", "test")
    monkeypatch.setenv("LUMINA_API_PORT", "8002")

    settings = load_settings(env_file=env_file)

    assert settings.env == "test"
    assert settings.api_port == 8002


def test_unknown_lumina_key_in_dotenv_is_rejected(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "LUMINA_ENV=test\nLUMINA_DATABASE_URL=postgresql+asyncpg://lumina_app:secret@127.0.0.1:5432/lumina\nLUMINA_FUTURE_SETTING=forbidden\n",
        encoding="utf-8",
    )

    with pytest.raises(UnknownLuminaSettingError, match="LUMINA_FUTURE_SETTING"):
        load_settings(env_file=env_file)


def test_unknown_lumina_key_in_process_environment_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LUMINA_ENV", "test")
    monkeypatch.setenv("LUMINA_FUTURE_SETTING", "not-owned")

    with pytest.raises(UnknownLuminaSettingError, match="LUMINA_FUTURE_SETTING"):
        load_settings(env_file=None)


def test_unrelated_process_and_dotenv_keys_are_ignored(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "LUMINA_ENV=test\nLUMINA_DATABASE_URL=postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test\nSHELL_THEME=dark\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("UNRELATED_SERVICE_TOKEN", "not-lumina-owned")

    assert load_settings(env_file=env_file).env == "test"


def test_disabling_dotenv_loading_is_an_isolated_test_seam(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    (tmp_path / ".env").write_text(
        "LUMINA_ENV=production\nLUMINA_DATABASE_URL=postgresql+asyncpg://lumina_app:secret@127.0.0.1:5432/lumina\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("LUMINA_ENV", "test")
    monkeypatch.setenv("LUMINA_DATABASE_URL", _DATABASE_URL)

    assert load_settings(env_file=None).env == "test"


def test_safe_network_defaults_and_immutable_empty_cors() -> None:
    settings = _settings({"LUMINA_ENV": "test"})

    assert settings.api_host == "127.0.0.1"
    assert settings.api_port == 8000
    assert settings.cors_origins == ()
    assert isinstance(settings.cors_origins, tuple)
    assert settings.job_payload_max_bytes == 61_440
    assert settings.job_default_max_attempts == 5
    assert settings.job_enqueue_wait_timeout_ms == 5_000
    assert settings.job_operation_wait_timeout_ms == 5_000
    assert settings.job_result_max_bytes == 61_440
    assert settings.job_stale_seconds == 120


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("LUMINA_JOB_PAYLOAD_MAX_BYTES", 0),
        ("LUMINA_JOB_PAYLOAD_MAX_BYTES", 65_537),
        ("LUMINA_JOB_DEFAULT_MAX_ATTEMPTS", 0),
        ("LUMINA_JOB_DEFAULT_MAX_ATTEMPTS", 6),
        ("LUMINA_JOB_ENQUEUE_WAIT_TIMEOUT_MS", 99),
        ("LUMINA_JOB_ENQUEUE_WAIT_TIMEOUT_MS", 30_001),
        ("LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS", 99),
        ("LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS", 30_001),
        ("LUMINA_JOB_RESULT_MAX_BYTES", 0),
        ("LUMINA_JOB_RESULT_MAX_BYTES", 65_537),
        ("LUMINA_JOB_STALE_SECONDS", 1),
        ("LUMINA_JOB_STALE_SECONDS", 86_401),
    ],
)
def test_job_setting_bounds(name: str, value: int) -> None:
    with pytest.raises(ValidationError):
        _settings({"LUMINA_ENV": "test", name: value})


def test_job_settings_accept_documented_overrides() -> None:
    settings = _settings(
        {
            "LUMINA_ENV": "test",
            "LUMINA_JOB_PAYLOAD_MAX_BYTES": 1_024,
            "LUMINA_JOB_DEFAULT_MAX_ATTEMPTS": 3,
            "LUMINA_JOB_ENQUEUE_WAIT_TIMEOUT_MS": 750,
            "LUMINA_JOB_OPERATION_WAIT_TIMEOUT_MS": 900,
            "LUMINA_JOB_RESULT_MAX_BYTES": 2_048,
            "LUMINA_JOB_STALE_SECONDS": 300,
        }
    )

    assert settings.job_payload_max_bytes == 1_024
    assert settings.job_default_max_attempts == 3
    assert settings.job_enqueue_wait_timeout_ms == 750
    assert settings.job_operation_wait_timeout_ms == 900
    assert settings.job_result_max_bytes == 2_048
    assert settings.job_stale_seconds == 300


@pytest.mark.parametrize(
    "value",
    [True, False, 2.0, "2.0", " 120", "120 ", "+120", "1e2", ""],
)
def test_stale_setting_requires_exact_integer_parsing(value: object) -> None:
    with pytest.raises(ValidationError):
        _settings({"LUMINA_ENV": "test", "LUMINA_JOB_STALE_SECONDS": value})


@pytest.mark.parametrize("value", [2, 120, 86_400, "2", "120", "86400"])
def test_stale_setting_accepts_exact_integer_range(value: int | str) -> None:
    settings = _settings({"LUMINA_ENV": "test", "LUMINA_JOB_STALE_SECONDS": value})

    assert settings.job_stale_seconds == int(value)


@pytest.mark.parametrize("host", ["0.0.0.0", "::", "::1", "api.example.test"])
def test_valid_explicit_bind_hosts(host: str) -> None:
    settings = _settings({"LUMINA_ENV": "test", "LUMINA_API_HOST": host})
    assert settings.api_host == host


@pytest.mark.parametrize(
    "host",
    [
        "",
        " https://example.com",
        "https://example.com",
        "example.com:8000",
        "example.com/path",
        "bad_host",
    ],
)
def test_malformed_bind_hosts_are_rejected(host: str) -> None:
    with pytest.raises(ValidationError):
        _settings({"LUMINA_ENV": "test", "LUMINA_API_HOST": host})


@pytest.mark.parametrize("port", [0, 65536, -1])
def test_port_outside_transport_range_is_rejected(port: int) -> None:
    with pytest.raises(ValidationError):
        _settings({"LUMINA_ENV": "test", "LUMINA_API_PORT": port})


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "ftp://example.com",
        "https://user@example.com",
        "https://example.com/",
        "https://example.com/path",
        "https://example.com?query=yes",
        "https://example.com#fragment",
    ],
)
def test_non_exact_cors_origins_are_rejected(origin: str) -> None:
    with pytest.raises(ValidationError):
        _settings({"LUMINA_ENV": "test", "LUMINA_CORS_ORIGINS": origin})


def test_configured_cors_origins_are_parsed_to_tuple() -> None:
    settings = _settings(
        {
            "LUMINA_ENV": "test",
            "LUMINA_CORS_ORIGINS": "http://localhost:3000,https://example.com",
        }
    )

    assert settings.cors_origins == (
        "http://localhost:3000",
        "https://example.com",
    )


@pytest.mark.parametrize("value", ["yes", "1", "enabled", ""])
def test_invalid_api_docs_boolean_text_is_rejected(value: str) -> None:
    with pytest.raises(ValidationError):
        _settings({"LUMINA_ENV": "test", "LUMINA_ENABLE_API_DOCS": value})


@pytest.mark.parametrize(
    "build_commit",
    ["contains space", "bad/slash", "-leading-dash", "x" * 129],
)
def test_unsafe_build_commit_is_rejected(build_commit: str) -> None:
    with pytest.raises(ValidationError):
        _settings({"LUMINA_ENV": "test", "LUMINA_BUILD_COMMIT": build_commit})
