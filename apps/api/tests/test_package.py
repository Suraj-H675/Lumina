"""Package-level smoke tests for the installable backend distribution."""

import tomllib
from importlib import metadata
from pathlib import Path

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


def test_wheel_resources_are_force_included_from_canonical_repository_data() -> None:
    repository_root = Path(__file__).resolve().parents[3]
    package_config = tomllib.loads((repository_root / "apps/api/pyproject.toml").read_text())
    force_include = package_config["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]

    assert force_include == {
        "../../data/manifests/sources": "lumina/data/manifests/sources",
        "../../data/seed/participate-v1.json": "lumina/data/participate-v1.json",
    }
    assert not (repository_root / "apps/api/src/lumina/data").exists()
    assert (repository_root / "data/seed/participate-v1.json").is_file()
    for name in (
        "nasa-apod.json",
        "nasa-exoplanet-archive.json",
        "nasa-neows.json",
        "noaa-swpc.json",
        "celestrak-gp.json",
        "launch-library-2.json",
        "zooniverse-panoptes.json",
    ):
        assert (repository_root / "data/manifests/sources" / name).is_file()
