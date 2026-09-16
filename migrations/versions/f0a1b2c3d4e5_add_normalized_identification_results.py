from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "f0a1b2c3d4e5"
down_revision = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None

_REMOTE: Final = "identification_remote_solve"
_SOLUTION: Final = "identification_solution"
_ANNOTATION: Final = "identification_annotation"
_REMOTE_JOB_UNIQUE: Final = "uq_identification_remote_solve_submission_job"
_SAFE_ERROR: Final = "Identification result migration precondition failed."
_SOLUTION_INSERT_COLUMNS: Final = (
    "submission_id",
    "external_job_id",
    "provider",
    "coordinate_frame",
    "center_ra_deg",
    "center_dec_deg",
    "orientation_deg",
    "parity",
    "pixel_scale_arcsec_per_pixel",
    "radius_deg",
    "image_width",
    "image_height",
    "wcs_header",
    "wcs_source_sha256",
    "solver_name",
    "solver_version",
)
_ANNOTATION_INSERT_COLUMNS: Final = (
    "submission_id",
    "ordinal",
    "category",
    "names",
    "pixel_x",
    "pixel_y",
    "ra_deg",
    "dec_deg",
)


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _connection() -> Connection:
    if context.is_offline_mode():
        _fail()
    return op.get_bind()


def _identity() -> MigrationIdentity:
    configuration = context.get_context().config
    if configuration is None:
        _fail()
    configured = configuration.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _assert_actor(connection: Connection, identity: MigrationIdentity) -> None:
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
        sa.text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()
    if actual != expected:
        _fail()


def _assert_tables(connection: Connection, *, present: bool) -> None:
    expected = (_SOLUTION, _ANNOTATION) if present else ()
    actual = tuple(
        table
        for table in (_SOLUTION, _ANNOTATION)
        if connection.execute(
            sa.text("SELECT to_regclass(:name)"), {"name": f"public.{table}"}
        ).scalar_one_or_none()
        is not None
    )
    if actual != expected:
        _fail()


def _assert_remote_unique(connection: Connection, *, present: bool) -> None:
    exists = (
        connection.execute(
            sa.text(
                "SELECT 1 FROM pg_constraint WHERE "
                "conrelid = 'public.identification_remote_solve'::regclass AND conname = :name"
            ),
            {"name": _REMOTE_JOB_UNIQUE},
        ).scalar_one_or_none()
        is not None
    )
    if exists is not present:
        _fail()


def _assert_owner(connection: Connection, identity: MigrationIdentity, table: str) -> None:
    owner = connection.execute(
        sa.text(
            "SELECT pg_get_userbyid(rel.relowner) FROM pg_class AS rel "
            "JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace "
            "WHERE ns.nspname = 'public' AND rel.relname = :table AND rel.relkind = 'r'"
        ),
        {"table": table},
    ).scalar_one_or_none()
    if owner != identity.migration_role:
        _fail()


def _columns(connection: Connection, table: str) -> tuple[str, ...]:
    return tuple(
        str(value)
        for value in connection.execute(
            sa.text(
                "SELECT attname FROM pg_attribute WHERE attrelid = CAST(:table AS regclass) "
                "AND attnum > 0 AND NOT attisdropped ORDER BY attnum"
            ),
            {"table": f"public.{table}"},
        ).scalars()
    )


