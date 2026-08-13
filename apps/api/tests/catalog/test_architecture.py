"""Phase 1A3 catalogue-ingestion architecture boundaries."""

from __future__ import annotations

import ast
from pathlib import Path

_API_ROOT = Path(__file__).resolve().parents[2]
_CATALOG_ROOT = _API_ROOT / "src" / "lumina" / "catalog"
_DOMAIN_APPLICATION = (
    _CATALOG_ROOT / "domain" / "ingestion.py",
    _CATALOG_ROOT / "application" / "ingest.py",
)
_FORBIDDEN_DOMAIN_APPLICATION_IMPORTS = {
    "asyncpg",
    "fastapi",
    "psycopg",
    "sqlalchemy",
}


def _import_roots(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            roots.add(node.module.partition(".")[0])
    return roots


def test_catalog_domain_and_application_are_persistence_framework_free() -> None:
    for path in _DOMAIN_APPLICATION:
        assert _import_roots(path).isdisjoint(_FORBIDDEN_DOMAIN_APPLICATION_IMPORTS)
        source = path.read_text(encoding="utf-8")
        assert "public.source_record" not in source
        assert "canonical_measurement" not in source


def test_catalog_postgresql_adapter_does_not_select_or_mutate_canonical_measurements() -> None:
    source = (_CATALOG_ROOT / "infrastructure" / "postgresql" / "ingestion.py").read_text(
        encoding="utf-8"
    )

    assert "UPDATE public.canonical_measurement" not in source
    assert "INSERT INTO public.canonical_measurement" not in source
    assert "DELETE FROM public.canonical_measurement" not in source
    assert "UPDATE public.measurement" not in source
    assert "DELETE FROM public.measurement" not in source


def test_catalog_adapter_keeps_postgresql_sql_out_of_the_service_boundary() -> None:
    application_source = (_CATALOG_ROOT / "application" / "ingest.py").read_text(encoding="utf-8")

    assert "PostgreSqlCatalogIngestionStore" not in application_source
    assert "FOR UPDATE" not in application_source
