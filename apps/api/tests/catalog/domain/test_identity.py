"""Strict tests for the versioned catalogue identity domain contract."""

from __future__ import annotations

import inspect
import unicodedata

import pytest
from lumina.catalog.domain.identity import (
    ALIAS_NORMALIZATION_UNICODE_VERSION,
    ALIAS_NORMALIZATION_VERSION,
    CatalogIdentityValidationError,
    normalize_alias,
    validate_alias_display,
    validate_public_slug,
)


def test_reviewed_normalization_constants_and_runtime_unicode_version() -> None:
    assert ALIAS_NORMALIZATION_VERSION == 1
    assert ALIAS_NORMALIZATION_UNICODE_VERSION == "15.0.0"
    assert unicodedata.unidata_version == ALIAS_NORMALIZATION_UNICODE_VERSION


def test_normalization_version_is_required_keyword_only_without_a_default() -> None:
    parameter = inspect.signature(normalize_alias).parameters["version"]
    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY
    assert parameter.default is inspect.Parameter.empty

    with pytest.raises(TypeError):
        normalize_alias("V376 Peg")  # type: ignore[call-arg]

    assert normalize_alias("V376 Peg", version=ALIAS_NORMALIZATION_VERSION) == "v376 peg"


@pytest.mark.parametrize("version", [0, 2, -1, True, False, "1", None])
def test_unsupported_normalization_versions_fail_closed(version: object) -> None:
    with pytest.raises(CatalogIdentityValidationError):
        normalize_alias("V376 Peg", version=version)  # type: ignore[arg-type]


def test_version_one_fails_closed_when_unicode_runtime_differs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(unicodedata, "unidata_version", "15.1.0")

    with pytest.raises(CatalogIdentityValidationError):
        normalize_alias("V376 Peg", version=ALIAS_NORMALIZATION_VERSION)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("ＡＢＣ １２３", "abc 123"),
        ("Kelvin", "kelvin"),
        ("Straße", "strasse"),
        ("İSTANBUL", "i̇stanbul"),
        ("\u2003V376\u00a0Peg\u2003", "v376 peg"),
        ("Café — M31?", "café — m31?"),
    ],
)
def test_version_one_golden_vectors(raw: str, expected: str) -> None:
    assert normalize_alias(raw, version=ALIAS_NORMALIZATION_VERSION) == expected


def test_whitespace_collapse_uses_str_isspace_and_ascii_space() -> None:
    raw = "\u2002  Alpha\u202f\u00a0Beta\u1680 Gamma \u3000"

    assert normalize_alias(raw, version=ALIAS_NORMALIZATION_VERSION) == "alpha beta gamma"


def test_normalization_preserves_punctuation_and_diacritics_without_transliteration() -> None:
    raw = "  Łódź / M 31 — naïve?  "

    assert normalize_alias(raw, version=ALIAS_NORMALIZATION_VERSION) == "łódź / m 31 — naïve?"


@pytest.mark.parametrize(
    "raw",
    [
        123,
        b"V376 Peg",
        "",
        " \t\u00a0 ",
        "a" * 256,
        "line\nfeed",
        "zero\u200bwidth",
        "private\ue000use",
        "surrogate\ud800",
        "unassigned\u0378",
    ],
)
def test_normalization_rejects_invalid_types_empty_overlength_and_category_c(
    raw: object,
) -> None:
    with pytest.raises(CatalogIdentityValidationError):
        normalize_alias(raw, version=ALIAS_NORMALIZATION_VERSION)  # type: ignore[arg-type]


@pytest.mark.parametrize("value", ["V376 Peg", "Café — M31?", "51 Pegasi", "α Centauri"])
def test_display_alias_validation_preserves_reviewed_spelling(value: str) -> None:
    assert validate_alias_display(value) == value


@pytest.mark.parametrize(
    "value",
    [
        1,
        b"V376 Peg",
        "",
        "a" * 256,
        " V376 Peg",
        "V376 Peg ",
        "\u00a0V376 Peg",
        "V376 Peg\u2003",
        "line\nfeed",
        "zero\u200bwidth",
        "private\ue000use",
        "surrogate\ud800",
        "unassigned\u0378",
    ],
)
def test_display_alias_validation_rejects_invalid_values(value: object) -> None:
    with pytest.raises(CatalogIdentityValidationError):
        validate_alias_display(value)  # type: ignore[arg-type]


@pytest.mark.parametrize("value", ["a", "51-pegasi", "hd-209458", "k2-18", "a" * 100])
def test_public_slug_validation_accepts_exact_lowercase_kebab_case(value: str) -> None:
    assert validate_public_slug(value) == value


@pytest.mark.parametrize(
    "value",
    [
        1,
        b"hd-209458",
        "",
        "a" * 101,
        "HD-209458",
        "hd_209458",
        "hd--209458",
        "-hd-209458",
        "hd-209458-",
        "hd 209458",
        "hd.209458",
        "hd-２０９４５８",
        "hd-209458\n",
    ],
)
def test_public_slug_validation_rejects_invalid_values(value: object) -> None:
    with pytest.raises(CatalogIdentityValidationError):
        validate_public_slug(value)  # type: ignore[arg-type]
