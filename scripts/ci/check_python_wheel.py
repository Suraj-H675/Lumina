"""Build the API wheel and verify canonical repository data is packaged byte-for-byte."""

from __future__ import annotations

import subprocess
import tempfile
import zipfile
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_API_ROOT = _REPOSITORY_ROOT / "apps" / "api"

_RESOURCE_MAP = {
    Path("data/manifests/sources/nasa-apod.json"): "lumina/data/manifests/sources/nasa-apod.json",
    Path("data/manifests/sources/nasa-exoplanet-archive.json"): (
        "lumina/data/manifests/sources/nasa-exoplanet-archive.json"
    ),
    Path("data/manifests/sources/nasa-neows.json"): (
        "lumina/data/manifests/sources/nasa-neows.json"
    ),
    Path("data/manifests/sources/noaa-swpc.json"): ("lumina/data/manifests/sources/noaa-swpc.json"),
    Path("data/manifests/sources/celestrak-gp.json"): (
        "lumina/data/manifests/sources/celestrak-gp.json"
    ),
    Path("data/manifests/sources/launch-library-2.json"): (
        "lumina/data/manifests/sources/launch-library-2.json"
    ),
    Path("data/manifests/sources/zooniverse-panoptes.json"): (
        "lumina/data/manifests/sources/zooniverse-panoptes.json"
    ),
    Path("data/seed/participate-v1.json"): "lumina/data/participate-v1.json",
}


def check_wheel() -> None:
    with tempfile.TemporaryDirectory(prefix="lumina-wheel-check-") as temporary:
        output = Path(temporary)
        subprocess.run(
            [
                "uv",
                "build",
                "--wheel",
                str(_API_ROOT),
                "--out-dir",
                str(output),
                "--no-build-logs",
                "--no-create-gitignore",
            ],
            cwd=_REPOSITORY_ROOT,
            check=True,
        )
        wheels = tuple(output.glob("*.whl"))
        if len(wheels) != 1:
            raise RuntimeError("API wheel build did not produce exactly one wheel")
        with zipfile.ZipFile(wheels[0]) as archive:
            names = set(archive.namelist())
            for source, distribution_path in _RESOURCE_MAP.items():
                source_bytes = (_REPOSITORY_ROOT / source).read_bytes()
                if distribution_path not in names:
                    raise RuntimeError(f"API wheel is missing {distribution_path}")
                if archive.read(distribution_path) != source_bytes:
                    raise RuntimeError(f"API wheel resource drifted: {distribution_path}")


def main() -> int:
    try:
        check_wheel()
    except (OSError, subprocess.CalledProcessError, RuntimeError, zipfile.BadZipFile) as error:
        print(f"Python wheel check failed: {error}")
        return 1
    print(f"Python wheel check passed: {len(_RESOURCE_MAP)} canonical resources verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
