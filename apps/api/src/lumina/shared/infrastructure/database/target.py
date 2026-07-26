"""Secret-safe validation for one unambiguous PostgreSQL connection target."""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import unquote

from sqlalchemy import URL
from sqlalchemy.engine import make_url

_DNS_LABEL_PATTERN = re.compile(
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?",
    re.ASCII,
)
_SAFE_ERROR = "Database target is invalid."


class DatabaseTargetError(ValueError):
    """Raised when a PostgreSQL URL does not identify one safe explicit target."""


@dataclass(frozen=True)
class DatabaseTarget:
    """Normalized non-secret identity for target equality checks."""

    host: str
    port: int
    database: str
    username: str


def parse_database_url(value: str, *, drivername: str) -> tuple[URL, DatabaseTarget]:
    """Reject raw query/fragment syntax, then parse without reflecting contents.

    String entry points retain delimiter provenance and therefore enforce this
    stricter check before SQLAlchemy can discard empty query parameters.
    """
    try:
        if "?" in value or "#" in value:
            raise ValueError
        parsed = make_url(value)
        target = validate_database_target(parsed, drivername=drivername)
    except Exception:
        raise DatabaseTargetError(_SAFE_ERROR) from None
    return parsed, target


def validate_database_target(url: URL, *, drivername: str) -> DatabaseTarget:
    """Require one decoded DNS/IP host, explicit port, database, and empty query."""
    try:
        port = url.port
        host = normalize_single_host(url.host)
    except (TypeError, ValueError):
        raise DatabaseTargetError(_SAFE_ERROR) from None

    username = url.username
    database = url.database
    if (
        url.drivername != drivername
        or not username
        or not url.password
        or host is None
        or port is None
        or not 1 <= port <= 65_535
        or not database
        or "#" in database
        or any(ord(character) < 32 or ord(character) == 127 for character in database)
        or bool(url.query)
    ):
        raise DatabaseTargetError(_SAFE_ERROR)
    return DatabaseTarget(
        host=host,
        port=port,
        database=database,
        username=username,
    )


def normalize_single_host(host: str | None) -> str | None:
    """Normalize one decoded DNS/IP host and reject ambiguous connection forms."""
    if host is None:
        return None
    decoded = unquote(host)
    if (
        not decoded
        or decoded != decoded.strip()
        or not decoded.isascii()
        or "%" in decoded
        or any(ord(character) < 33 or ord(character) == 127 for character in decoded)
        or any(character in decoded for character in (",", "/", "\\", "@", "[", "]"))
    ):
        raise ValueError

    try:
        return ipaddress.ip_address(decoded).compressed.lower()
    except ValueError:
        if ":" in decoded or len(decoded) > 253:
            raise ValueError from None

    normalized = decoded.removesuffix(".").lower()
    labels = normalized.split(".")
    if not normalized or any(_DNS_LABEL_PATTERN.fullmatch(label) is None for label in labels):
        raise ValueError
    return normalized
