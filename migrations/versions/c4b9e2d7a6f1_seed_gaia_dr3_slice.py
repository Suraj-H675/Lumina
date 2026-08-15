"""Seed the immutable reviewed Gaia DR3 entity and magnitude vocabulary slice.

Revision ID: c4b9e2d7a6f1
Revises: a1a3c0f17c5e
Create Date: 2026-08-15

This bounded bootstrap intentionally creates no provider, dataset, source-record,
measurement, canonical-selection, or ingestion-conflict state.  Those runtime
facts are created only by the reviewed offline ingestion boundary.
"""

from __future__ import annotations

from typing import NoReturn
from uuid import UUID

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "c4b9e2d7a6f1"
down_revision = "a1a3c0f17c5e"
branch_labels = None
depends_on = None

_SAFE_ERROR = "Gaia DR3 seed migration precondition failed."
_UPGRADE_LOCK_TABLES = ("entity", "quantity", "unit", "quantity_unit")
_DOWNGRADE_LOCK_TABLES = (
    "provider",
    "dataset",
    "entity",
    "source_record",
    "quantity",
    "unit",
    "quantity_unit",
    "measurement",
    "canonical_measurement",
    "ingestion_conflict",
)
_SCOPED_PROVIDER_CODE = "esa-gaia"
_SCOPED_DATASET_CODE = "gaia-source"
_SCOPED_DATASET_RELEASE = "dr3"

_ENTITY_ROWS = (
    (UUID("26f4b667-ecd9-524d-8121-29508723715a"), "star", "HD 209458"),
    (UUID("bbfe8678-81ca-5e70-ac95-c597d7655540"), "star", "Kepler-186"),
    (UUID("bfd42670-3013-598e-8eb5-5a1c084dd1a0"), "star", "Kepler-452"),
    (UUID("c593bd18-c4bc-5551-8a41-09f1b501f981"), "star", "51 Pegasi"),
    (UUID("403d0e71-8d81-5c52-abad-c4666c1b5cd6"), "star", "K2-18"),
)
_QUANTITY_ROWS = (
    (
        UUID("2c3626b7-647f-5180-8662-5240238e1acc"),
        "gaia_g_mean_magnitude",
        "Gaia G-band mean magnitude (Vega scale)",
    ),
    (
        UUID("b9532ccd-e769-5d36-9046-b7c1bc138841"),
        "gaia_bp_mean_magnitude",
        "Gaia integrated BP mean magnitude (Vega scale)",
    ),
    (
        UUID("347f0167-0786-5d34-a4d4-a4da006343eb"),
        "gaia_rp_mean_magnitude",
        "Gaia integrated RP mean magnitude (Vega scale)",
    ),
)
_UNIT_ROW = (
    UUID("4e4a920b-dc09-5556-a056-c08ba155c18a"),
    "mag",
    "mag",
    "magnitude",
)
_ENTITY_IDS = tuple(row[0] for row in _ENTITY_ROWS)
_ENTITY_NAMES = tuple(row[2] for row in _ENTITY_ROWS)
_QUANTITY_IDS = tuple(row[0] for row in _QUANTITY_ROWS)
_QUANTITY_CODES = tuple(row[1] for row in _QUANTITY_ROWS)
_QUANTITY_NAMES = tuple(row[2] for row in _QUANTITY_ROWS)
_UNIT_ID = _UNIT_ROW[0]
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
            "SELECT count(*) FROM public.entity "
            "WHERE id = ANY(CAST(:ids AS uuid[])) "
            "OR canonical_name = ANY(CAST(:names AS text[]))",
            {"ids": list(_ENTITY_IDS), "names": list(_ENTITY_NAMES)},
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
            "SELECT count(*) FROM public.unit WHERE id = :id OR code = :code OR name = :name",
            {"id": _UNIT_ID, "code": _UNIT_ROW[1], "name": _UNIT_ROW[3]},
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.quantity_unit "
            "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) AND unit_id = :unit_id",
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


def _assert_exact_seed_rows(connection: Connection) -> None:
    entities = {
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT id, entity_type, canonical_name FROM public.entity "
                "WHERE id = ANY(CAST(:ids AS uuid[]))"
            ),
            {"ids": list(_ENTITY_IDS)},
        )
    }
    if entities != set(_ENTITY_ROWS):
        _fail()
    if _count(
        connection,
        "SELECT count(*) FROM public.entity WHERE canonical_name = ANY(CAST(:names AS text[]))",
        {"names": list(_ENTITY_NAMES)},
    ) != len(_ENTITY_ROWS):
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
        "SELECT count(*) FROM public.quantity WHERE name = ANY(CAST(:names AS text[]))",
        {"names": list(_QUANTITY_NAMES)},
    ) != len(_QUANTITY_ROWS):
        _fail()

    unit = connection.execute(
        sa.text("SELECT id, code, symbol, name FROM public.unit WHERE id = :id"),
        {"id": _UNIT_ID},
    ).one_or_none()
    if unit is None or tuple(unit) != _UNIT_ROW:
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.unit WHERE name = :name",
            {"name": _UNIT_ROW[3]},
        )
        != 1
    ):
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
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.quantity_unit "
            "WHERE (quantity_id = ANY(CAST(:quantity_ids AS uuid[])) OR unit_id = :unit_id) "
            "AND NOT (quantity_id = ANY(CAST(:quantity_ids AS uuid[])) AND unit_id = :unit_id)",
            {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
        )
        != 0
    ):
        _fail()


