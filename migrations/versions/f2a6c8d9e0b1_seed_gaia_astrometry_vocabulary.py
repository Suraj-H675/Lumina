"""Seed the reviewed Gaia DR3 ICRS astrometry vocabulary.

Revision ID: f2a6c8d9e0b1
Revises: e8f4c1a9b362
Create Date: 2026-08-27

This migration owns reference vocabulary only.  The reviewed astrometry data
product creates its provider, dataset, source records, and measurements through
the bounded offline ingestion boundary after this revision is applied.
"""

from __future__ import annotations

from typing import NoReturn
from uuid import UUID

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "f2a6c8d9e0b1"
down_revision = "e8f4c1a9b362"
branch_labels = None
depends_on = None

_SAFE_ERROR = "Gaia DR3 astrometry vocabulary migration precondition failed."
_UPGRADE_LOCK_TABLES = ("quantity", "unit", "quantity_unit")
_DOWNGRADE_LOCK_TABLES = (
    "quantity",
    "unit",
    "quantity_unit",
    "measurement",
    "canonical_measurement",
)

# UUIDv5 identities derived from the explicit v1 vocabulary seeds documented by
# the Phase 2A0 review.  Constants are frozen here so replay never depends on
# a runtime namespace or UUID generator.
_UNIT_ROW = (
    UUID("48176d92-8406-52ae-855a-aa2f48dfd089"),
    "deg",
    "deg",
    "degree",
)
_QUANTITY_ROWS = (
    (
        UUID("3c034f43-6cac-58b0-863a-c72c01cbbd0f"),
        "gaia_icrs_right_ascension",
        "Gaia ICRS right ascension at reference epoch",
    ),
    (
        UUID("18e12409-5731-5fb0-bb26-8f7033a52621"),
        "gaia_icrs_declination",
        "Gaia ICRS declination at reference epoch",
    ),
)
_UNIT_ID = _UNIT_ROW[0]
_QUANTITY_IDS = tuple(row[0] for row in _QUANTITY_ROWS)
_QUANTITY_CODES = tuple(row[1] for row in _QUANTITY_ROWS)
_QUANTITY_NAMES = tuple(row[2] for row in _QUANTITY_ROWS)
_QUANTITY_UNIT_ROWS = tuple((quantity_id, _UNIT_ID) for quantity_id in _QUANTITY_IDS)


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _connection() -> Connection:
    return op.get_bind()


def _identity() -> MigrationIdentity:
    configuration = context.get_context().config
    configured = configuration.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _assert_migration_actor(connection: Connection) -> None:
    identity = _identity()
    current_user, session_user = connection.execute(
        sa.text("SELECT current_user, session_user")
    ).one()
    if (
        current_user != identity.migration_role
        or session_user != identity.migration_role
        or identity.runtime_role == identity.migration_role
    ):
        _fail()


def _assert_revision(connection: Connection, expected: str) -> None:
    actual = connection.execute(
        sa.text("SELECT version_num FROM alembic_version")
    ).scalar_one_or_none()
    if actual != expected:
        _fail()


def _lock_tables(connection: Connection, tables: tuple[str, ...]) -> None:
    connection.execute(
        sa.text(
            "LOCK TABLE "
            + ", ".join(f"public.{table}" for table in tables)
            + " IN SHARE ROW EXCLUSIVE MODE"
        )
    )


def _count(connection: Connection, statement: str, parameters: dict[str, object]) -> int:
    value = connection.execute(sa.text(statement), parameters).scalar_one()
    if not isinstance(value, int):
        _fail()
    return value


def _assert_no_target_collisions(connection: Connection) -> None:
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.unit "
            "WHERE id = :unit_id OR code = :unit_code OR name = :unit_name",
            {"unit_id": _UNIT_ID, "unit_code": _UNIT_ROW[1], "unit_name": _UNIT_ROW[3]},
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.quantity "
            "WHERE id = ANY(CAST(:ids AS uuid[])) "
            "OR code = ANY(CAST(:codes AS text[])) "
            "OR name = ANY(CAST(:names AS text[]))",
            {
                "ids": list(_QUANTITY_IDS),
                "codes": list(_QUANTITY_CODES),
                "names": list(_QUANTITY_NAMES),
            },
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.quantity_unit "
            "WHERE (quantity_id = ANY(CAST(:quantity_ids AS uuid[])) AND unit_id = :unit_id) "
            "OR quantity_id = ANY(CAST(:quantity_ids AS uuid[])) OR unit_id = :unit_id",
            {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
        )
        != 0
    ):
        _fail()


def _insert_rows(
    connection: Connection,
    *,
    table: str,
    columns: tuple[str, ...],
    rows: tuple[tuple[object, ...], ...],
    returning_column: str,
    expected_ids: tuple[UUID, ...],
) -> None:
    values: list[str] = []
    parameters: dict[str, object] = {}
    for row_index, row in enumerate(rows):
        if len(row) != len(columns):
            _fail()
        placeholders: list[str] = []
        for column_index, value in enumerate(row):
            parameter_name = f"value_{row_index}_{column_index}"
            placeholders.append(f":{parameter_name}")
            parameters[parameter_name] = value
        values.append("(" + ", ".join(placeholders) + ")")
    result = connection.execute(
        sa.text(
            f"INSERT INTO public.{table} ({', '.join(columns)}) "
            f"VALUES {', '.join(values)} RETURNING {returning_column}"
        ),
        parameters,
    )
    inserted = tuple(result.scalars())
    if len(inserted) != len(expected_ids) or set(inserted) != set(expected_ids):
        _fail()


