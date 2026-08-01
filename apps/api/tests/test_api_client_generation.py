"""Generated-client publication and freshness tests."""

from __future__ import annotations

import errno
import importlib.util
import subprocess
import sys
from collections.abc import Callable, Sequence
from itertools import combinations
from pathlib import Path
from types import ModuleType
from typing import Protocol, cast

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GENERATION_SCRIPT = _REPOSITORY_ROOT / "scripts" / "openapi" / "generate_client.py"


class _PublicationFactory(Protocol):
    def __call__(self, *, destination: Path, content: bytes) -> object: ...


class _Publisher(Protocol):
    def __call__(
        self,
        publications: Sequence[object],
        *,
        before_replace: Callable[[int, Path], None] | None = None,
        before_atomic_publish: Callable[[int, Path], None] | None = None,
        after_publish: Callable[[int, Path], None] | None = None,
        before_restore: Callable[[int, Path], None] | None = None,
        renameat2_loader: Callable[[], Callable[[Path, Path, int], None]] | None = None,
    ) -> None: ...


class _StaleFinder(Protocol):
    def __call__(
        self,
        artifacts: dict[Path, bytes],
        canonical_artifacts: dict[Path, Path],
    ) -> list[str]: ...


def _generation_module() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "lumina_api_client_generation_test",
        _GENERATION_SCRIPT,
    )
    assert specification is not None
    assert specification.loader is not None
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def _publication_api() -> tuple[_PublicationFactory, _Publisher]:
    module = _generation_module()
    factory = cast(_PublicationFactory, module.__dict__["Publication"])
    publisher = cast(_Publisher, module.__dict__["publish_artifacts"])
    return factory, publisher


def _hidden_recovery_bytes(directory: Path) -> list[bytes]:
    return [path.read_bytes() for path in directory.iterdir() if path.name.startswith(".")]


