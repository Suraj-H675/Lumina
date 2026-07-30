"""Worker owner-identity construction tests."""

from __future__ import annotations

from uuid import UUID

import pytest
from lumina.worker.identity import (
    WorkerIdentityValidationError,
    build_worker_owner_identity,
    validate_worker_id_prefix,
)

_UUID4 = UUID("12345678-1234-4234-9234-123456789abc")


def test_identity_calls_factory_once_and_uses_canonical_uuid4() -> None:
    calls = 0

    def factory() -> UUID:
        nonlocal calls
        calls += 1
        return _UUID4

    owner = build_worker_owner_identity("worker.fixture", uuid_factory=factory)

    assert calls == 1
    assert owner.value == "worker.fixture.12345678-1234-4234-9234-123456789abc"
    assert len(owner.value) <= 128


@pytest.mark.parametrize(
    "prefix",
    [
        "",
        "Worker",
        "1worker",
        "worker:",
        "worker secret",
        "a" * 92,
        True,
        None,
    ],
)
def test_invalid_prefix_is_rejected_without_factory_call(prefix: object) -> None:
    called = False

    def factory() -> UUID:
        nonlocal called
        called = True
        return _UUID4

    with pytest.raises(WorkerIdentityValidationError):
        build_worker_owner_identity(prefix, uuid_factory=factory)  # type: ignore[arg-type]

    assert called is False


@pytest.mark.parametrize("prefix", ["a", "worker", "a" * 91, "worker.one-two_three"])
def test_prefix_boundary_and_grammar(prefix: str) -> None:
    assert validate_worker_id_prefix(prefix) == prefix


def test_non_uuid4_factory_result_is_fixed_and_non_leaking() -> None:
    sentinel = "UUID-FACTORY-SECRET"

    def factory() -> UUID:
        raise RuntimeError(sentinel)

    with pytest.raises(WorkerIdentityValidationError) as failure:
        build_worker_owner_identity("worker", uuid_factory=factory)

    error = failure.value
    assert sentinel not in str(error)
    assert sentinel not in repr(error)
    assert sentinel not in error.args
    assert error.__cause__ is None
    assert error.__context__ is None


def test_owner_and_prefix_are_redacted_by_value_types() -> None:
    owner = build_worker_owner_identity("secret.prefix", uuid_factory=lambda: _UUID4)

    assert "secret.prefix" not in repr(owner)
    assert str(_UUID4) not in repr(owner)
