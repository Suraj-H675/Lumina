"""Correct four Messier entity types to reviewed observing-target semantics.

The v1 SIMBAD-derived types remain historical provider evidence.  This forward
revision changes only the canonical Lumina target type for the four reviewed
semantic mismatches; it does not rewrite source records or measurements.
"""

from __future__ import annotations

from typing import Final, NoReturn
from uuid import UUID

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "b8e5f1a2c3d4"
down_revision = "a7d4e9f2c1b3"
branch_labels = None
depends_on = None

_SAFE_ERROR: Final = "Messier target-semantics migration precondition failed."
_ENTITY_ROWS: Final = (
    (UUID("3756292d-4401-5694-9797-7c7580513eef"), "messier-8", "Messier 8"),
    (UUID("84914de9-cf72-51eb-8091-975f1fbf36b4"), "messier-16", "Messier 16"),
    (UUID("c0c41784-25dd-5b8b-9c4d-b8154a806849"), "messier-17", "Messier 17"),
    (UUID("bdb1bf88-5e7b-5083-8733-ca853e664ec3"), "messier-20", "Messier 20"),
)
_OLD_TYPE = "cluster"
_NEW_TYPE = "nebula"
_LOCK_TABLES: Final = (
    "entity",
    "entity_alias_evidence",
    "ingestion_conflict",
    "canonical_measurement",
    "measurement",
    "source_record",
)


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _connection() -> Connection:
    if context.is_offline_mode():
        _fail()
    return op.get_bind()


def _identity() -> MigrationIdentity:
    configured = context.get_context().config.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _assert_actor(connection: Connection) -> None:
    identity = _identity()
    current, session = connection.execute(sa.text("SELECT current_user, session_user")).one()
    if current != identity.migration_role or session != identity.migration_role:
        _fail()


def _assert_revision(connection: Connection, expected: str) -> None:
    if (
        connection.execute(
            sa.text("SELECT version_num FROM public.alembic_version")
        ).scalar_one_or_none()
        != expected
    ):
        _fail()


def _lock_tables(connection: Connection) -> None:
    for table in _LOCK_TABLES:
        connection.exec_driver_sql(f'LOCK TABLE public."{table}" IN SHARE ROW EXCLUSIVE MODE')


def _entity_state(connection: Connection) -> set[tuple[UUID, str, str, str]]:
    rows = connection.execute(
        sa.text(
            "SELECT id, entity_type, canonical_name, slug FROM public.entity "
            "WHERE slug IN ('messier-8', 'messier-16', 'messier-17', 'messier-20')"
        )
    ).all()
    return {tuple(row) for row in rows}


def _expected_state(entity_type: str) -> set[tuple[UUID, str, str, str]]:
    return {(entity_id, entity_type, name, slug) for entity_id, slug, name in _ENTITY_ROWS}


def _assert_state(connection: Connection, entity_type: str) -> None:
    if _entity_state(connection) != _expected_state(entity_type):
        _fail()


def _assert_no_runtime_dependencies(connection: Connection) -> None:
    ids = [entity_id for entity_id, _, _ in _ENTITY_ROWS]
    checks = (
        "SELECT count(*) FROM public.source_record WHERE canonical_entity_id = ANY(:ids)",
        "SELECT count(*) FROM public.measurement WHERE entity_id = ANY(:ids)",
        "SELECT count(*) FROM public.canonical_measurement WHERE entity_id = ANY(:ids)",
        "SELECT count(*) FROM public.entity_alias_evidence WHERE entity_id = ANY(:ids)",
    )
    if any(connection.execute(sa.text(query), {"ids": ids}).scalar_one() != 0 for query in checks):
        _fail()


def _assert_no_v2_state(connection: Connection) -> None:
    count = connection.execute(
        sa.text(
            "SELECT count(*) FROM public.dataset AS dataset "
            "JOIN public.provider AS provider ON provider.id = dataset.provider_id "
            "WHERE provider.code = 'cds-simbad' AND dataset.code = 'messier-j2000' "
            "AND dataset.release_version = 'v2'"
        )
    ).scalar_one()
    if count != 0:
        _fail()


def upgrade() -> None:
    connection = _connection()
    _assert_actor(connection)
    _assert_revision(connection, down_revision)
    _lock_tables(connection)
    _assert_state(connection, _OLD_TYPE)
    for entity_id, _, _ in _ENTITY_ROWS:
        result = connection.execute(
            sa.text(
                "UPDATE public.entity SET entity_type = :new_type "
                "WHERE id = :id AND entity_type = :old_type"
            ),
            {"id": entity_id, "old_type": _OLD_TYPE, "new_type": _NEW_TYPE},
        )
        if result.rowcount != 1:
            _fail()
    _assert_state(connection, _NEW_TYPE)


def downgrade() -> None:
    connection = _connection()
    _assert_actor(connection)
    _assert_revision(connection, revision)
    _lock_tables(connection)
    _assert_state(connection, _NEW_TYPE)
    _assert_no_runtime_dependencies(connection)
    _assert_no_v2_state(connection)
    for entity_id, _, _ in _ENTITY_ROWS:
        result = connection.execute(
            sa.text(
                "UPDATE public.entity SET entity_type = :old_type "
                "WHERE id = :id AND entity_type = :new_type"
            ),
            {"id": entity_id, "old_type": _OLD_TYPE, "new_type": _NEW_TYPE},
        )
        if result.rowcount != 1:
            _fail()
    _assert_state(connection, _OLD_TYPE)
