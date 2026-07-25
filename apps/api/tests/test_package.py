"""Package-level smoke tests for the Phase 0A backend skeleton."""

import lumina


def test_package_version_is_available() -> None:
    """The package exposes its deterministic repository-foundation version."""
    assert lumina.__version__ == "0.0.0"
