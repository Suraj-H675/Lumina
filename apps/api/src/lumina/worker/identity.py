"""Validated, fully redacted worker owner-identity construction."""

from __future__ import annotations

import re
from collections.abc import Callable
from uuid import RFC_4122, UUID, uuid4

from lumina.jobs.domain.heartbeat import JobHeartbeatValidationError, JobOwnerToken

_PREFIX_PATTERN = re.compile(r"[a-z][a-z0-9_.-]{0,90}", re.ASCII)


class WorkerIdentityValidationError(ValueError):
    """Fixed failure for invalid prefix or UUID-factory evidence."""

    def __init__(self) -> None:
        super().__init__("Worker identity configuration is invalid.")

    def __repr__(self) -> str:
        return "WorkerIdentityValidationError(<redacted>)"


def validate_worker_id_prefix(value: object) -> str:
    """Require the accepted owner-token prefix grammar and length."""
    if type(value) is not str or _PREFIX_PATTERN.fullmatch(value) is None:
        raise WorkerIdentityValidationError()
    return value


def build_worker_owner_identity(
    prefix: str,
    *,
    uuid_factory: Callable[[], UUID] = uuid4,
) -> JobOwnerToken:
    """Call the UUID factory once and build one canonical process owner token."""
    validated_prefix = validate_worker_id_prefix(prefix)
    generated: object | None = None
    factory_failed = False
    try:
        generated = uuid_factory()
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        factory_failed = True
    if (
        factory_failed
        or type(generated) is not UUID
        or generated.version != 4
        or generated.variant != RFC_4122
    ):
        raise WorkerIdentityValidationError()

    owner_value = f"{validated_prefix}.{str(generated)}"
    token_failed = False
    token: JobOwnerToken | None = None
    try:
        token = JobOwnerToken(owner_value)
    except JobHeartbeatValidationError:
        token_failed = True
    if token_failed or token is None or len(owner_value) > 128:
        raise WorkerIdentityValidationError()
    return token
