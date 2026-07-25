"""Typed Phase 0B1 application configuration."""

from __future__ import annotations

import ipaddress
import os
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from pydantic_settings.sources import DotEnvSettingsSource
from sqlalchemy.engine import make_url

RuntimeEnvironment = Literal["development", "test", "staging", "production"]
LogLevel = Literal["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"]

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_REPOSITORY_ENV_FILE = _REPOSITORY_ROOT / ".env"
_HOST_LABEL_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?")
_BUILD_COMMIT_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
_ALLOWED_ENVIRONMENT_KEYS = frozenset(
    {
        "LUMINA_ENV",
        "LUMINA_LOG_LEVEL",
        "LUMINA_API_HOST",
        "LUMINA_API_PORT",
        "LUMINA_CORS_ORIGINS",
        "LUMINA_ENABLE_API_DOCS",
        "LUMINA_BUILD_COMMIT",
        "LUMINA_DATABASE_URL",
        "LUMINA_DATABASE_SYNC_URL",
        "LUMINA_TEST_DATABASE_URL",
        "LUMINA_TEST_DATABASE_SYNC_URL",
    }
)


class UnknownLuminaSettingError(ValueError):
    """Raised when a configuration source contains unsupported Lumina settings."""


def _validate_database_url(value: SecretStr, *, drivername: str, field: str) -> SecretStr:
    """Validate a secret PostgreSQL URL without reflecting it in validation errors."""
    try:
        parsed = make_url(value.get_secret_value())
        port = parsed.port
    except Exception as error:
        raise ValueError(f"{field} must be a valid PostgreSQL URL") from error
    if parsed.drivername != drivername:
        raise ValueError(f"{field} must use {drivername}")
    if not all((parsed.username, parsed.password, parsed.host, parsed.database)):
        raise ValueError(f"{field} must include username, password, host, and database name")
    if port is not None and not 1 <= port <= 65535:
        raise ValueError(f"{field} must contain a valid port")
    return value


def _parse_cors_origins(value: object) -> object:
    if value is None or value == "":
        return ()
    if isinstance(value, str):
        return tuple(origin.strip() for origin in value.split(","))
    if isinstance(value, (list, tuple)):
        return tuple(value)
    return value


def _validate_origin(origin: str) -> str:
    if not origin or origin != origin.strip() or "*" in origin:
        raise ValueError("CORS origins must be non-empty exact HTTP or HTTPS origins")

    parsed = urlsplit(origin)
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError("CORS origins must contain a valid port") from error

    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(
            "CORS origins must use HTTP or HTTPS without credentials, paths, queries, or fragments"
        )
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("CORS origins must contain a valid port")
    return origin


def _validate_host(host: str) -> str:
    if not host or host != host.strip() or any(ord(character) < 32 for character in host):
        raise ValueError("API host must not be empty or contain whitespace or control characters")
    if any(character in host for character in ("/", "?", "#", "@")):
        raise ValueError(
            "API host must not contain a scheme, path, credentials, query, or fragment"
        )

    try:
        ipaddress.ip_address(host)
    except ValueError:
        if ":" in host or len(host) > 253 or not host.isascii():
            raise ValueError("API host must be a valid IP literal or hostname") from None
        labels = host.removesuffix(".").split(".")
        if not labels or any(_HOST_LABEL_PATTERN.fullmatch(label) is None for label in labels):
            raise ValueError("API host must be a valid IP literal or hostname") from None
    return host


