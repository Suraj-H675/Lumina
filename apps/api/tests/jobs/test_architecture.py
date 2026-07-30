"""Architecture boundaries through Phase 0B3C4 worker runtime."""

from __future__ import annotations

import ast
from pathlib import Path

_JOBS_ROOT = Path(__file__).resolve().parents[2] / "src" / "lumina" / "jobs"
_LUMINA_ROOT = _JOBS_ROOT.parent
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


def test_handler_and_execution_domain_application_are_infrastructure_free() -> None:
    for relative in (
        "domain/handler.py",
        "application/handlers.py",
        "application/execution.py",
    ):
        path = _JOBS_ROOT / relative
        assert _import_roots(path).isdisjoint(_FORBIDDEN_ROOTS)
        source = path.read_text(encoding="utf-8")
        assert "os._exit" not in source


def test_registry_has_no_dynamic_discovery_or_payload_dispatch() -> None:
    source = (_JOBS_ROOT / "application/handlers.py").read_text(encoding="utf-8")

    for forbidden in (
        "importlib",
        "entry_points",
        "pkgutil",
        "__import__",
        "eval(",
        "exec(",
    ):
        assert forbidden not in source
    assert '{"system.noop": SystemNoopHandler()}' in source


def test_worker_identity_and_timing_stay_outside_domain() -> None:
    worker_root = _LUMINA_ROOT / "worker"
    assert (worker_root / "identity.py").is_file()
    assert (worker_root / "timing.py").is_file()

    for path in (_JOBS_ROOT / "domain").glob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert "lumina.worker" not in source


def test_worker_process_responsibilities_are_isolated() -> None:
    worker_root = _LUMINA_ROOT / "worker"
    expected = {
        "cli.py",
        "composition.py",
        "identity.py",
        "output.py",
        "runtime.py",
        "signals.py",
        "startup.py",
        "termination.py",
        "timing.py",
    }
    assert expected <= {path.name for path in worker_root.glob("*.py")}

    runtime_imports = _import_roots(worker_root / "runtime.py")
    assert runtime_imports.isdisjoint({"argparse", "signal", "sqlalchemy"})
    assert "os._exit" not in (worker_root / "runtime.py").read_text(encoding="utf-8")
    assert "argparse" in _import_roots(worker_root / "cli.py")
    assert "signal" in _import_roots(worker_root / "signals.py")
    assert "sqlalchemy" in _import_roots(worker_root / "startup.py")


def test_hard_exit_exists_only_in_termination_module() -> None:
    worker_root = _LUMINA_ROOT / "worker"
    owners = {
        path.name
        for path in worker_root.glob("*.py")
        if "os._exit" in path.read_text(encoding="utf-8")
    }

    assert owners == {"termination.py"}


def test_worker_output_is_raw_fd_threadless_and_centralized() -> None:
    worker_root = _LUMINA_ROOT / "worker"
    forbidden = (
        "sys.stdout.write",
        "sys.stderr.write",
        "asyncio.to_thread",
        "run_in_executor",
    )
    for path in worker_root.glob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert all(value not in source for value in forbidden)
        if path.name != "output.py":
            assert "os.write" not in source


def test_worker_has_no_dynamic_handlers_routes_or_scheduler_framework() -> None:
    worker_root = _LUMINA_ROOT / "worker"
    source = "\n".join(path.read_text(encoding="utf-8") for path in worker_root.glob("*.py"))
    for forbidden in (
        "importlib",
        "entry_points",
        "APIRouter",
        "FastAPI",
        "redis",
        "celery",
        "apscheduler",
    ):
        assert forbidden not in source
    assert source.count("production_handler_registry()") == 1
