"""Safe command-line boundary tests for local conflict visibility."""

from __future__ import annotations

import json
from types import SimpleNamespace

import lumina.catalog.cli as cli
import pytest
from lumina.catalog.application.messier import MESSIER_V2_SLICE_ID
from lumina.catalog.domain.read import CatalogConflictNotFound
from lumina.catalog.domain.reviewed_slice import ReviewedSlicePolicyRejected
from lumina.catalog.infrastructure.postgresql.messier_selection import (
    MESSIER_V2_SELECTION_SHA256,
)


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


@pytest.mark.asyncio
async def test_messier_operator_runtime_reuses_validated_database_tls_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    main_url = object()
    operator_url = object()
    runtime_calls: list[tuple[object, str]] = []

    class FakeEngine:
        async def dispose(self) -> None:
            return None

    class FakeMessierService:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        async def ingest(self) -> SimpleNamespace:
            return SimpleNamespace(
                existing_measurement_count=0,
                inserted_measurement_count=220,
                inserted_source_record_count=110,
                measurement_count=220,
                replayed_source_record_count=0,
                slice_id=MESSIER_V2_SLICE_ID,
                source_record_count=110,
                status="ingested",
            )

    class FakeSelectionStore:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            pass

        async def select_and_fingerprint(self) -> SimpleNamespace:
            return SimpleNamespace(
                fingerprint=MESSIER_V2_SELECTION_SHA256,
                inserted_count=110,
                unchanged_count=0,
                superseded_count=0,
            )

    def fake_runtime(database_url: object, *, tls_mode: str = "disable") -> SimpleNamespace:
        runtime_calls.append((database_url, tls_mode))
        return SimpleNamespace(session_factory=object(), engine=FakeEngine())

    monkeypatch.setattr(
        cli,
        "load_settings",
        lambda: SimpleNamespace(
            database_url=main_url,
            resolved_database_tls_mode="verify-full",
        ),
    )
    monkeypatch.setattr(
        cli,
        "load_catalog_operator_settings",
        lambda: SimpleNamespace(database_url=operator_url),
    )
    monkeypatch.setattr(cli, "create_database_runtime", fake_runtime)
    monkeypatch.setattr(cli, "PostgreSqlCatalogIngestionStore", lambda _factory: object())
    monkeypatch.setattr(cli, "CatalogIngestionService", lambda _store: object())
    monkeypatch.setattr(cli, "MessierReviewedIngestionService", FakeMessierService)
    monkeypatch.setattr(cli, "PostgreSqlMessierCanonicalSelectionStore", FakeSelectionStore)

    namespace = cli._parser().parse_args(["ingest", "--slice", MESSIER_V2_SLICE_ID])
    result = await cli._run(namespace)

    assert result["status"] == "ingested"
    assert runtime_calls == [
        (main_url, "verify-full"),
        (operator_url, "verify-full"),
    ]