def _assert_no_runtime_seed_dependencies(connection: Connection) -> None:
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.provider WHERE code = :provider_code",
            {"provider_code": _SCOPED_PROVIDER_CODE},
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.dataset "
            "WHERE code = :dataset_code AND release_version = :release_version",
            {"dataset_code": _SCOPED_DATASET_CODE, "release_version": _SCOPED_DATASET_RELEASE},
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.source_record "
            "WHERE canonical_entity_id = ANY(CAST(:entity_ids AS uuid[]))",
            {"entity_ids": list(_ENTITY_IDS)},
        )
        != 0
    ):
        _fail()

    dependent_measurements = (
        "entity_id = ANY(CAST(:entity_ids AS uuid[])) "
        "OR quantity_id = ANY(CAST(:quantity_ids AS uuid[])) "
        "OR unit_id = :unit_id "
        "OR (quantity_id = ANY(CAST(:quantity_ids AS uuid[])) AND unit_id = :unit_id)"
    )
    dependency_parameters = {
        "entity_ids": list(_ENTITY_IDS),
        "quantity_ids": list(_QUANTITY_IDS),
        "unit_id": _UNIT_ID,
    }
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.measurement WHERE " + dependent_measurements,
            dependency_parameters,
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.canonical_measurement "
            "WHERE entity_id = ANY(CAST(:entity_ids AS uuid[])) "
            "OR quantity_id = ANY(CAST(:quantity_ids AS uuid[])) "
            "OR measurement_id IN (SELECT id FROM public.measurement WHERE "
            + dependent_measurements
            + ")",
            dependency_parameters,
        )
        != 0
    ):
        _fail()
    if (
        _count(
            connection,
            "SELECT count(*) FROM public.ingestion_conflict AS conflict "
            "WHERE conflict.provider_id IN ("
            "SELECT id FROM public.provider WHERE code = :provider_code"
            ") OR conflict.dataset_id IN ("
            "SELECT id FROM public.dataset "
            "WHERE code = :dataset_code AND release_version = :release_version"
            ") OR conflict.source_record_id IN ("
            "SELECT source.id FROM public.source_record AS source "
            "WHERE source.canonical_entity_id = ANY(CAST(:entity_ids AS uuid[])) "
            "OR source.id IN (SELECT source_record_id FROM public.measurement WHERE "
            + dependent_measurements
            + ") "
            "OR source.provider_id IN ("
            "SELECT id FROM public.provider WHERE code = :provider_code"
            ") OR source.dataset_id IN ("
            "SELECT id FROM public.dataset "
            "WHERE code = :dataset_code AND release_version = :release_version"
            ")"
            ") OR conflict.measurement_id IN ("
            "SELECT id FROM public.measurement WHERE " + dependent_measurements + ")",
            {
                **dependency_parameters,
                "provider_code": _SCOPED_PROVIDER_CODE,
                "dataset_code": _SCOPED_DATASET_CODE,
                "release_version": _SCOPED_DATASET_RELEASE,
            },
        )
        != 0
    ):
        _fail()


def _delete_exact(
    connection: Connection,
    statement: str,
    parameters: dict[str, object],
    count: int,
) -> None:
    result = connection.execute(sa.text(statement), parameters)
    if result.rowcount != count:
        _fail()


def upgrade() -> None:
    """Insert only the reviewed Gaia DR3 entities and magnitude vocabulary."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    _assert_migration_actor(connection)
    _assert_revision(connection, down_revision)
    _lock_tables(connection, _UPGRADE_LOCK_TABLES)
    _assert_no_target_collisions(connection)

    _insert_rows(
        connection,
        table="entity",
        columns=("id", "entity_type", "canonical_name"),
        rows=_ENTITY_ROWS,
        returning_column="id",
        expected_ids=_ENTITY_IDS,
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
        table="unit",
        columns=("id", "code", "symbol", "name"),
        rows=(_UNIT_ROW,),
        returning_column="id",
        expected_ids=(_UNIT_ID,),
    )
    _insert_rows(
        connection,
        table="quantity_unit",
        columns=("quantity_id", "unit_id"),
        rows=_QUANTITY_UNIT_ROWS,
        returning_column="quantity_id",
        expected_ids=_QUANTITY_IDS,
    )
    _assert_exact_seed_rows(connection)


def downgrade() -> None:
    """Remove only an untouched seed closure; runtime catalogue state blocks reversal."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    _assert_migration_actor(connection)
    _assert_revision(connection, revision)
    _lock_tables(connection, _DOWNGRADE_LOCK_TABLES)
    _assert_exact_seed_rows(connection)
    _assert_no_runtime_seed_dependencies(connection)

    _delete_exact(
        connection,
        "DELETE FROM public.quantity_unit "
        "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) AND unit_id = :unit_id",
        {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ID},
        len(_QUANTITY_UNIT_ROWS),
    )
    _delete_exact(
        connection,
        "DELETE FROM public.unit WHERE id = :unit_id",
        {"unit_id": _UNIT_ID},
        1,
    )
    _delete_exact(
        connection,
        "DELETE FROM public.quantity WHERE id = ANY(CAST(:quantity_ids AS uuid[]))",
        {"quantity_ids": list(_QUANTITY_IDS)},
        len(_QUANTITY_ROWS),
    )
    _delete_exact(
        connection,
        "DELETE FROM public.entity WHERE id = ANY(CAST(:entity_ids AS uuid[]))",
        {"entity_ids": list(_ENTITY_IDS)},
        len(_ENTITY_ROWS),
    )