class AppSettings(BaseSettings):
    """Validated settings used by one API process."""

    model_config = SettingsConfigDict(
        case_sensitive=True,
        extra="ignore",
        frozen=True,
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    env: RuntimeEnvironment = Field(validation_alias="LUMINA_ENV")
    log_level: LogLevel = Field(default="INFO", validation_alias="LUMINA_LOG_LEVEL")
    api_host: str = Field(default="127.0.0.1", validation_alias="LUMINA_API_HOST")
    api_port: int = Field(
        default=8000,
        ge=1,
        le=65535,
        validation_alias="LUMINA_API_PORT",
    )
    cors_origins: Annotated[tuple[str, ...], NoDecode] = Field(
        default=(),
        validation_alias="LUMINA_CORS_ORIGINS",
    )
    enable_api_docs: bool | None = Field(
        default=None,
        validation_alias="LUMINA_ENABLE_API_DOCS",
    )
    build_commit: str | None = Field(
        default=None,
        validation_alias="LUMINA_BUILD_COMMIT",
    )
    database_url: SecretStr = Field(validation_alias="LUMINA_DATABASE_URL")

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr) -> SecretStr:
        """Require the async runtime driver and complete secret connection data."""
        return _validate_database_url(
            value,
            drivername="postgresql+asyncpg",
            field="Database URL",
        )

    @field_validator("log_level", mode="before")
    @classmethod
    def normalize_log_level(cls, value: object) -> object:
        """Normalize conventional case while preserving strict level validation."""
        return value.upper() if isinstance(value, str) else value

    @field_validator("api_host")
    @classmethod
    def validate_api_host(cls, value: str) -> str:
        """Accept only bind-safe IP literals and hostnames."""
        return _validate_host(value)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        """Parse a comma-separated environment value into an immutable collection."""
        return _parse_cors_origins(value)

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, origins: tuple[str, ...]) -> tuple[str, ...]:
        """Require exact browser origins and reject ambiguous URL forms."""
        validated = tuple(_validate_origin(origin) for origin in origins)
        if len(set(validated)) != len(validated):
            raise ValueError("CORS origins must not contain duplicates")
        return validated

    @field_validator("enable_api_docs", mode="before")
    @classmethod
    def validate_api_docs_override(cls, value: object) -> object:
        """Accept only explicit true/false text for an environment override."""
        if value is None or isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.lower()
            if normalized == "true":
                return True
            if normalized == "false":
                return False
        raise ValueError("API documentation override must be true or false")

    @field_validator("build_commit")
    @classmethod
    def validate_build_commit(cls, value: str | None) -> str | None:
        """Keep build identifiers bounded and safe for public metadata."""
        if value is not None and _BUILD_COMMIT_PATTERN.fullmatch(value) is None:
            raise ValueError(
                "Build commit must be 1-128 characters using letters, numbers, dot, "
                "underscore, or dash"
            )
        return value

    @property
    def api_docs_enabled(self) -> bool:
        """Resolve the documentation default for the selected environment."""
        if self.enable_api_docs is not None:
            return self.enable_api_docs
        return self.env in {"development", "test"}


class MigrationSettings(BaseSettings):
    """Validated synchronous settings used exclusively by Alembic."""

    model_config = SettingsConfigDict(
        case_sensitive=True,
        extra="ignore",
        frozen=True,
        populate_by_name=True,
        hide_input_in_errors=True,
    )

    database_sync_url: SecretStr = Field(validation_alias="LUMINA_DATABASE_SYNC_URL")

    @field_validator("database_sync_url")
    @classmethod
    def validate_database_sync_url(cls, value: SecretStr) -> SecretStr:
        """Require Psycopg for migrations, independently of API settings."""
        return _validate_database_url(
            value,
            drivername="postgresql+psycopg",
            field="Database sync URL",
        )


