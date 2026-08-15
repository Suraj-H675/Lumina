"""Safe command-line boundary tests for local conflict visibility."""

from __future__ import annotations

import json

import lumina.catalog.cli as cli
import pytest
from lumina.catalog.domain.read import CatalogConflictNotFound
from lumina.catalog.domain.reviewed_slice import ReviewedSlicePolicyRejected


def test_invalid_cli_invocation_is_fixed_and_does_not_reflect_input(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert cli.main(["conflicts", "list", "--limit", "PRIVATE-ARGUMENT"]) == 2

    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == "Invalid catalogue command.\n"
    assert "PRIVATE-ARGUMENT" not in captured.err


def test_list_renders_only_the_explicit_structured_payload(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def fake_run(_namespace: object) -> dict[str, object]:
        return {"items": [], "page": {"next_cursor": None, "has_more": False, "limit": 50}}

    monkeypatch.setattr(cli, "_run", fake_run)

    assert cli.main(["conflicts", "list"]) == 0
    assert capsys.readouterr() == (
        '{"items":[],"page":{"has_more":false,"limit":50,"next_cursor":null}}\n',
        "",
    )


def test_conflict_absence_has_its_distinct_exit_code(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def fake_run(_namespace: object) -> dict[str, object]:
        raise CatalogConflictNotFound()

    monkeypatch.setattr(cli, "_run", fake_run)

    assert cli.main(["conflicts", "show", "0" * 64]) == 3
    assert capsys.readouterr() == ("", "Catalogue conflict was not found.\n")


def test_reviewed_slice_validate_only_requires_no_database_and_is_canonical(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert (
        cli.main(
            [
                "ingest",
                "--slice",
                "gaia-dr3-exoplanet-host-photometry-v1",
                "--validate-only",
            ]
        )
        == 0
    )

    captured = capsys.readouterr()
    assert captured.err == ""
    payload = json.loads(captured.out)
    assert payload["status"] == "validated"
    assert payload["source_record_count"] == 5
    assert payload["measurement_count"] == 15
    assert (
        payload["artifact_sha256"]
        == "585efe5379533874906995a84946c1457a1f0442187bdf306e6da68d11d94304"
    )


def test_reviewed_slice_policy_failure_has_a_distinct_exit_code(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def fake_run(_namespace: object) -> dict[str, object]:
        raise ReviewedSlicePolicyRejected()

    monkeypatch.setattr(cli, "_run", fake_run)

    assert cli.main(["data-check", "--slice", "gaia-dr3-exoplanet-host-photometry-v1"]) == 4
    assert capsys.readouterr() == ("", "Catalogue data policy check failed.\n")
