"""Verify accepted migration history without importing migration code."""

from __future__ import annotations

import ast
import hashlib
from dataclasses import dataclass
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MIGRATION_ROOT = REPOSITORY_ROOT / "migrations" / "versions"


@dataclass(frozen=True)
class MigrationContract:
    filename: str
    revision: str
    down_revision: str | None
    sha256: str


EXPECTED_MIGRATIONS = (
    MigrationContract(
        filename="0001_create_job.py",
        revision="0001_create_job",
        down_revision=None,
        sha256="d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b",
    ),
    MigrationContract(
        filename="0002_grant_job_runtime_dml.py",
        revision="0002_grant_job_runtime_dml",
        down_revision="0001_create_job",
        sha256="8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889",
    ),
    MigrationContract(
        filename="d502b5935120_create_catalog_identity_provenance.py",
        revision="d502b5935120",
        down_revision="0002_grant_job_runtime_dml",
        sha256="f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b",
    ),
    MigrationContract(
        filename="e4c9f1a7b362_add_measurement_provenance.py",
        revision="e4c9f1a7b362",
        down_revision="d502b5935120",
        sha256="336a59a593c1f1d5fcfd4b32c3b8405bb290b1f13c9a6fee094e8170249c8c2d",
    ),
)


def _literal_assignment(tree: ast.Module, name: str) -> str | None:
    for statement in tree.body:
        if not isinstance(statement, ast.Assign):
            continue
        if not any(
            isinstance(target, ast.Name) and target.id == name for target in statement.targets
        ):
            continue
        value = ast.literal_eval(statement.value)
        if value is None or isinstance(value, str):
            return value
        raise ValueError(f"{name} is not a string or null")
    raise ValueError(f"{name} is absent")


def validate_migrations(root: Path = MIGRATION_ROOT) -> tuple[str, ...]:
    """Return deterministic diagnostics for migration additions or immutable-history drift."""
    diagnostics: list[str] = []
    expected_names = {contract.filename for contract in EXPECTED_MIGRATIONS}
    actual_names = {
        path.name
        for path in root.iterdir()
        if path.is_file() and path.suffix == ".py" and path.name != "__init__.py"
    }

    for name in sorted(actual_names - expected_names):
        diagnostics.append(f"migration.unapproved_file: {name}")
    for name in sorted(expected_names - actual_names):
        diagnostics.append(f"migration.missing_file: {name}")

    for contract in EXPECTED_MIGRATIONS:
        path = root / contract.filename
        if not path.is_file():
            continue
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        if digest != contract.sha256:
            diagnostics.append(f"migration.checksum_mismatch: {contract.filename}")
        try:
            tree = ast.parse(content, filename=contract.filename)
            revision = _literal_assignment(tree, "revision")
            down_revision = _literal_assignment(tree, "down_revision")
        except (SyntaxError, ValueError) as error:
            diagnostics.append(f"migration.metadata_invalid: {contract.filename}: {error}")
            continue
        if revision != contract.revision or down_revision != contract.down_revision:
            diagnostics.append(f"migration.lineage_mismatch: {contract.filename}")

    return tuple(sorted(diagnostics))


def main() -> int:
    diagnostics = validate_migrations()
    if diagnostics:
        for diagnostic in diagnostics:
            print(diagnostic)
        return 1
    print("Migration integrity passed: 4 accepted revisions, head e4c9f1a7b362.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