class IntegrationTestSettings(BaseSettings):
    """Guarded settings for tests that can modify the isolated local test database."""

    model_config = SettingsConfigDict(
        case_sensitive=True, extra="ignore", frozen=True, hide_input_in_errors=True
    )

    env: RuntimeEnvironment = Field(validation_alias="LUMINA_ENV")
    database_url: SecretStr = Field(validation_alias="LUMINA_DATABASE_URL")
    database_sync_url: SecretStr = Field(validation_alias="LUMINA_DATABASE_SYNC_URL")
    test_database_url: SecretStr = Field(validation_alias="LUMINA_TEST_DATABASE_URL")
    test_database_sync_url: SecretStr = Field(validation_alias="LUMINA_TEST_DATABASE_SYNC_URL")

    @field_validator("database_url", "test_database_url")
    @classmethod
    def validate_async_test_urls(cls, value: SecretStr) -> SecretStr:
        return _validate_database_url(
            value,
            drivername="postgresql+asyncpg",
            field="Database URL",
        )

    @field_validator("database_sync_url", "test_database_sync_url")
    @classmethod
    def validate_sync_test_urls(cls, value: SecretStr) -> SecretStr:
        return _validate_database_url(
            value,
            drivername="postgresql+psycopg",
            field="Database sync URL",
        )

    def model_post_init(self, __context: object) -> None:
        """Prevent integration helpers from ever targeting a development database."""
        if self.env != "test":
            raise ValueError("Integration tests require LUMINA_ENV=test")
        runtime = make_url(self.test_database_url.get_secret_value())
        sync = make_url(self.test_database_sync_url.get_secret_value())
        development = make_url(self.database_url.get_secret_value())
        if runtime.database != "lumina_test" or sync.database != "lumina_test":
            raise ValueError("Test database URLs must target lumina_test")
        if runtime.database != sync.database or not runtime.database.endswith("_test"):
            raise ValueError("Test database URLs must use the same _test database")
        if development.database == runtime.database:
            raise ValueError("Test and development database URLs must differ")
        if runtime.username != "lumina_test_app" or sync.username != "lumina_test_migrate":
            raise ValueError("Test database URLs must use the dedicated test roles")


def _reject_unknown_lumina_keys(values: Mapping[str, object]) -> None:
    unknown = sorted(
        key for key in values if key.startswith("LUMINA_") and key not in _ALLOWED_ENVIRONMENT_KEYS
    )
    if unknown:
        names = ", ".join(unknown)
        raise UnknownLuminaSettingError(f"Unknown Lumina environment variable(s): {names}")


def load_settings(*, env_file: Path | None = _REPOSITORY_ENV_FILE) -> AppSettings:
    """Load repository-root dotenv settings with real-environment precedence.

    ``env_file`` is an internal test seam. Production callers use the default
    repository-root path; passing ``None`` disables dotenv loading.
    """

    values: dict[str, object] = {}
    if env_file is not None and env_file.is_file():
        dotenv_source = DotEnvSettingsSource(
            AppSettings,
            env_file=env_file,
            env_file_encoding="utf-8",
            case_sensitive=True,
        )
        values.update(dotenv_source.env_vars)
        _reject_unknown_lumina_keys(values)
    _reject_unknown_lumina_keys(os.environ)
    values.update(
        (key, value) for key, value in os.environ.items() if key in _ALLOWED_ENVIRONMENT_KEYS
    )

    return AppSettings.model_validate(values)


def load_migration_settings(*, env_file: Path | None = _REPOSITORY_ENV_FILE) -> MigrationSettings:
    """Load only the privileged synchronous migration configuration."""
    values = _load_environment_values(env_file)
    return MigrationSettings.model_validate(values)


def load_integration_test_settings(
    *, env_file: Path | None = _REPOSITORY_ENV_FILE
) -> IntegrationTestSettings:
    """Load every database URL only for explicitly guarded integration tests."""
    values = _load_environment_values(env_file)
    return IntegrationTestSettings.model_validate(values)


def _load_environment_values(env_file: Path | None) -> dict[str, object]:
    """Load known Lumina values with real environment precedence."""
    values: dict[str, object] = {}
    if env_file is not None and env_file.is_file():
        dotenv_source = DotEnvSettingsSource(
            AppSettings,
            env_file=env_file,
            env_file_encoding="utf-8",
            case_sensitive=True,
        )
        values.update(dotenv_source.env_vars)
        _reject_unknown_lumina_keys(values)
    _reject_unknown_lumina_keys(os.environ)
    values.update(
        (key, value) for key, value in os.environ.items() if key in _ALLOWED_ENVIRONMENT_KEYS
    )
    return values
