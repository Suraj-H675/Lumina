"""Silent invalid CLI and pre-startup help tests."""

from __future__ import annotations

import lumina.worker.cli as cli
import pytest


def test_invalid_invocation_is_silent_and_constructs_nothing(
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    sentinel = "argv-secret"

    class ForbiddenOutput:
        def __init__(self) -> None:
            raise AssertionError("output constructed")

    monkeypatch.setattr(cli, "NonBlockingProcessOutput", ForbiddenOutput)

    assert cli.main([sentinel]) == 2
    captured = capfd.readouterr()
    assert captured.out == ""
    assert captured.err == ""


def test_help_exits_before_output_activation(
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    class ForbiddenOutput:
        def __init__(self) -> None:
            raise AssertionError("output constructed")

    monkeypatch.setattr(cli, "NonBlockingProcessOutput", ForbiddenOutput)

    assert cli.main(["--help"]) == 0
    captured = capfd.readouterr()
    assert "usage: lumina-worker" in captured.out
    assert captured.err == ""
