"""Package-level smoke tests retained from the Phase 0A backend skeleton."""

from importlib import metadata

import lumina


def test_package_version_comes_from_installed_metadata() -> None:
    """The public version has one authoritative package-metadata source."""
    assert lumina.__version__ == metadata.version("lumina-api")


def test_console_entry_point_is_installed() -> None:
    """The API runner is exposed through package metadata."""
    scripts = {
        entry_point.name: entry_point.value
        for entry_point in metadata.entry_points(group="console_scripts")
    }
    assert scripts["lumina-api"] == "lumina.main:run"
