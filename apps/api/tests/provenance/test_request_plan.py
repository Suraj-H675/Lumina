"""Provider request-plan contracts for bounded single and multi-component syncs."""

from __future__ import annotations

import hashlib

import pytest
from lumina.provenance.domain.request_plan import (
    ProviderRequestComponent,
    ProviderRequestPlan,
)


def test_one_component_plan_preserves_the_existing_body_checksum() -> None:
    plan = ProviderRequestPlan.single(
        request="fixture-request",
        max_response_bytes=65_536,
    )

    assert plan.component_ids == ("default",)
    assert plan.max_total_response_bytes is None
    assert plan.aggregate_sha256((b"fixture-body",)) == hashlib.sha256(b"fixture-body").hexdigest()


def test_swpc_style_plan_uses_ordered_domain_separated_component_framing() -> None:
    plan = ProviderRequestPlan(
        components=(
            ProviderRequestComponent("scales", "scales-request", 16_384),
            ProviderRequestComponent("kp", "kp-request", 65_536),
        ),
        max_total_response_bytes=262_144,
        checksum_domain="LUMINA-SWPC-SNAPSHOT-V1",
    )

    assert plan.component_ids == ("scales", "kp")
    assert plan.aggregate_sha256((b"{}", b"[]")) == (
        "ee6b11168fac9785ffbc2a93e2c14d2e66d3d195acd7e82a07526a3d5c6769e5"
    )
    assert plan.aggregate_sha256((b"{}", b"[1]")) != plan.aggregate_sha256((b"{}", b"[]"))
    assert plan.aggregate_sha256((b"[]", b"{}")) != plan.aggregate_sha256((b"{}", b"[]"))


def test_request_plan_rejects_duplicate_or_unbounded_components() -> None:
    with pytest.raises(ValueError):
        ProviderRequestPlan(
            components=(
                ProviderRequestComponent("duplicate", object(), 1),
                ProviderRequestComponent("duplicate", object(), 1),
            )
        )

    with pytest.raises(ValueError):
        ProviderRequestPlan(
            components=tuple(
                ProviderRequestComponent(f"component-{index}", object(), 1) for index in range(9)
            )
        )