def _assert_exact_vocabulary(connection: Connection) -> None:
    unit = connection.execute(
        sa.text("SELECT id, code, symbol, name FROM public.unit WHERE id = :unit_id"),
        {"unit_id": _UNIT_ID},
    ).one_or_none()
    if unit is None or tuple(unit) != _UNIT_ROW:
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.unit "
            "WHERE (id = :unit_id OR code = :unit_code OR name = :unit_name) "
            "AND NOT (id = :unit_id AND code = :unit_code AND name = :unit_name)",
            {"unit_id": _UNIT_ID, "unit_code": _UNIT_ROW[1], "unit_name": _UNIT_ROW[3]},
        )
        != 0
    ):
        _fail()

    quantities = {
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT id, code, name FROM public.quantity WHERE id = ANY(CAST(:ids AS uuid[]))"
            ),
            {"ids": list(_QUANTITY_IDS)},
        )
    }
    if quantities != set(_QUANTITY_ROWS):
        _fail()
    if _count(
        connection,
        "SELECT count(*) FROM public.quantity WHERE code = ANY(CAST(:codes AS text[])) "
        "AND name = ANY(CAST(:names AS text[]))",
        {"codes": list(_QUANTITY_CODES), "names": list(_QUANTITY_NAMES)},
    ) != len(_QUANTITY_ROWS):
        _fail()

    pairs = {
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT quantity_id, unit_id FROM public.quantity_unit "
                "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) "
                "AND unit_id = :unit_id"
            ),
            {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
        )
    }
    if pairs != set(_QUANTITY_UNIT_ROWS):
        _fail()
    if _count(
        connection,
        "SELECT count(*) FROM public.quantity_unit "
        "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) "
        "OR unit_id = :unit_id",
        {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
    ) != len(_QUANTITY_UNIT_ROWS):
        _fail()


def _assert_no_runtime_dependencies(connection: Connection) -> None:
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.quantity_unit "
            "WHERE unit_id = :unit_id "
            "AND NOT quantity_id = ANY(CAST(:quantity_ids AS uuid[]))",
            {"unit_id": _UNIT_ID, "quantity_ids": list(_QUANTITY_IDS)},
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.measurement "
            "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) OR unit_id = :unit_id",
            {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.canonical_measurement "
            "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) "
            "OR measurement_id IN (SELECT id FROM public.measurement WHERE "
            "quantity_id = ANY(CAST(:quantity_ids AS uuid[])) OR unit_id = :unit_id)",
            {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
        )
        != 0
    ):
        _fail()


def _delete_exact(
    connection: Connection,
    statement: str,
    parameters: dict[str, object],
    expected_count: int,
) -> None:
    result = connection.execute(sa.text(statement), parameters)
    if result.rowcount != expected_count:
        _fail()


def upgrade() -> None:
    """Insert exactly the approved Gaia ICRS degree vocabulary."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    _assert_migration_actor(connection)
    _assert_revision(connection, down_revision)
    _lock_tables(connection, _UPGRADE_LOCK_TABLES)
    _assert_no_target_collisions(connection)

    _insert_rows(
        connection,
        table="unit",
        columns=("id", "code", "symbol", "name"),
        rows=(_UNIT_ROW,),
        returning_column="id",
        expected_ids=(_UNIT_ID,),
    )
    _insert_rows(
        connection,
        table="quantity",
        columns=("id", "code", "name"),
        rows=_QUANTITY_ROWS,
        returning_column="id",
        expected_ids=_QUANTITY_IDS,
    )
    _insert_rows(
        connection,
        table="quantity_unit",
        columns=("quantity_id", "unit_id"),
        rows=_QUANTITY_UNIT_ROWS,
        returning_column="quantity_id",
        expected_ids=_QUANTITY_IDS,
    )
    _assert_exact_vocabulary(connection)


def downgrade() -> None:
    """Remove only this untouched vocabulary; scientific dependencies block reversal."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    _assert_migration_actor(connection)
    _assert_revision(connection, revision)
    _lock_tables(connection, _DOWNGRADE_LOCK_TABLES)
    _assert_exact_vocabulary(connection)
    _assert_no_runtime_dependencies(connection)

    _delete_exact(
        connection,
        "DELETE FROM public.quantity_unit "
        "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) AND unit_id = :unit_id",
        {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
        len(_QUANTITY_UNIT_ROWS),
    )
    _delete_exact(
        connection,
        "DELETE FROM public.quantity WHERE id = ANY(CAST(:quantity_ids AS uuid[]))",
        {"quantity_ids": list(_QUANTITY_IDS)},
        len(_QUANTITY_ROWS),
    )
    _delete_exact(
        connection,
        "DELETE FROM public.unit WHERE id = :unit_id",
        {"unit_id": _UNIT_ID},
        1,
    )
