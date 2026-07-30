"""Secret-safe static handler contract tests."""

from __future__ import annotations

import inspect

from lumina.jobs.domain.handler import (
    IncompatibleHandlerPayload,
    JobHandler,
    NonRetryableHandlerFailure,
    RetryableHandlerFailure,
)


def test_handler_protocol_receives_only_passive_payload() -> None:
    signature = inspect.signature(JobHandler.handle)

    assert list(signature.parameters) == ["self", "payload"]
    assert inspect.iscoroutinefunction(JobHandler.handle)


def test_declared_failures_are_fixed_and_redacted() -> None:
    sentinel = "HANDLER-DECLARATION-SECRET"

    for error_type in (
        RetryableHandlerFailure,
        NonRetryableHandlerFailure,
        IncompatibleHandlerPayload,
    ):
        error = error_type()
        assert sentinel not in str(error)
        assert sentinel not in repr(error)
        assert error.__cause__ is None
        assert error.__context__ is None
        assert error.args == (error_type.message,)
