from __future__ import annotations

import ast
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2] / "src" / "lumina" / "identification"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    result: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            result.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            result.add(node.module)
    return result


def test_identification_domain_is_framework_and_transport_free() -> None:
    imports = set().union(*(_imports(path) for path in (_ROOT / "domain").glob("*.py")))
    for forbidden in ("fastapi", "httpx", "pydantic", "sqlalchemy"):
        assert not any(value == forbidden or value.startswith(f"{forbidden}.") for value in imports)
    assert not any(value.startswith("lumina.identification.infrastructure") for value in imports)


def test_remote_nova_transport_is_in_infrastructure_and_hardened() -> None:
    source = (_ROOT / "infrastructure" / "nova.py").read_text(encoding="utf-8")
    assert "import httpx" in source
    assert "trust_env=False" in source
    assert "follow_redirects=False" in source
    assert '"Accept-Encoding": "identity"' in source
    assert '"https://nova.astrometry.net/api"' in source
    assert '"publicly_visible": "n"' in source
    assert '"allow_modifications": "n"' in source
    assert '"allow_commercial_use": "n"' in source
    assert "center_ra" not in source
    assert "center_dec" not in source
