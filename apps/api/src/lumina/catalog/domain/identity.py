"""Deterministic, versioned validation for public catalogue identity values.

The catalogue stores an alias's normalized value together with the normalization version that
defined it.  This module contains the version-1 implementation without importing any persistence,
provider, API, or framework code.  A Python or Unicode-runtime upgrade must not silently change
the meaning of an existing version-1 value, so normalization fails closed on an unexpected
Unicode database version.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Final

ALIAS_NORMALIZATION_VERSION: Final = 1
ALIAS_NORMALIZATION_UNICODE_VERSION: Final = "15.0.0"

_MAX_ALIAS_CODEPOINTS: Final = 255
_MAX_SLUG_CODEPOINTS: Final = 100
PUBLIC_SLUG_PATTERN: Final = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
_PUBLIC_SLUG_PATTERN: Final = re.compile(PUBLIC_SLUG_PATTERN, re.ASCII)
_IDENTITY_VALIDATION_MESSAGE: Final = "Catalogue identity value is invalid."


class CatalogIdentityValidationError(ValueError):
    """Raised when a catalogue alias or public slug violates its domain contract."""

    def __init__(self) -> None:
        # Keep failures fixed and non-evidentiary: callers may pass source-controlled or user
        # supplied identity text, and validation errors must not echo it into logs or responses.
        super().__init__(_IDENTITY_VALIDATION_MESSAGE)

    def __repr__(self) -> str:
        """Keep invalid identity text out of diagnostics."""
        return "CatalogIdentityValidationError(<redacted>)"


def _contains_category_c(value: str) -> bool:
    """Return whether any code point belongs to Unicode's ``C*`` category family."""

    return any(unicodedata.category(character).startswith("C") for character in value)


def _collapse_unicode_whitespace(value: str) -> str:
    """Collapse each maximal ``str.isspace`` run to one ASCII space."""

    collapsed: list[str] = []
    in_whitespace = False
    for character in value:
        if character.isspace():
            if not in_whitespace:
                collapsed.append(" ")
            in_whitespace = True
        else:
            collapsed.append(character)
            in_whitespace = False
    return "".join(collapsed).strip(" ")


def _require_version(version: int) -> None:
    """Reject unsupported normalization versions without accepting ``bool`` as version 1."""

    if type(version) is not int or version != ALIAS_NORMALIZATION_VERSION:
        raise CatalogIdentityValidationError()


def _require_unicode_runtime() -> None:
    """Ensure the Unicode tables used for version 1 are the reviewed tables."""

    if unicodedata.unidata_version != ALIAS_NORMALIZATION_UNICODE_VERSION:
        raise CatalogIdentityValidationError()


def normalize_alias(
    raw: str,
    *,
    version: int,
) -> str:
    """Return the deterministic normalized alias for an explicitly selected version.

    Version 1 requires Unicode 15.0.0, rejects all Unicode ``C*`` category code points, applies
    NFKC and casefold, collapses Unicode whitespace according to ``str.isspace``, and preserves
    punctuation and diacritics.  The keyword-only version has intentionally no default: every
    persisted normalized alias must declare the version that produced it.
    """

    _require_version(version)
    _require_unicode_runtime()

    if type(raw) is not str or not raw or _contains_category_c(raw):
        raise CatalogIdentityValidationError()

    normalized = unicodedata.normalize("NFKC", raw).casefold()
    normalized = _collapse_unicode_whitespace(normalized)
    if (
        not normalized
        or len(normalized) > _MAX_ALIAS_CODEPOINTS
        or _contains_category_c(normalized)
    ):
        raise CatalogIdentityValidationError()
    return normalized


def validate_alias_display(value: str) -> str:
    """Validate and return an alias display value without changing its spelling.

    Display aliases are curated source-facing text.  Unlike normalized aliases, they are not
    case-folded or whitespace-collapsed; leading and trailing Unicode whitespace is rejected so
    the reviewed display string remains unambiguous.
    """

    if type(value) is not str or not value or len(value) > _MAX_ALIAS_CODEPOINTS:
        raise CatalogIdentityValidationError()
    if _contains_category_c(value) or value[0].isspace() or value[-1].isspace():
        raise CatalogIdentityValidationError()
    return value


def validate_public_slug(value: str) -> str:
    """Validate and return a stable lowercase ASCII kebab-case public slug."""

    if (
        type(value) is not str
        or not 1 <= len(value) <= _MAX_SLUG_CODEPOINTS
        or _PUBLIC_SLUG_PATTERN.fullmatch(value) is None
    ):
        raise CatalogIdentityValidationError()
    return value
