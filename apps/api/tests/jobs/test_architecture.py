"""Architecture boundaries for the Phase 0B3C2 recovery capability."""

from __future__ import annotations

import ast
from pathlib import Path

_JOBS_ROOT = Path(__file__).resolve().parents[2] / "src" / "lumina" / "jobs"
_FORBIDDEN_ROOTS = {
    "argparse",
    "asyncpg",
    "fastapi",
    "psycopg",
    "signal",
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


def test_recovery_domain_and_application_are_infrastructure_free() -> None:
    for relative in ("domain/recovery.py", "application/recovery.py"):
        assert _import_roots(_JOBS_ROOT / relative).isdisjoint(_FORBIDDEN_ROOTS)


def test_postgresql_recovery_sql_stays_in_infrastructure() -> None:
    for relative in ("domain/recovery.py", "application/recovery.py"):
        source = (_JOBS_ROOT / relative).read_text(encoding="utf-8")
        assert "public.job" not in source
        assert "FOR UPDATE" not in source