@pytest.mark.parametrize("failure_step", [2, 3])
def test_publication_rolls_back_the_complete_set_after_later_failure(
    tmp_path: Path,
    failure_step: int,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for index, destination in enumerate(destinations, start=1):
        destination.write_bytes(f"old-{index}".encode())
    publications = [
        publication(destination=destination, content=f"new-{index}".encode())
        for index, destination in enumerate(destinations, start=1)
    ]

    def fail_during(step: int, _destination: Path) -> None:
        if step == failure_step:
            raise OSError("injected publication failure")

    with pytest.raises(
        RuntimeError,
        match=r"^Lumina API client publication failed\.$",
    ):
        publish(publications, before_replace=fail_during)

    assert [path.read_text() for path in destinations] == ["old-1", "old-2", "old-3"]
    assert sorted(path.name for path in tmp_path.iterdir()) == [path.name for path in destinations]


def test_successful_publication_replaces_the_complete_set_and_cleans_backups(
    tmp_path: Path,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for destination in destinations:
        destination.write_text("old")

    publish(
        [
            publication(destination=destination, content=f"new-{index}".encode())
            for index, destination in enumerate(destinations, start=1)
        ]
    )

    assert [path.read_text() for path in destinations] == ["new-1", "new-2", "new-3"]
    assert sorted(path.name for path in tmp_path.iterdir()) == [path.name for path in destinations]


def test_successful_initial_publication_creates_the_complete_all_absent_set(
    tmp_path: Path,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]

    publish(
        [
            publication(destination=destination, content=f"new-{index}".encode())
            for index, destination in enumerate(destinations, start=1)
        ]
    )

    assert [path.read_text() for path in destinations] == ["new-1", "new-2", "new-3"]
    assert sorted(path.name for path in tmp_path.iterdir()) == [path.name for path in destinations]


@pytest.mark.parametrize(
    "present_indexes",
    [*combinations(range(3), 1), *combinations(range(3), 2)],
)
def test_publication_rejects_every_partial_canonical_shape_without_residue(
    tmp_path: Path,
    present_indexes: tuple[int, ...],
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for index in present_indexes:
        destinations[index].write_bytes(f"old-{index}".encode())
    before = {
        destination: destination.read_bytes()
        for destination in destinations
        if destination.exists()
    }

    with pytest.raises(
        RuntimeError,
        match=r"^Lumina API client canonical artifact set is incomplete\.$",
    ):
        publish(
            [
                publication(destination=destination, content=f"new-{index}".encode())
                for index, destination in enumerate(destinations, start=1)
            ]
        )

    assert {
        destination: destination.read_bytes()
        for destination in destinations
        if destination.exists()
    } == before
    assert sorted(path.name for path in tmp_path.iterdir()) == sorted(path.name for path in before)


@pytest.mark.parametrize("changed_step", [1, 2, 3])
def test_concurrent_canonical_change_is_preserved_and_earlier_replacements_roll_back(
    tmp_path: Path,
    changed_step: int,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for index, destination in enumerate(destinations, start=1):
        destination.write_bytes(f"old-{index}".encode())
    publications = [
        publication(destination=destination, content=f"new-{index}".encode())
        for index, destination in enumerate(destinations, start=1)
    ]

    def modify_after_backup(step: int, destination: Path) -> None:
        if step == changed_step:
            destination.write_bytes(f"user-change-{step}".encode())

    with pytest.raises(
        RuntimeError,
        match=r"^Lumina API client publication detected a concurrent change\.$",
    ):
        publish(publications, before_replace=modify_after_backup)

    expected = [f"old-{index}" for index in range(1, 4)]
    expected[changed_step - 1] = f"user-change-{changed_step}"
    assert [path.read_text() for path in destinations] == expected
    recovery_names = [path.name for path in tmp_path.iterdir() if path.name.startswith(".")]
    assert sum(name.endswith(".bak") for name in recovery_names) == 3
    assert any(name.endswith(".new") for name in recovery_names)


def test_atomic_exchange_detects_change_after_last_reread_and_preserves_displaced_inode(
    tmp_path: Path,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for index, destination in enumerate(destinations, start=1):
        destination.write_bytes(f"old-{index}".encode())
    concurrent_bytes = b"user-change-after-reread"
    concurrent_inode: int | None = None

    def change_in_old_reread_to_replace_window(step: int, destination: Path) -> None:
        nonlocal concurrent_inode
        if step == 2:
            destination.write_bytes(concurrent_bytes)
            concurrent_inode = destination.stat().st_ino

    with pytest.raises(
        RuntimeError,
        match=r"^Lumina API client publication detected a concurrent change\.$",
    ):
        publish(
            [
                publication(destination=destination, content=f"new-{index}".encode())
                for index, destination in enumerate(destinations, start=1)
            ],
            before_atomic_publish=change_in_old_reread_to_replace_window,
        )

    assert [path.read_bytes() for path in destinations] == [
        b"old-1",
        concurrent_bytes,
        b"old-3",
    ]
    assert destinations[1].stat().st_ino == concurrent_inode
    assert concurrent_bytes in [destinations[1].read_bytes(), *_hidden_recovery_bytes(tmp_path)]


def test_atomic_no_replace_preserves_target_that_appears_after_last_absence_check(
    tmp_path: Path,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    concurrent_bytes = b"concurrent-initial-creator"

    def create_before_no_replace(step: int, destination: Path) -> None:
        if step == 2:
            destination.write_bytes(concurrent_bytes)

    with pytest.raises(
        RuntimeError,
        match=r"^Lumina API client publication detected a concurrent change\.$",
    ):
        publish(
            [
                publication(destination=destination, content=f"new-{index}".encode())
                for index, destination in enumerate(destinations, start=1)
            ],
            before_atomic_publish=create_before_no_replace,
        )

    assert not destinations[0].exists()
    assert destinations[1].read_bytes() == concurrent_bytes
    assert not destinations[2].exists()
    recovery_bytes = _hidden_recovery_bytes(tmp_path)
    assert b"new-1" in recovery_bytes
    assert concurrent_bytes in [destinations[1].read_bytes(), *recovery_bytes]


def test_change_after_exchange_is_retained_before_old_set_is_restored(
    tmp_path: Path,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for index, destination in enumerate(destinations, start=1):
        destination.write_bytes(f"old-{index}".encode())
    concurrent_bytes = b"concurrent-after-exchange"
    concurrent_inode: int | None = None

    def change_after_exchange(step: int, destination: Path) -> None:
        nonlocal concurrent_inode
        if step == 2:
            destination.write_bytes(concurrent_bytes)
            concurrent_inode = destination.stat().st_ino

    with pytest.raises(
        RuntimeError,
        match=r"^Lumina API client publication requires recovery\.$",
    ):
        publish(
            [
                publication(destination=destination, content=f"new-{index}".encode())
                for index, destination in enumerate(destinations, start=1)
            ],
            after_publish=change_after_exchange,
        )

    assert [path.read_text() for path in destinations] == ["old-1", "old-2", "old-3"]
    conflicts = [
        path
        for path in tmp_path.iterdir()
        if path.name.startswith(".") and path.read_bytes() == concurrent_bytes
    ]
    assert len(conflicts) == 1
    assert conflicts[0].stat().st_ino == concurrent_inode


@pytest.mark.parametrize("failure_mode", ["missing-wrapper", "unsupported-filesystem"])
def test_missing_renameat2_fails_before_staging_or_publication(
    tmp_path: Path,
    failure_mode: str,
) -> None:
    module = _generation_module()
    publication = cast(_PublicationFactory, module.__dict__["Publication"])
    publish = cast(_Publisher, module.__dict__["publish_artifacts"])
    primitive_error = cast(type[RuntimeError], module.__dict__["PublicationPrimitiveError"])
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for index, destination in enumerate(destinations, start=1):
        destination.write_bytes(f"old-{index}".encode())

    def unavailable() -> Callable[[Path, Path, int], None]:
        if failure_mode == "missing-wrapper":
            raise primitive_error()

        def unsupported(_source: Path, _destination: Path, _flags: int) -> None:
            raise OSError(errno.ENOSYS, "PRIVATE-PRIMITIVE-DETAIL")

        return unsupported

    with pytest.raises(
        RuntimeError,
        match=r"^Lumina API client atomic publication is unavailable\.$",
    ):
        publish(
            [
                publication(destination=destination, content=f"new-{index}".encode())
                for index, destination in enumerate(destinations, start=1)
            ],
            renameat2_loader=unavailable,
        )

    assert [path.read_text() for path in destinations] == ["old-1", "old-2", "old-3"]
    assert sorted(path.name for path in tmp_path.iterdir()) == [path.name for path in destinations]


def test_rollback_failure_retains_recovery_material_and_raises_only_safe_failure(
    tmp_path: Path,
) -> None:
    publication, publish = _publication_api()
    destinations = [tmp_path / f"artifact-{index}.txt" for index in range(1, 4)]
    for index, destination in enumerate(destinations, start=1):
        destination.write_bytes(f"old-{index}".encode())
    publications = [
        publication(destination=destination, content=f"new-{index}".encode())
        for index, destination in enumerate(destinations, start=1)
    ]

    def fail_publication(step: int, _destination: Path) -> None:
        if step == 3:
            raise OSError("private publication failure")

    def fail_second_restore(step: int, _destination: Path) -> None:
        if step == 2:
            raise OSError("private rollback failure")

    with pytest.raises(RuntimeError) as failure:
        publish(
            publications,
            before_replace=fail_publication,
            before_restore=fail_second_restore,
        )

    assert str(failure.value) == "Lumina API client publication requires recovery."
    assert failure.value.__cause__ is None
    assert failure.value.__suppress_context__
    assert [path.read_text() for path in destinations] == ["new-1", "old-2", "old-3"]
    recovery_names = [path.name for path in tmp_path.iterdir() if path.name.startswith(".")]
    assert sum(name.endswith(".bak") for name in recovery_names) == 3
    assert any(name.endswith(".new") for name in recovery_names)


@pytest.mark.parametrize(
    ("error_name", "message"),
    [
        (
            "PublicationConcurrencyError",
            "Lumina API client publication detected a concurrent change.\n",
        ),
        (
            "PublicationRecoveryError",
            "Lumina API client publication requires recovery.\n",
        ),
        (
            "PublicationPrimitiveError",
            "Lumina API client atomic publication is unavailable.\n",
        ),
        (
            "PublicationOperationError",
            "Lumina API client publication failed.\n",
        ),
    ],
)
def test_publication_cli_emits_only_the_fixed_safe_failure(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    error_name: str,
    message: str,
) -> None:
    module = _generation_module()
    error_type = cast(type[RuntimeError], module.__dict__[error_name])
    main = cast(Callable[[Sequence[str] | None], int], module.__dict__["main"])

    def fail_generation() -> int:
        raise error_type()

    monkeypatch.setattr(module, "_generate", fail_generation)

    assert main(["generate"]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == message


def test_freshness_detection_ignores_unrelated_files_and_reports_only_stale_artifacts(
    tmp_path: Path,
) -> None:
    module = _generation_module()
    find_stale = cast(_StaleFinder, module.__dict__["stale_artifacts"])
    first = tmp_path / "first.txt"
    second = tmp_path / "second.txt"
    unrelated = tmp_path / "unrelated-user-work.txt"
    first.write_bytes(b"current")
    second.write_bytes(b"old")
    unrelated.write_bytes(b"must remain irrelevant")
    artifacts = {Path("first.txt"): b"current", Path("second.txt"): b"new"}
    canonical = {Path("first.txt"): first, Path("second.txt"): second}

    stale = find_stale(artifacts, canonical)

    assert len(stale) == 1
    assert stale[0].startswith("second.txt (committed=")
    assert unrelated.read_bytes() == b"must remain irrelevant"


def test_committed_generated_artifacts_are_fresh_without_being_rewritten() -> None:
    artifacts = [
        _REPOSITORY_ROOT / "packages/api-client/openapi/openapi.json",
        _REPOSITORY_ROOT / "packages/api-client/src/generated/types.gen.ts",
        _REPOSITORY_ROOT / "packages/api-client/src/generated/zod.gen.ts",
    ]
    before = [(path.read_bytes(), path.stat().st_mtime_ns) for path in artifacts]

    result = subprocess.run(
        (sys.executable, str(_GENERATION_SCRIPT), "check"),
        cwd=_REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "3 committed artifacts are current and deterministic" in result.stdout
    assert [(path.read_bytes(), path.stat().st_mtime_ns) for path in artifacts] == before
