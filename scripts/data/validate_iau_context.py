"""Validate the immutable Phase 2E IAU sky-context products without network access."""

from __future__ import annotations

from lumina.sky_context.domain.iau_context_artifact import (
    CONSTELLATION_ARTIFACT_BYTES,
    CONSTELLATION_ARTIFACT_SHA256,
    CONSTELLATION_PART_COUNT,
    CONSTELLATION_ROW_COUNT,
    CONSTELLATION_VERTEX_COUNT,
    NAMED_ANCHOR_ARTIFACT_BYTES,
    NAMED_ANCHOR_ARTIFACT_SHA256,
    IAUContextArtifactRejected,
    validate_iau_context_artifacts,
)


def main() -> int:
    try:
        named, constellations = validate_iau_context_artifacts()
    except IAUContextArtifactRejected as error:
        print(str(error))
        return 1
    print(
        "Phase 2E IAU sky-context validation passed: "
        f"{len(named.rows)} named anchors, {NAMED_ANCHOR_ARTIFACT_BYTES} bytes, "
        f"sha256:{NAMED_ANCHOR_ARTIFACT_SHA256}; "
        f"{len(constellations.constellations)} constellations, "
        f"{CONSTELLATION_PART_COUNT} boundary parts, {CONSTELLATION_VERTEX_COUNT} vertices, "
        f"{CONSTELLATION_ARTIFACT_BYTES} bytes, sha256:{CONSTELLATION_ARTIFACT_SHA256}; "
        f"{CONSTELLATION_ROW_COUNT} official identities."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
