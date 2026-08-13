"""Safe command-line boundary tests for local conflict visibility."""

from __future__ import annotations

import lumina.catalog.cli as cli
import pytest
from lumina.catalog.domain.read import CatalogConflictNotFound


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
