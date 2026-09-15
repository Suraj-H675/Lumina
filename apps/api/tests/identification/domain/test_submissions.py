"""Private identification-submission metadata contracts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from lumina.identification.domain.storage import PrivateObjectKey
from lumina.identification.domain.submissions import (
    CreateIdentificationSubmission,
    SubmissionValidationError,
    sanitize_original_filename,
)
from lumina.identification.domain.uploads import UploadMediaType

_NOW = datetime(2026, 9, 15, 12, tzinfo=UTC)


def _command(**overrides: object) -> CreateIdentificationSubmission:
    values: dict[str, object] = {
        "id": uuid4(),
        "storage_object_key": PrivateObjectKey("a" * 32),
        "original_filename": "night-sky.png",
        "media_type": UploadMediaType.PNG,
        "byte_size": 123,
        "width": 100,
        "height": 80,
        "sha256": "b" * 64,
        "retention_until": _NOW + timedelta(hours=24),
    }
    values.update(overrides)
    return CreateIdentificationSubmission(**values)  # type: ignore[arg-type]


def test_filename_is_display_only_leaf_and_normalized() -> None:
    assert sanitize_original_filename("../private/night.png") == "night.png"
    assert sanitize_original_filename(r"C:\Users\fixture\night.png") == "night.png"
    assert sanitize_original_filename("  night.png  ") == "night.png"


@pytest.mark.parametrize("value", [None, "", ".", "..", "bad\x00.png", "bad\n.png", "a" * 256])
def test_invalid_filename_fails_without_reflection(value: object) -> None:
    with pytest.raises(SubmissionValidationError) as failure:
        sanitize_original_filename(value)
    if str(value):
        assert str(value) not in repr(failure.value)


def test_create_submission_is_redacted_and_requires_uuid4() -> None:
    command = _command()
    assert repr(command) == "CreateIdentificationSubmission(<redacted>)"
    assert command.retention_until == _NOW + timedelta(hours=24)
    with pytest.raises(SubmissionValidationError):
        _command(id=UUID("12345678-1234-1234-9234-123456789abc"))


@pytest.mark.parametrize(
    "overrides",
    [
        {"byte_size": 0},
        {"width": 0},
        {"height": 0},
        {"width": 20_000, "height": 20_000},
        {"sha256": "A" * 64},
        {"media_type": "image/png"},
        {"storage_object_key": "a" * 32},
    ],
)
def test_create_submission_rejects_malformed_private_metadata(overrides: dict[str, object]) -> None:
    with pytest.raises(SubmissionValidationError):
        _command(**overrides)