def _grant_runtime(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    role = preparer.quote(identity.runtime_role)
    solution = preparer.quote(_SOLUTION)
    annotation = preparer.quote(_ANNOTATION)
    solution_insert = ", ".join(preparer.quote(column) for column in _SOLUTION_INSERT_COLUMNS)
    annotation_insert = ", ".join(preparer.quote(column) for column in _ANNOTATION_INSERT_COLUMNS)
    for table in (solution, annotation):
        connection.exec_driver_sql(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM PUBLIC")
        connection.exec_driver_sql(f"REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM {role}")
        connection.exec_driver_sql(f"GRANT SELECT ON TABLE public.{table} TO {role}")
    connection.exec_driver_sql(
        f"GRANT INSERT ({solution_insert}) ON TABLE public.{solution} TO {role}"
    )
    connection.exec_driver_sql(f"GRANT DELETE ON TABLE public.{solution} TO {role}")
    connection.exec_driver_sql(
        f"GRANT INSERT ({annotation_insert}) ON TABLE public.{annotation} TO {role}"
    )


def _assert_runtime_acl(connection: Connection, identity: MigrationIdentity) -> None:
    expected = {
        _SOLUTION: {
            (None, "SELECT"),
            (None, "DELETE"),
            *((column, "SELECT") for column in _columns(connection, _SOLUTION)),
            *((column, "INSERT") for column in _SOLUTION_INSERT_COLUMNS),
        },
        _ANNOTATION: {
            (None, "SELECT"),
            *((column, "SELECT") for column in _columns(connection, _ANNOTATION)),
            *((column, "INSERT") for column in _ANNOTATION_INSERT_COLUMNS),
        },
    }
    for table, expected_acl in expected.items():
        actual: set[tuple[str | None, str]] = set()
        for privilege in (
            "SELECT",
            "INSERT",
            "UPDATE",
            "DELETE",
            "TRUNCATE",
            "REFERENCES",
            "TRIGGER",
        ):
            if connection.execute(
                sa.text("SELECT has_table_privilege(:role, :table, :privilege)"),
                {"role": identity.runtime_role, "table": f"public.{table}", "privilege": privilege},
            ).scalar_one():
                actual.add((None, privilege))
        for column in _columns(connection, table):
            for privilege in ("SELECT", "INSERT", "UPDATE", "REFERENCES"):
                if connection.execute(
                    sa.text("SELECT has_column_privilege(:role, :table, :column, :privilege)"),
                    {
                        "role": identity.runtime_role,
                        "table": f"public.{table}",
                        "column": column,
                        "privilege": privilege,
                    },
                ).scalar_one():
                    actual.add((column, privilege))
        if actual != expected_acl:
            _fail()


def _revoke_runtime(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    role = preparer.quote(identity.runtime_role)
    for table in (_ANNOTATION, _SOLUTION):
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{preparer.quote(table)} FROM {role}"
        )


def upgrade() -> None:
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_tables(connection, present=False)
    _assert_remote_unique(connection, present=False)

    op.create_unique_constraint(
        _REMOTE_JOB_UNIQUE,
        _REMOTE,
        ["submission_id", "external_job_id"],
    )
    op.create_table(
        _SOLUTION,
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_job_id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("coordinate_frame", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("center_ra_deg", sa.Double(), nullable=False),
        sa.Column("center_dec_deg", sa.Double(), nullable=False),
        sa.Column("orientation_deg", sa.Double(), nullable=False),
        sa.Column("parity", sa.SmallInteger(), nullable=False),
        sa.Column("pixel_scale_arcsec_per_pixel", sa.Double(), nullable=False),
        sa.Column("radius_deg", sa.Double(), nullable=False),
        sa.Column("image_width", sa.Integer(), nullable=False),
        sa.Column("image_height", sa.Integer(), nullable=False),
        sa.Column("wcs_header", sa.Text(), nullable=False),
        sa.Column("wcs_source_sha256", sa.String(length=64, collation="C"), nullable=False),
        sa.Column("solver_name", sa.String(length=64, collation="C"), nullable=False),
        sa.Column("solver_version", sa.String(length=64, collation="C"), nullable=True),
        sa.Column(
            "stored_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("submission_id", name="pk_identification_solution"),
        sa.ForeignKeyConstraint(
            ["submission_id", "external_job_id"],
            [
                "public.identification_remote_solve.submission_id",
                "public.identification_remote_solve.external_job_id",
            ],
            name="fk_identification_solution_remote_job",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint("provider = 'nova'", name="ck_identification_solution_provider"),
        sa.CheckConstraint(
            "coordinate_frame IN ('icrs', 'fk5_j2000')",
            name="ck_identification_solution_coordinate_frame",
        ),
        sa.CheckConstraint(
            "center_ra_deg >= 0 AND center_ra_deg < 360",
            name="ck_identification_solution_ra",
        ),
        sa.CheckConstraint(
            "center_dec_deg >= -90 AND center_dec_deg <= 90",
            name="ck_identification_solution_dec",
        ),
        sa.CheckConstraint(
            "orientation_deg >= 0 AND orientation_deg < 360",
            name="ck_identification_solution_orientation",
        ),
        sa.CheckConstraint("parity IN (-1, 1)", name="ck_identification_solution_parity"),
        sa.CheckConstraint(
            "pixel_scale_arcsec_per_pixel > 0 AND pixel_scale_arcsec_per_pixel <= 36000",
            name="ck_identification_solution_pixel_scale",
        ),
        sa.CheckConstraint(
            "radius_deg > 0 AND radius_deg <= 180",
            name="ck_identification_solution_radius",
        ),
        sa.CheckConstraint(
            "image_width BETWEEN 1 AND 100000 AND image_height BETWEEN 1 AND 100000",
            name="ck_identification_solution_dimensions",
        ),
        sa.CheckConstraint(
            "octet_length(wcs_header) BETWEEN 1 AND 65536",
            name="ck_identification_solution_wcs_size",
        ),
        sa.CheckConstraint(
            "wcs_source_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_identification_solution_wcs_sha256",
        ),
        sa.CheckConstraint(
            "solver_name = 'astrometry.net-nova'",
            name="ck_identification_solution_solver_name",
        ),
    )
    op.create_table(
        _ANNOTATION,
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("names", postgresql.ARRAY(sa.String(length=128)), nullable=False),
        sa.Column("pixel_x", sa.Double(), nullable=False),
        sa.Column("pixel_y", sa.Double(), nullable=False),
        sa.Column("ra_deg", sa.Double(), nullable=False),
        sa.Column("dec_deg", sa.Double(), nullable=False),
        sa.PrimaryKeyConstraint("submission_id", "ordinal", name="pk_identification_annotation"),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            ["public.identification_solution.submission_id"],
            name="fk_identification_annotation_solution",
            onupdate="RESTRICT",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "ordinal BETWEEN 0 AND 2047", name="ck_identification_annotation_ordinal"
        ),
        sa.CheckConstraint(
            "category ~ '^[a-z0-9_.-]{1,32}$'", name="ck_identification_annotation_category"
        ),
        sa.CheckConstraint(
            "cardinality(names) BETWEEN 1 AND 16 AND array_position(names, NULL) IS NULL",
            name="ck_identification_annotation_names",
        ),
        sa.CheckConstraint(
            "pixel_x >= 0 AND pixel_y >= 0", name="ck_identification_annotation_pixel"
        ),
        sa.CheckConstraint("ra_deg >= 0 AND ra_deg < 360", name="ck_identification_annotation_ra"),
        sa.CheckConstraint(
            "dec_deg >= -90 AND dec_deg <= 90", name="ck_identification_annotation_dec"
        ),
    )

    _grant_runtime(connection, identity)
    _assert_remote_unique(connection, present=True)
    _assert_tables(connection, present=True)
    for table in (_SOLUTION, _ANNOTATION):
        _assert_owner(connection, identity, table)
    _assert_runtime_acl(connection, identity)


def downgrade() -> None:
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, revision)
    _assert_remote_unique(connection, present=True)
    _assert_tables(connection, present=True)
    for table in (_SOLUTION, _ANNOTATION):
        _assert_owner(connection, identity, table)
    _assert_runtime_acl(connection, identity)
    if connection.execute(sa.text(f"SELECT count(*) FROM public.{_ANNOTATION}")).scalar_one() != 0:
        _fail()
    if connection.execute(sa.text(f"SELECT count(*) FROM public.{_SOLUTION}")).scalar_one() != 0:
        _fail()

    _revoke_runtime(connection, identity)
    op.drop_table(_ANNOTATION)
    op.drop_table(_SOLUTION)
    op.drop_constraint(_REMOTE_JOB_UNIQUE, _REMOTE, type_="unique")
    _assert_tables(connection, present=False)
    _assert_remote_unique(connection, present=False)
