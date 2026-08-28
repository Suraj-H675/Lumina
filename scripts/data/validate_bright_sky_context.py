"""Validate the immutable Gaia DR3 bright-star context without network access."""

from __future__ import annotations

from lumina.sky_context.domain.bright_star_artifact import (
    BRIGHT_STAR_ARTIFACT_BYTES,
    BRIGHT_STAR_ARTIFACT_SHA256,
    BRIGHT_STAR_ROW_COUNT,
    BrightStarArtifactRejected,
    validate_bright_star_artifact,
)


def main() -> int:
    try:
        validate_bright_star_artifact()
    except BrightStarArtifactRejected as error:
        print(str(error))
        return 1
    print(
        "Gaia DR3 bright-star context validation passed: "
        f"{BRIGHT_STAR_ROW_COUNT} rows, {BRIGHT_STAR_ARTIFACT_BYTES} bytes, "
        f"sha256:{BRIGHT_STAR_ARTIFACT_SHA256}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
