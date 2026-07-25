"""Public Phase 0B1 API contract tests."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID, uuid4

import anyio
import httpx
from fastapi import FastAPI
from lumina import __version__
from lumina.bootstrap import create_app
from lumina.settings import AppSettings

_STRICT_CONTENT_SECURITY_POLICY = (
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)


class _DocumentationHtmlParser(HTMLParser):
    """Collect the externally loaded resources and inline blocks in generated docs HTML."""

    def __init__(self) -> None:
        super().__init__()
        self.resources: dict[str, list[str]] = {"script": [], "stylesheet": [], "icon": []}
        self.inline_scripts = 0
        self.inline_styles = 0
        self.redoc_spec_url: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "script":
            source = attributes.get("src")
            if source is None:
                self.inline_scripts += 1
            else:
                self.resources["script"].append(source)
        elif tag == "link":
            relation = attributes.get("rel")
            href = attributes.get("href")
            if href is not None and relation == "stylesheet":
                self.resources["stylesheet"].append(href)
            elif href is not None and relation is not None and "icon" in relation:
                self.resources["icon"].append(href)
        elif tag == "style":
            self.inline_styles += 1
        elif tag == "redoc":
            self.redoc_spec_url = attributes.get("spec-url")


def _csp_sources(policy: str, directive: str) -> set[str]:
    for section in policy.split("; "):
        name, *sources = section.split(" ")
        if name == directive:
            return set(sources)
    return set()


def _origins(resources: list[str]) -> set[str]:
    return {
        f"{parsed.scheme}://{parsed.netloc}"
        for resource in resources
        if (parsed := urlsplit(resource)).netloc
    }


def _app(**overrides: object) -> FastAPI:
    values: dict[str, object] = {
        "LUMINA_ENV": "test",
        "LUMINA_DATABASE_URL": "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1/lumina_test",
    }
    values.update(overrides)
    return create_app(AppSettings.model_validate(values))


def _request(
    app: FastAPI,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, headers=headers)

    return anyio.run(send)


def test_liveness_contract_is_exact_and_dependency_free() -> None:
    response = _request(_app(), "GET", "/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "live"}


def test_metadata_contract_is_exact() -> None:
    response = _request(
        _app(LUMINA_BUILD_COMMIT="abc123"),
        "GET",
        "/api/v1/meta",
    )

    assert response.status_code == 200
    assert response.json() == {
        "application_name": "Lumina",
        "application_version": __version__,
        "api_version": "v1",
        "feature_flags": {},
        "build_commit": "abc123",
    }


def test_metadata_defaults_build_commit_to_null() -> None:
    assert _request(_app(), "GET", "/api/v1/meta").json()["build_commit"] is None


def test_unknown_route_uses_object_shaped_safe_error() -> None:
    response = _request(_app(), "GET", "/not-present")

    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == "request.not_found"
    assert payload["error"]["message"] == "The requested resource was not found."
    assert payload["error"]["details"] == {}
    UUID(payload["error"]["request_id"])


def test_validation_error_omits_raw_input_context_and_messages() -> None:
    app = _app()

    @app.get("/_test/validated")
    async def validated(limit: int) -> dict[str, int]:
        return {"limit": limit}

    sentinel = "PRIVATE-INPUT-SENTINEL"
    response = _request(app, "GET", f"/_test/validated?limit={sentinel}")

    assert response.status_code == 422
    payload = response.json()
    assert payload["error"]["code"] == "request.validation_failed"
    assert payload["error"]["message"] == "The request could not be validated."
    assert isinstance(payload["error"]["details"], dict)
    assert isinstance(payload["error"]["details"]["fields"], list)
    serialized = response.text
    assert sentinel not in serialized
    for unsafe_key in ("input", "ctx", "url", "msg"):
        assert unsafe_key not in serialized


def test_valid_caller_request_id_is_canonicalized_and_returned() -> None:
    caller_id = str(uuid4()).upper()
    response = _request(
        _app(),
        "GET",
        "/health/live",
        headers={"X-Request-ID": caller_id},
    )

    assert response.headers["X-Request-ID"] == str(UUID(caller_id))


def test_invalid_caller_request_id_is_replaced_with_uuid4() -> None:
    response = _request(
        _app(),
        "GET",
        "/health/live",
        headers={"X-Request-ID": "not-a-uuid"},
    )

    generated = UUID(response.headers["X-Request-ID"])
    assert generated.version == 4


def test_non_documentation_routes_retain_the_strict_csp() -> None:
    app = _app()

    for path in ("/health/live", "/api/v1/meta", "/openapi.json", "/not-present"):
        response = _request(app, "GET", path)
        assert response.headers["Content-Security-Policy"] == _STRICT_CONTENT_SECURITY_POLICY


def test_security_headers_are_unchanged_except_for_documentation_csp() -> None:
    response = _request(_app(), "GET", "/health/live")

    assert response.headers["Content-Security-Policy"] == _STRICT_CONTENT_SECURITY_POLICY
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Permissions-Policy"] == ("camera=(), geolocation=(), microphone=()")
    assert "Strict-Transport-Security" not in response.headers


def test_swagger_documentation_csp_covers_generated_assets_and_openapi_fetch() -> None:
    response = _request(_app(), "GET", "/docs")
    parser = _DocumentationHtmlParser()
    parser.feed(response.text)
    policy = response.headers["Content-Security-Policy"]

    assert response.status_code == 200
    assert "SwaggerUIBundle" in response.text
    assert "url: '/openapi.json'" in response.text
    assert parser.inline_scripts == 1
    assert parser.inline_styles == 0
    assert policy.startswith(f"{_STRICT_CONTENT_SECURITY_POLICY}; ")
    assert _origins(parser.resources["script"]) == {"https://cdn.jsdelivr.net"}
    assert _origins(parser.resources["stylesheet"]) == {"https://cdn.jsdelivr.net"}
    assert _origins(parser.resources["icon"]) == {"https://fastapi.tiangolo.com"}
    assert _origins(parser.resources["script"]) <= _csp_sources(policy, "script-src")
    assert _origins(parser.resources["stylesheet"]) <= _csp_sources(policy, "style-src")
    assert _origins(parser.resources["icon"]) <= _csp_sources(policy, "img-src")
    assert "data:" in _csp_sources(policy, "img-src")
    assert "'unsafe-inline'" in _csp_sources(policy, "script-src")
    assert "'unsafe-inline'" not in _csp_sources(policy, "style-src")
    assert _csp_sources(policy, "connect-src") == {"'self'"}


def test_redoc_documentation_csp_covers_generated_assets_and_openapi_fetch() -> None:
    response = _request(_app(), "GET", "/redoc")
    parser = _DocumentationHtmlParser()
    parser.feed(response.text)
    policy = response.headers["Content-Security-Policy"]

    assert response.status_code == 200
    assert parser.redoc_spec_url == "/openapi.json"
    assert parser.inline_scripts == 0
    assert parser.inline_styles == 1
    assert policy.startswith(f"{_STRICT_CONTENT_SECURITY_POLICY}; ")
    assert _origins(parser.resources["script"]) == {"https://cdn.jsdelivr.net"}
    assert _origins(parser.resources["stylesheet"]) == {"https://fonts.googleapis.com"}
    assert _origins(parser.resources["icon"]) == {"https://fastapi.tiangolo.com"}
    assert _origins(parser.resources["script"]) <= _csp_sources(policy, "script-src")
    assert _origins(parser.resources["stylesheet"]) <= _csp_sources(policy, "style-src")
    assert _origins(parser.resources["icon"]) <= _csp_sources(policy, "img-src")
    assert "'unsafe-inline'" not in _csp_sources(policy, "script-src")
    assert "'unsafe-inline'" in _csp_sources(policy, "style-src")
    assert "data:" in _csp_sources(policy, "img-src")
    assert _csp_sources(policy, "font-src") == {"https://fonts.gstatic.com"}
    assert _csp_sources(policy, "connect-src") == {"'self'"}


def test_documentation_csp_exceptions_are_limited_to_enabled_documentation_routes() -> None:
    app = _app()
    swagger_response = _request(app, "GET", "/docs")
    redoc_response = _request(app, "GET", "/redoc")

    assert swagger_response.headers["Content-Security-Policy"] != _STRICT_CONTENT_SECURITY_POLICY
    assert redoc_response.headers["Content-Security-Policy"] != _STRICT_CONTENT_SECURITY_POLICY
    for header in (
        "X-Content-Type-Options",
        "Referrer-Policy",
        "X-Frame-Options",
        "Permissions-Policy",
    ):
        health_response = _request(app, "GET", "/health/live")
        assert swagger_response.headers[header] == health_response.headers[header]
        assert redoc_response.headers[header] == health_response.headers[header]
    assert "Strict-Transport-Security" not in swagger_response.headers
    assert "Strict-Transport-Security" not in redoc_response.headers
    for path in ("/docs/", "/redoc/", "/health/live", "/api/v1/meta", "/openapi.json"):
        response = _request(app, "GET", path)
        assert response.headers["Content-Security-Policy"] == _STRICT_CONTENT_SECURITY_POLICY


def test_disabled_documentation_routes_keep_the_strict_csp() -> None:
    app = _app(LUMINA_ENABLE_API_DOCS=False)

    for path in ("/docs", "/redoc", "/openapi.json"):
        response = _request(app, "GET", path)
        assert response.status_code == 404
        assert response.headers["Content-Security-Policy"] == _STRICT_CONTENT_SECURITY_POLICY
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["Referrer-Policy"] == "no-referrer"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["Permissions-Policy"] == (
            "camera=(), geolocation=(), microphone=()"
        )


def test_empty_cors_configuration_grants_no_cross_origin_access() -> None:
    response = _request(
        _app(),
        "GET",
        "/health/live",
        headers={"Origin": "https://example.com"},
    )

    assert "Access-Control-Allow-Origin" not in response.headers


def test_configured_cors_origin_is_allowed_without_credentials() -> None:
    response = _request(
        _app(LUMINA_CORS_ORIGINS="https://example.com"),
        "GET",
        "/health/live",
        headers={"Origin": "https://example.com"},
    )

    assert response.headers["Access-Control-Allow-Origin"] == "https://example.com"
    assert response.headers["Access-Control-Expose-Headers"] == "X-Request-ID"
    assert "Access-Control-Allow-Credentials" not in response.headers


def test_cors_preflight_allows_only_current_get_contract() -> None:
    app = _app(LUMINA_CORS_ORIGINS="https://example.com")
    headers = {
        "Origin": "https://example.com",
        "Access-Control-Request-Headers": "X-Request-ID",
    }
    get_response = _request(
        app,
        "OPTIONS",
        "/health/live",
        headers={**headers, "Access-Control-Request-Method": "GET"},
    )
    post_response = _request(
        app,
        "OPTIONS",
        "/health/live",
        headers={**headers, "Access-Control-Request-Method": "POST"},
    )

    assert get_response.status_code == 200
    assert get_response.headers["Access-Control-Allow-Methods"] == "GET"
    assert "x-request-id" in get_response.headers["Access-Control-Allow-Headers"].lower()
    assert post_response.status_code == 400


def test_openapi_contains_only_phase_0b2_routes() -> None:
    response = _request(_app(), "GET", "/openapi.json")
    document: dict[str, Any] = response.json()

    assert set(document["paths"]) == {"/health/live", "/health/ready", "/api/v1/meta"}
    serialized = response.text.lower()
    for forbidden in ("provider", "/jobs", "supabase"):
        assert forbidden not in serialized


def test_no_supabase_artifact_or_import_was_added() -> None:
    repository_root = Path(__file__).resolve().parents[3]
    source_root = repository_root / "apps" / "api" / "src"

    assert not (repository_root / "supabase").exists()
    for source_file in source_root.rglob("*.py"):
        assert "supabase" not in source_file.read_text(encoding="utf-8").lower()
