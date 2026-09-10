"""Phase 0C3 packaging, isolation, and deferred-scope architecture guards."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_API_ROOT = _REPOSITORY_ROOT / "apps" / "api"
_LUMINA_ROOT = _API_ROOT / "src" / "lumina"
_PROVENANCE_ROOT = _LUMINA_ROOT / "provenance"
_FAKE_PATH = _API_ROOT / "tests" / "fakes" / "provider.py"
_RUNTIME_FAKE_PATH = _API_ROOT / "tests" / "fakes" / "provider_runtime.py"
_VALIDATOR_PATH = _REPOSITORY_ROOT / "scripts" / "data" / "validate_manifests.py"

_AMBIENT_OR_DEFERRED_IMPORTS = {
    "aiohttp",
    "asyncpg",
    "boto3",
    "celery",
    "fastapi",
    "httpx",
    "importlib",
    "locale",
    "os",
    "psycopg",
    "random",
    "requests",
    "secrets",
    "socket",
    "sqlalchemy",
    "subprocess",
    "time",
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


def test_production_provenance_never_imports_tests_or_fixtures() -> None:
    for path in _PROVENANCE_ROOT.rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        assert "apps.api.tests" not in source
        assert "tests.fakes" not in source
        assert "tests/fixtures" not in source
        assert "/fixtures/" not in source


def test_fake_is_outside_wheel_and_only_tests_import_it() -> None:
    assert _FAKE_PATH.is_file()
    assert _RUNTIME_FAKE_PATH.is_file()
    assert not (_LUMINA_ROOT / "fakes").exists()
    package = tomllib.loads((_API_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    assert package["tool"]["hatch"]["build"]["targets"]["wheel"]["packages"] == ["src/lumina"]

    production_importers = [
        path
        for path in _LUMINA_ROOT.rglob("*.py")
        if "fakes.provider import" in path.read_text(encoding="utf-8")
    ]
    assert production_importers == []
    test_importers = [
        path.relative_to(_API_ROOT).as_posix()
        for path in (_API_ROOT / "tests").rglob("*.py")
        if path != Path(__file__) and "fakes.provider import" in path.read_text(encoding="utf-8")
    ]
    assert test_importers == ["tests/provenance/test_fake_provider.py"]

    runtime_production_importers = [
        path
        for path in _LUMINA_ROOT.rglob("*.py")
        if "fakes.provider_runtime" in path.read_text(encoding="utf-8")
    ]
    assert runtime_production_importers == []
    runtime_test_importers = sorted(
        [
            path.relative_to(_API_ROOT).as_posix()
            for path in (_API_ROOT / "tests").rglob("*.py")
            if path != Path(__file__)
            and "fakes.provider_runtime" in path.read_text(encoding="utf-8")
        ]
    )
    assert runtime_test_importers == [
        "tests/integration/test_provider_runtime.py",
        "tests/provenance/test_phase4a_provider_runtime.py",
    ]


def test_fake_and_validator_have_no_ambient_or_deferred_dependencies() -> None:
    assert _import_roots(_FAKE_PATH).isdisjoint(_AMBIENT_OR_DEFERRED_IMPORTS)
    assert _import_roots(_RUNTIME_FAKE_PATH).isdisjoint(_AMBIENT_OR_DEFERRED_IMPORTS)
    assert _import_roots(_VALIDATOR_PATH).isdisjoint(_AMBIENT_OR_DEFERRED_IMPORTS)

    combined = _FAKE_PATH.read_text(encoding="utf-8") + _VALIDATOR_PATH.read_text(encoding="utf-8")
    for forbidden in (
        "__import__",
        "entry_points",
        "getenv",
        "import_module",
        "model_registry",
        "plugin",
        "provider_registry",
        "settings",
    ):
        assert forbidden not in combined


def test_production_validator_root_is_fixed_and_has_no_fixture_selection() -> None:
    source = _VALIDATOR_PATH.read_text(encoding="utf-8")
    assert '"data" / "manifests"' in source
    assert "fixtures" not in source
    assert "LUMINA_" not in source
    assert "--root" not in source
    assert "PRODUCTION_MANIFEST_ROOT" in source


def test_phase4a_provider_surface_is_explicit_and_product_scoped() -> None:
    production_files = {
        path.relative_to(_PROVENANCE_ROOT).as_posix() for path in _PROVENANCE_ROOT.rglob("*.py")
    }
    assert production_files == {
        "__init__.py",
        "api/__init__.py",
        "api/routes.py",
        "api/schemas.py",
        "application/__init__.py",
        "application/job_handler.py",
        "application/registry.py",
        "application/sync.py",
        "composition.py",
        "domain/__init__.py",
        "domain/manifests.py",
        "domain/provider.py",
        "domain/runtime.py",
        "infrastructure/__init__.py",
        "infrastructure/http.py",
        "infrastructure/nasa_exoplanet_archive.py",
        "infrastructure/postgresql/__init__.py",
        "infrastructure/postgresql/runtime.py",
    }
    production_source = "\n".join(
        path.read_text(encoding="utf-8") for path in _PROVENANCE_ROOT.rglob("*.py")
    )
    assert "StaticProviderRegistry" in production_source
    assert "ProviderRuntimeConfig" in production_source
    assert "NasaExoplanetArchiveAdapter" in production_source
    assert "APIRouter" in production_source
    for forbidden in ("fixture_mode", "schedule_job", "importlib", "entry_points"):
        assert forbidden not in production_source


def _lumina_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imports.add(node.module if node.level == 0 else f".{node.module}")
    return imports


def _provider_layer_files(layer: str) -> tuple[Path, ...]:
    root = _PROVENANCE_ROOT / layer
    return tuple(sorted(root.rglob("*.py")))


def test_phase4a_provider_layers_have_one_way_dependencies() -> None:
    domain_imports = set().union(
        *(_lumina_imports(path) for path in _provider_layer_files("domain"))
    )
    application_imports = set().union(
        *(_lumina_imports(path) for path in _provider_layer_files("application"))
    )
    infrastructure_imports = set().union(
        *(_lumina_imports(path) for path in _provider_layer_files("infrastructure"))
    )

    assert not any(
        imported.startswith("lumina.provenance.application") for imported in domain_imports
    )
    assert not any(
        imported.startswith("lumina.provenance.infrastructure") for imported in domain_imports
    )
    assert not any(
        imported.startswith("lumina.provenance.infrastructure") for imported in application_imports
    )
    assert not any(
        imported.startswith("lumina.provenance.application") for imported in infrastructure_imports
    )
    assert "httpx" not in domain_imports | application_imports
    assert "sqlalchemy" not in domain_imports | application_imports


def test_phase4a_concrete_provider_wiring_is_composition_owned() -> None:
    composition_source = (_PROVENANCE_ROOT / "composition.py").read_text(encoding="utf-8")
    application_source = "\n".join(
        path.read_text(encoding="utf-8") for path in _provider_layer_files("application")
    )
    assert "production_provider_registry" in composition_source
    assert "BoundedHttpTransport" in composition_source
    assert "NasaExoplanetArchiveAdapter" in composition_source
    assert "PostgreSqlProviderRuntimeStore" in composition_source
    assert "production_provider_registry" not in application_source
    assert "BoundedHttpTransport" not in application_source
    assert "NasaExoplanetArchiveAdapter" not in application_source


def test_jobs_application_does_not_assemble_cross_module_provider_handlers() -> None:
    jobs_handlers = (
        Path(__file__).resolve().parents[2]
        / "src"
        / "lumina"
        / "jobs"
        / "application"
        / "handlers.py"
    )
    source = jobs_handlers.read_text(encoding="utf-8")
    assert "lumina.provenance" not in source
    assert "ProviderSyncHandler" not in source


def test_c3_symbols_do_not_define_deferred_scientific_domain_models() -> None:
    trees = [
        ast.parse(path.read_text(encoding="utf-8"))
        for path in (
            _PROVENANCE_ROOT / "domain" / "manifests.py",
            _PROVENANCE_ROOT / "domain" / "provider.py",
            _FAKE_PATH,
        )
    ]
    declared = {
        node.name
        for tree in trees
        for node in ast.walk(tree)
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))
    }
    assert declared.isdisjoint(
        {
            "CanonicalEntity",
            "ConflictResolution",
            "Coordinate",
            "Measurement",
            "Quantity",
            "SourceRecord",
            "Uncertainty",
            "Unit",
        }
    )
