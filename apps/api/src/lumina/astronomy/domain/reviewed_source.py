"""Shared validation for exact reviewed source records in astronomy artifacts."""

from __future__ import annotations

from collections.abc import Collection, Mapping
from typing import NoReturn
from urllib.parse import urlparse

_SOURCE_FIELDS = frozenset(
    {
        "id",
        "title",
        "organization_or_authors",
        "url",
        "accessed_at",
        "dataset_or_release",
        "record_reference",
        "retrieved_at",
        "data_date",
        "terms_or_licence",
        "citation",
        "claim_scope",
        "source_type",
    }
)


def _reject(error_type: type[ValueError]) -> NoReturn:
    raise error_type()


def _string(
    value: object,
    *,
    error_type: type[ValueError],
    reject_whitespace_only: bool,
) -> str:
    if not isinstance(value, str):
        _reject(error_type)
    if reject_whitespace_only and not value.strip():
        _reject(error_type)
    if not reject_whitespace_only and not value:
        _reject(error_type)
    return value


def validate_reviewed_source(
    value: object,
    *,
    source_ids: Collection[str],
    source_urls: Mapping[str, str],
    error_type: type[ValueError],
    reject_whitespace_only: bool,
    reject_url_auth: bool = True,
) -> str:
    """Validate one exact reviewed source record and return its approved source ID."""
    if not isinstance(value, Mapping) or frozenset(value) != _SOURCE_FIELDS:
        _reject(error_type)

    source_id = _string(
        value["id"],
        error_type=error_type,
        reject_whitespace_only=reject_whitespace_only,
    )
    if source_id not in source_ids:
        _reject(error_type)

    url = _string(
        value["url"],
        error_type=error_type,
        reject_whitespace_only=reject_whitespace_only,
    )
    if url != source_urls.get(source_id):
        _reject(error_type)

    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        _reject(error_type)
    if reject_url_auth and (parsed.username or parsed.password):
        _reject(error_type)

    for key in _SOURCE_FIELDS - {"id", "url"}:
        _string(
            value[key],
            error_type=error_type,
            reject_whitespace_only=reject_whitespace_only,
        )
    return source_id
