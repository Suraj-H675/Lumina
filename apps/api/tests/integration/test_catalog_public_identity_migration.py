"""Phase 1B1 public identity and alias-evidence contracts on guarded PostgreSQL."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from uuid import UUID

import pytest
from alembic.script import ScriptDirectory
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.exc import DataError, IntegrityError, ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    historical_migration_identity,
    historical_runtime_url,
    historical_sync_url,
    migration_config,
    normalize_historical_database_to_b2,
    read_historical_revision,
    run_alembic,
    run_migration_operation,
)

_PARENT_REVISION = "c4b9e2d7a6f1"
_REVISION = "b7f3a2c81d4e"
_HISTORICAL_B2 = _REVISION
_SAFE_ERROR = "Phase 1B1 public identity migration precondition failed."
_PROTECTED_HASHES = {
    "0001_create_job.py": "d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b",
    "0002_grant_job_runtime_dml.py": (
        "8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889"
    ),
    "d502b5935120_create_catalog_identity_provenance.py": (
        "f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b"
    ),
    "e4c9f1a7b362_add_measurement_provenance.py": (
        "336a59a593c1f1d5fcfd4b32c3b8405bb290b1f13c9a6fee094e8170249c8c2d"
    ),
    "a1a3c0f17c5e_add_deterministic_catalog_ingestion.py": (
        "26b5dad738a93d9776a62155c638402319b35365896ab515cb018413274cfda5"
    ),
    "c4b9e2d7a6f1_seed_gaia_dr3_slice.py": (
        "ae89acabb3e241e49d6874a429ca2de0319aaa25ed5e2ba1185866df6cbfdf7a"
    ),
}

_ENTITY_ROWS = (
    (UUID("26f4b667-ecd9-524d-8121-29508723715a"), "star", "HD 209458", "hd-209458"),
    (UUID("bbfe8678-81ca-5e70-ac95-c597d7655540"), "star", "Kepler-186", "kepler-186"),
    (UUID("bfd42670-3013-598e-8eb5-5a1c084dd1a0"), "star", "Kepler-452", "kepler-452"),
    (UUID("c593bd18-c4bc-5551-8a41-09f1b501f981"), "star", "51 Pegasi", "51-pegasi"),
    (UUID("403d0e71-8d81-5c52-abad-c4666c1b5cd6"), "star", "K2-18", "k2-18"),
)
_ENTITY_IDS = tuple(row[0] for row in _ENTITY_ROWS)

_FIXTURE_PROVIDER_ID = UUID("91000000-0000-4000-8000-000000000001")
_FIXTURE_DATASET_ID = UUID("92000000-0000-4000-8000-000000000001")
_FIXTURE_ENTITY_A = UUID("93000000-0000-4000-8000-000000000001")
_FIXTURE_ENTITY_B = UUID("93000000-0000-4000-8000-000000000002")
_FIXTURE_SOURCE_A = UUID("94000000-0000-4000-8000-000000000001")
_FIXTURE_SOURCE_B = UUID("94000000-0000-4000-8000-000000000002")
_FIXTURE_SOURCE_OTHER = UUID("94000000-0000-4000-8000-000000000003")
_FIXTURE_SOURCE_UNRESOLVED = UUID("94000000-0000-4000-8000-000000000004")
_FIXTURE_ALIAS = UUID("95000000-0000-4000-8000-000000000001")
_FIXTURE_ALIAS_OTHER = UUID("95000000-0000-4000-8000-000000000002")
_FIXTURE_ALIAS_CURIATED = UUID("95000000-0000-4000-8000-000000000003")
_FETCHED_AT = datetime(2026, 8, 20, 12, tzinfo=UTC)

_TABLES = {
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
    "job",
    "entity_alias",
    "entity_alias_evidence",
    "alembic_version",
}
_ENTITY_SLUG_CONSTRAINT_DEFINITIONS = {
    "ck_entity_slug_format": (
        "CHECK (char_length(slug) >= 1 AND char_length(slug) <= 100 "
        "AND (slug COLLATE \"C\") ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)"
    ),
    "uq_entity_slug": "UNIQUE (slug)",
}
_ALIAS_CONSTRAINT_DEFINITIONS = {
    "pk_entity_alias": "PRIMARY KEY (id)",
    "fk_entity_alias_entity": (
        "FOREIGN KEY (entity_id) REFERENCES entity(id) ON UPDATE RESTRICT ON DELETE RESTRICT"
    ),
    "uq_entity_alias_normalized_entity": "UNIQUE (normalized_alias, entity_id)",
    "uq_entity_alias_id_entity_id": "UNIQUE (id, entity_id)",
    "ck_entity_alias_alias": (
        "CHECK (char_length(alias) >= 1 AND char_length(alias) <= 255 "
        "AND alias = btrim(alias, ((((' '::text || chr(9)) || chr(10)) || chr(11)) "
        "|| chr(12)) || chr(13)) AND (alias COLLATE \"C\") !~ '[[:cntrl:]]'::text)"
    ),
    "ck_entity_alias_normalized_alias": (
        "CHECK (char_length(normalized_alias) >= 1 "
        "AND char_length(normalized_alias) <= 255 "
        "AND normalized_alias = btrim(normalized_alias, ' '::text) "
        "AND strpos(normalized_alias, '  '::text) = 0 "
        "AND (normalized_alias COLLATE \"C\") !~ '[[:cntrl:]]'::text)"
    ),
    "ck_entity_alias_normalization_version": "CHECK (normalization_version = 1)",
    "ck_entity_alias_type": (
        "CHECK (char_length(alias_type::text) >= 1 "
        "AND char_length(alias_type::text) <= 32 "
        "AND (alias_type::text COLLATE \"C\") ~ '^[a-z][a-z0-9_]{0,31}$'::text)"
    ),
    "ck_entity_alias_catalog_name": (
        "CHECK (catalog_name IS NULL OR char_length(catalog_name::text) >= 1 "
        "AND char_length(catalog_name::text) <= 128 "
        'AND (catalog_name::text COLLATE "C") '
        "~ '^[a-z0-9][a-z0-9_.-]{0,127}$'::text)"
    ),
    "ck_entity_alias_language": (
        "CHECK (language IS NULL OR char_length(language::text) >= 2 "
        "AND char_length(language::text) <= 35 "
        'AND (language::text COLLATE "C") '
        "~ '^[a-z]{2,8}(-[a-z0-9]{1,8})*$'::text)"
    ),
}
_EVIDENCE_CONSTRAINT_DEFINITIONS = {
    "pk_entity_alias_evidence": "PRIMARY KEY (alias_id, source_record_id)",
    "fk_entity_alias_evidence_alias_entity": (
        "FOREIGN KEY (alias_id, entity_id) REFERENCES entity_alias(id, entity_id) "
        "ON UPDATE RESTRICT ON DELETE RESTRICT"
    ),
    "fk_entity_alias_evidence_source_record_entity": (
        "FOREIGN KEY (source_record_id, entity_id) "
        "REFERENCES source_record(id, canonical_entity_id) "
        "ON UPDATE RESTRICT ON DELETE RESTRICT"
    ),
}
_IDENTITY_CONSTRAINT_NAMES = {
    "entity_alias": frozenset(_ALIAS_CONSTRAINT_DEFINITIONS),
    "entity_alias_evidence": frozenset(_EVIDENCE_CONSTRAINT_DEFINITIONS),
}


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return historical_sync_url(settings)


def _runtime_url(settings: IntegrationTestSettings) -> URL:
    return historical_runtime_url(settings).set(drivername="postgresql+psycopg")


def _revision(connection: Connection) -> str | None:
    return connection.execute(
        text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()


def _query(
    settings: IntegrationTestSettings, statement: str, **parameters: object
) -> list[tuple[object, ...]]:
    return list(
        run_migration_operation(
            historical_sync_url(settings),
            lambda connection: [
                tuple(row) for row in connection.execute(text(statement), parameters)
            ],
        )
    )


def _execute(settings: IntegrationTestSettings, statement: str, **parameters: object) -> None:
    def operation(connection: Connection) -> None:
        with connection.begin():
            connection.execute(text(statement), parameters)

    run_migration_operation(historical_sync_url(settings), operation)


def _run_historical_downgrade(
    settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    revision: str = _PARENT_REVISION,
) -> None:
    normalize_historical_database_to_b2(settings)
    if read_historical_revision(settings) != _HISTORICAL_B2:
        pytest.fail("History database did not normalize to accepted B2.")
    identity = historical_migration_identity(settings)
    run_migration_operation(
        historical_sync_url(settings),
        lambda connection: run_alembic(connection, identity, revision, downgrade=True),
    )


def _run_upgrade(settings: IntegrationTestSettings, revision: str = _REVISION) -> None:
    identity = historical_migration_identity(settings)
    run_migration_operation(
        historical_sync_url(settings),
        lambda connection: run_alembic(connection, identity, revision, downgrade=False),
    )


def _expect_integrity_error(connection: Connection, statement: str, **parameters: object) -> None:
    with pytest.raises((DataError, IntegrityError)), connection.begin_nested():
        connection.execute(text(statement), parameters)


def _insert_fixture_graph(connection: Connection) -> None:
    connection.execute(
        text(
            "INSERT INTO public.provider "
            "(id, code, name, documentation_url, terms_url, attribution_text) "
            "VALUES (:id, 'fixture.public-identity', 'Fixture Public Identity Provider', "
            "'https://fixtures.invalid/public-identity/provider', "
            "'https://fixtures.invalid/public-identity/terms', "
            "'Fictional test-only provider attribution.')"
        ),
        {"id": _FIXTURE_PROVIDER_ID},
    )
    connection.execute(
        text(
            "INSERT INTO public.entity (id, entity_type, canonical_name, slug) "
            "VALUES (:entity_a, 'star', 'Fixture Public Identity A', 'fixture-public-identity-a'), "
            "(:entity_b, 'star', 'Fixture Public Identity B', 'fixture-public-identity-b')"
        ),
        {"entity_a": _FIXTURE_ENTITY_A, "entity_b": _FIXTURE_ENTITY_B},
    )
    connection.execute(
        text(
            "INSERT INTO public.dataset "
            "(id, provider_id, code, name, release_version, source_url, licence, citation) "
            "VALUES (:id, :provider_id, 'fixture-public-identity', "
            "'Fixture Public Identity Dataset', "
            "'fixture-v1', 'https://fixtures.invalid/public-identity/dataset', "
            "'Fictional test-only licence', 'Fictional test-only citation')"
        ),
        {"id": _FIXTURE_DATASET_ID, "provider_id": _FIXTURE_PROVIDER_ID},
    )
    connection.execute(
        text(
            "INSERT INTO public.source_record "
            "(id, provider_id, dataset_id, provider_record_id, provider_version, "
            "canonical_entity_id, source_url, fetched_at, adapter_id, adapter_version, "
            "parser_version, normalized_content_sha256) "
            "VALUES "
            "(:source_a, :provider_id, :dataset_id, 'fixture-record-a', 'fixture-v1', "
            ":entity_a, 'https://fixtures.invalid/public-identity/source-a', :fetched_at, "
            "'fixture.public-identity', 'fixture-adapter-v1', 'fixture-parser-v1', :checksum_a), "
            "(:source_b, :provider_id, :dataset_id, 'fixture-record-b', 'fixture-v1', "
            ":entity_a, 'https://fixtures.invalid/public-identity/source-b', :fetched_at, "
            "'fixture.public-identity', 'fixture-adapter-v1', 'fixture-parser-v1', :checksum_b), "
            "(:source_other, :provider_id, :dataset_id, 'fixture-record-other', 'fixture-v1', "
            ":entity_b, 'https://fixtures.invalid/public-identity/source-other', :fetched_at, "
            "'fixture.public-identity', 'fixture-adapter-v1', 'fixture-parser-v1', "
            ":checksum_other), "
            "(:source_unresolved, :provider_id, :dataset_id, "
            "'fixture-record-unresolved', 'fixture-v1', "
            "NULL, 'https://fixtures.invalid/public-identity/source-unresolved', :fetched_at, "
            "'fixture.public-identity', 'fixture-adapter-v1', 'fixture-parser-v1', "
            ":checksum_unresolved)"
        ),
        {
            "source_a": _FIXTURE_SOURCE_A,
            "source_b": _FIXTURE_SOURCE_B,
            "source_other": _FIXTURE_SOURCE_OTHER,
            "source_unresolved": _FIXTURE_SOURCE_UNRESOLVED,
            "provider_id": _FIXTURE_PROVIDER_ID,
            "dataset_id": _FIXTURE_DATASET_ID,
            "entity_a": _FIXTURE_ENTITY_A,
            "entity_b": _FIXTURE_ENTITY_B,
            "fetched_at": _FETCHED_AT,
            "checksum_a": "a" * 64,
            "checksum_b": "b" * 64,
            "checksum_other": "c" * 64,
            "checksum_unresolved": "d" * 64,
        },
    )


def _with_fixture_graph(
    settings: IntegrationTestSettings,
    operation: Callable[[Connection], None],
) -> None:
    def run(connection: Connection) -> None:
        transaction = connection.begin()
        try:
            _insert_fixture_graph(connection)
            operation(connection)
        finally:
            transaction.rollback()

    run_migration_operation(historical_sync_url(settings), run)


def test_lineage_and_protected_history_are_exact() -> None:
    script = ScriptDirectory.from_config(migration_config())
    assert script.get_heads() == ["f2a6c8d9e0b1"]
    assert script.get_revision(_REVISION).down_revision == _PARENT_REVISION
    root = Path(__file__).resolve().parents[4] / "migrations" / "versions"
    assert {
        name: sha256((root / name).read_bytes()).hexdigest() for name in _PROTECTED_HASHES
    } == _PROTECTED_HASHES


def test_source_record_candidate_key_is_exact_at_current_head(
    integration_settings: IntegrationTestSettings,
) -> None:
    rows = _query(
        integration_settings,
        "SELECT pg_get_constraintdef(constraint_data.oid, true) "
        "FROM pg_constraint AS constraint_data "
        "WHERE constraint_data.conrelid = 'public.source_record'::regclass "
        "AND constraint_data.conname = 'uq_source_record_id_canonical_entity_id' "
        "AND constraint_data.contype = 'u'",
    )
    assert rows == [("UNIQUE (id, canonical_entity_id)",)]
    assert (
        _query(
            integration_settings,
            "SELECT id, canonical_entity_id FROM public.source_record "
            "GROUP BY id, canonical_entity_id HAVING count(*) > 1",
        )
        == []
    )


def test_public_identity_schema_and_constraints_are_exact(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    def assert_schema(connection: Connection) -> None:
        assert _revision(connection) == _REVISION
        tables = set(
            connection.execute(
                text(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
                )
            ).scalars()
        )
        assert tables == _TABLES

        columns = {
            table: [
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT attribute.attname, "
                        "format_type(attribute.atttypid, attribute.atttypmod), "
                        "NOT attribute.attnotnull, COALESCE(pg_get_expr(default_value.adbin, "
                        "default_value.adrelid), '<none>'), "
                        "COALESCE(collation_data.collname, '<none>') "
                        "FROM pg_attribute AS attribute "
                        "LEFT JOIN pg_attrdef AS default_value "
                        "ON default_value.adrelid = attribute.attrelid "
                        "AND default_value.adnum = attribute.attnum "
                        "LEFT JOIN pg_collation AS collation_data "
                        "ON collation_data.oid = attribute.attcollation "
                        "WHERE attribute.attrelid = to_regclass('public.' || :table) "
                        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                        "ORDER BY attribute.attnum"
                    ),
                    {"table": table},
                )
            ]
            for table in ("entity", "entity_alias", "entity_alias_evidence")
        }
        assert columns == {
            "entity": [
                ("id", "uuid", False, "<none>", "<none>"),
                ("entity_type", "character varying(32)", False, "<none>", "default"),
                ("canonical_name", "text", False, "<none>", "default"),
                ("created_at", "timestamp with time zone", False, "CURRENT_TIMESTAMP", "<none>"),
                ("slug", "text", False, "<none>", "C"),
            ],
            "entity_alias": [
                ("id", "uuid", False, "<none>", "<none>"),
                ("entity_id", "uuid", False, "<none>", "<none>"),
                ("alias", "text", False, "<none>", "default"),
                ("normalized_alias", "text", False, "<none>", "C"),
                ("normalization_version", "smallint", False, "<none>", "<none>"),
                ("alias_type", "character varying(32)", False, "<none>", "C"),
                ("catalog_name", "character varying(128)", True, "<none>", "C"),
                ("language", "character varying(35)", True, "<none>", "C"),
            ],
            "entity_alias_evidence": [
                ("alias_id", "uuid", False, "<none>", "<none>"),
                ("entity_id", "uuid", False, "<none>", "<none>"),
                ("source_record_id", "uuid", False, "<none>", "<none>"),
            ],
        }

        entity_rows = {
            tuple(row)
            for row in connection.execute(
                text("SELECT id, entity_type, canonical_name, slug FROM public.entity ORDER BY id")
            )
        }
        assert entity_rows == set(_ENTITY_ROWS)
        assert (
            connection.execute(text("SELECT count(*) FROM public.entity_alias")).scalar_one() == 0
        )
        assert (
            connection.execute(
                text("SELECT count(*) FROM public.entity_alias_evidence")
            ).scalar_one()
            == 0
        )

        constraints = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT conname, contype, pg_get_constraintdef(oid, true) "
                    "FROM pg_constraint WHERE conrelid IN "
                    "('public.entity'::regclass, 'public.entity_alias'::regclass, "
                    "'public.entity_alias_evidence'::regclass) ORDER BY conrelid::text, conname"
                )
            )
        }
        names = {row[0] for row in constraints}
        expected_names = {
            "pk_entity",
            "ck_entity_type",
            "ck_entity_canonical_name_nonempty",
            "ck_entity_slug_format",
            "uq_entity_slug",
            "pk_entity_alias",
            "fk_entity_alias_entity",
            "uq_entity_alias_normalized_entity",
            "uq_entity_alias_id_entity_id",
            "ck_entity_alias_alias",
            "ck_entity_alias_normalized_alias",
            "ck_entity_alias_normalization_version",
            "ck_entity_alias_type",
            "ck_entity_alias_catalog_name",
            "ck_entity_alias_language",
            "pk_entity_alias_evidence",
            "fk_entity_alias_evidence_alias_entity",
            "fk_entity_alias_evidence_source_record_entity",
        }
        assert expected_names <= names
        for table, expected in _IDENTITY_CONSTRAINT_NAMES.items():
            actual = {
                row[0]
                for row in connection.execute(
                    text(
                        "SELECT conname FROM pg_constraint "
                        "WHERE conrelid = to_regclass('public.' || :table) "
                        "AND contype IN ('p', 'u', 'c', 'f')"
                    ),
                    {"table": table},
                )
            }
            assert actual == set(expected)
        definitions = {row[0]: row[2] for row in constraints}
        expected_definitions = {
            **_ENTITY_SLUG_CONSTRAINT_DEFINITIONS,
            **_ALIAS_CONSTRAINT_DEFINITIONS,
            **_EVIDENCE_CONSTRAINT_DEFINITIONS,
        }
        assert {
            name: definitions.get(name) for name in expected_definitions
        } == expected_definitions
        for name, kind, _definition in constraints:
            if name in expected_definitions:
                assert kind in {"c", "f", "p", "u"}

        assert (
            connection.execute(
                text(
                    "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' "
                    "AND table_name = 'entity_alias' "
                    "AND column_name IN ('source_record_id', 'is_preferred')"
                )
            ).scalar_one()
            == 0
        )
        assert (
            connection.execute(
                text("SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'")
            ).scalar_one()
            == 0
        )
        assert (
            connection.execute(
                text(
                    "SELECT count(*) FROM pg_class AS index_class "
                    "JOIN pg_index AS index_data ON index_data.indexrelid = index_class.oid "
                    "WHERE index_data.indrelid IN ('public.entity'::regclass, "
                    "'public.entity_alias'::regclass, 'public.entity_alias_evidence'::regclass) "
                    "AND pg_get_indexdef(index_data.indexrelid) ILIKE '%trgm%'"
                )
            ).scalar_one()
            == 0
        )

    run_migration_operation(historical_sync_url(integration_settings), assert_schema)


def test_slug_and_alias_predicates_reject_invalid_values_and_preserve_ambiguity(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        _expect_integrity_error(
            connection,
            "INSERT INTO public.entity (id, entity_type, canonical_name, slug) "
            "VALUES (:id, 'star', 'Fixture Invalid Slug', :slug)",
            id=UUID("96000000-0000-4000-8000-000000000001"),
            slug="Not-A-Slug",
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO public.entity (id, entity_type, canonical_name, slug) "
            "VALUES (:id, 'star', 'Fixture Duplicate Slug', 'hd-209458')",
            id=UUID("96000000-0000-4000-8000-000000000002"),
        )
        connection.execute(
            text(
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'V376 Peg', 'v376 peg', 1, 'common')"
            ),
            {"id": _FIXTURE_ALIAS, "entity_id": _FIXTURE_ENTITY_A},
        )
        connection.execute(
            text(
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'V376 Peg', 'v376 peg', 1, 'common')"
            ),
            {"id": _FIXTURE_ALIAS_OTHER, "entity_id": _FIXTURE_ENTITY_B},
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO public.entity_alias "
            "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
            "VALUES (:id, :entity_id, 'V376 Peg duplicate', 'v376 peg', 1, 'common')",
            id=UUID("96000000-0000-4000-8000-000000000003"),
            entity_id=_FIXTURE_ENTITY_A,
        )
        for version in (None, 0, 2):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'Invalid version', 'invalid version', "
                ":version, 'common')",
                id=UUID(f"96000000-0000-4000-8000-{10 + (version or 0):012d}"),
                entity_id=_FIXTURE_ENTITY_A,
                version=version,
            )
        for alias, normalized, alias_type, catalog_name, language in (
            ("", "valid", "common", None, None),
            (" leading", "valid", "common", None, None),
            ("valid", "bad  spaces", "common", None, None),
            ("valid", "valid", "Bad Type", None, None),
            ("valid", "valid", "common", "Bad Catalog", None),
            ("valid", "valid", "common", None, "EN-us"),
        ):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, "
                "alias_type, catalog_name, language) "
                "VALUES (:id, :entity_id, :alias, :normalized, 1, :alias_type, "
                ":catalog_name, :language)",
                id=UUID(f"96000000-0000-0000-0000-{100 + len(alias) + len(normalized):012d}"),
                entity_id=_FIXTURE_ENTITY_A,
                alias=alias,
                normalized=normalized,
                alias_type=alias_type,
                catalog_name=catalog_name,
                language=language,
            )

    _with_fixture_graph(integration_settings, exercise)


def test_identity_check_boundaries_are_enforced(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        def fixture_id(index: int) -> UUID:
            return UUID(f"96000000-0000-0000-0000-{index:012d}")

        def insert_entity(index: int, slug: str) -> None:
            connection.execute(
                text(
                    "INSERT INTO public.entity (id, entity_type, canonical_name, slug) "
                    "VALUES (:id, 'star', :name, :slug)"
                ),
                {
                    "id": fixture_id(index),
                    "name": f"Fixture Boundary Entity {index}",
                    "slug": slug,
                },
            )

        def insert_alias(
            index: int,
            *,
            alias: str,
            normalized: str,
            alias_type: str = "common",
            catalog_name: str | None = None,
            language: str | None = None,
        ) -> None:
            connection.execute(
                text(
                    "INSERT INTO public.entity_alias "
                    "(id, entity_id, alias, normalized_alias, normalization_version, "
                    "alias_type, catalog_name, language) "
                    "VALUES (:id, :entity_id, :alias, :normalized, 1, :alias_type, "
                    ":catalog_name, :language)"
                ),
                {
                    "id": fixture_id(index),
                    "entity_id": _FIXTURE_ENTITY_A,
                    "alias": alias,
                    "normalized": normalized,
                    "alias_type": alias_type,
                    "catalog_name": catalog_name,
                    "language": language,
                },
            )

        insert_entity(1, "x")
        insert_entity(2, "a" * 100)
        for index, slug in enumerate(
            (None, "", "a" * 101, "Not-A-Slug", "-a", "a-", "a--b", "a_b", "a b"),
            10,
        ):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity (id, entity_type, canonical_name, slug) "
                "VALUES (:id, 'star', :name, :slug)",
                id=fixture_id(index),
                name=f"Fixture Invalid Slug {index}",
                slug=slug,
            )

        insert_alias(40, alias="a", normalized="alias-min")
        insert_alias(41, alias="a" * 255, normalized="alias-max")
        insert_alias(42, alias="type-min", normalized="type-min", alias_type="a")
        insert_alias(
            43,
            alias="type-max",
            normalized="type-max",
            alias_type="a" + "b" * 31,
        )
        insert_alias(44, alias="catalog-min", normalized="catalog-min", catalog_name="a")
        insert_alias(
            45,
            alias="catalog-max",
            normalized="catalog-max",
            catalog_name="a" * 128,
        )
        insert_alias(46, alias="language-min", normalized="language-min", language="aa")
        insert_alias(
            47,
            alias="language-max",
            normalized="language-max",
            language="abcdefgh-abcdefgh-abcdefgh-abcdefgh",
        )
        insert_alias(48, alias="null-optional-fields", normalized="null-optional-fields")

        for index, alias in enumerate(
            ("", "a" * 256, " leading", "trailing ", "bad\x01", "bad\n"), 60
        ):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, :alias, :normalized, 1, 'common')",
                id=fixture_id(index),
                entity_id=_FIXTURE_ENTITY_A,
                alias=alias,
                normalized=f"invalid-alias-{index}",
            )
        for index, normalized in enumerate(
            ("", "a" * 256, " leading", "trailing ", "a  b", "bad\x01"), 70
        ):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'valid alias', :normalized, 1, 'common')",
                id=fixture_id(index),
                entity_id=_FIXTURE_ENTITY_A,
                normalized=normalized,
            )
        for index, alias_type in enumerate(("", "a" * 33, "Bad", "a-b"), 80):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'valid alias', :normalized, 1, :alias_type)",
                id=fixture_id(index),
                entity_id=_FIXTURE_ENTITY_A,
                normalized=f"invalid-type-{index}",
                alias_type=alias_type,
            )
        for index, catalog_name in enumerate(("", "a" * 129, "Bad", "-a", "a/a"), 90):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, "
                "alias_type, catalog_name) "
                "VALUES (:id, :entity_id, 'valid alias', :normalized, 1, 'common', :catalog_name)",
                id=fixture_id(index),
                entity_id=_FIXTURE_ENTITY_A,
                normalized=f"invalid-catalog-{index}",
                catalog_name=catalog_name,
            )
        for index, language in enumerate(("", "a", "a" * 36, "EN", "a_b"), 100):
            _expect_integrity_error(
                connection,
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, "
                "alias_type, language) "
                "VALUES (:id, :entity_id, 'valid alias', :normalized, 1, 'common', :language)",
                id=fixture_id(index),
                entity_id=_FIXTURE_ENTITY_A,
                normalized=f"invalid-language-{index}",
                language=language,
            )

    _with_fixture_graph(integration_settings, exercise)


def test_alias_evidence_preserves_multiple_sources_and_rejects_cross_entity_links(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        connection.execute(
            text(
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'V376 Peg', 'v376 peg', 1, 'common')"
            ),
            {"id": _FIXTURE_ALIAS, "entity_id": _FIXTURE_ENTITY_A},
        )
        connection.execute(
            text(
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'Curated Alias', 'curated alias', 1, 'curated')"
            ),
            {"id": _FIXTURE_ALIAS_CURIATED, "entity_id": _FIXTURE_ENTITY_A},
        )
        assert (
            connection.execute(
                text(
                    "SELECT count(*) FROM public.entity_alias_evidence WHERE alias_id = :alias_id"
                ),
                {"alias_id": _FIXTURE_ALIAS_CURIATED},
            ).scalar_one()
            == 0
        )
        connection.execute(
            text(
                "INSERT INTO public.entity_alias_evidence (alias_id, entity_id, source_record_id) "
                "VALUES (:alias_id, :entity_id, :source_record_id)"
            ),
            {
                "alias_id": _FIXTURE_ALIAS,
                "entity_id": _FIXTURE_ENTITY_A,
                "source_record_id": _FIXTURE_SOURCE_A,
            },
        )
        connection.execute(
            text(
                "INSERT INTO public.entity_alias_evidence (alias_id, entity_id, source_record_id) "
                "VALUES (:alias_id, :entity_id, :source_record_id)"
            ),
            {
                "alias_id": _FIXTURE_ALIAS,
                "entity_id": _FIXTURE_ENTITY_A,
                "source_record_id": _FIXTURE_SOURCE_B,
            },
        )
        assert (
            connection.execute(
                text("SELECT count(*) FROM public.entity_alias_evidence WHERE alias_id = :id"),
                {"id": _FIXTURE_ALIAS},
            ).scalar_one()
            == 2
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO public.entity_alias_evidence (alias_id, entity_id, source_record_id) "
            "VALUES (:alias_id, :entity_id, :source_record_id)",
            alias_id=_FIXTURE_ALIAS,
            entity_id=_FIXTURE_ENTITY_A,
            source_record_id=_FIXTURE_SOURCE_A,
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO public.entity_alias_evidence (alias_id, entity_id, source_record_id) "
            "VALUES (:alias_id, :entity_id, :source_record_id)",
            alias_id=_FIXTURE_ALIAS,
            entity_id=_FIXTURE_ENTITY_B,
            source_record_id=_FIXTURE_SOURCE_A,
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO public.entity_alias_evidence (alias_id, entity_id, source_record_id) "
            "VALUES (:alias_id, :entity_id, :source_record_id)",
            alias_id=_FIXTURE_ALIAS,
            entity_id=_FIXTURE_ENTITY_A,
            source_record_id=_FIXTURE_SOURCE_OTHER,
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO public.entity_alias_evidence (alias_id, entity_id, source_record_id) "
            "VALUES (:alias_id, :entity_id, :source_record_id)",
            alias_id=_FIXTURE_ALIAS,
            entity_id=_FIXTURE_ENTITY_A,
            source_record_id=_FIXTURE_SOURCE_UNRESOLVED,
        )
        _expect_integrity_error(
            connection,
            "DELETE FROM public.entity_alias WHERE id = :id",
            id=_FIXTURE_ALIAS,
        )
        _expect_integrity_error(
            connection,
            "DELETE FROM public.source_record WHERE id = :id",
            id=_FIXTURE_SOURCE_A,
        )

    _with_fixture_graph(integration_settings, exercise)


def test_runtime_and_public_receive_no_identity_table_privileges(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    runtime_role = _runtime_url(integration_settings).username
    migration_role = historical_sync_url(integration_settings).username
    assert runtime_role is not None
    assert migration_role is not None
    tables = ["entity_alias", "entity_alias_evidence"]
    table_privileges = [
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "REFERENCES",
        "TRIGGER",
    ]
    column_privileges = ["SELECT", "INSERT", "UPDATE", "REFERENCES"]
    rows = _query(
        integration_settings,
        "SELECT table_name, privilege_type FROM information_schema.role_table_grants "
        "WHERE table_schema = 'public' AND grantee = :role "
        "AND table_name IN ('entity_alias', 'entity_alias_evidence') "
        "ORDER BY table_name, privilege_type",
        role=runtime_role,
    )
    assert rows == []
    assert _query(
        integration_settings,
        "SELECT table_data.relname, pg_get_userbyid(table_data.relowner) "
        "FROM pg_class AS table_data "
        "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
        "WHERE namespace.nspname = 'public' "
        "AND table_data.relname = ANY(CAST(:tables AS text[])) ORDER BY table_data.relname",
        tables=tables,
    ) == [(table, migration_role) for table in tables]
    assert _query(
        integration_settings,
        "SELECT count(*) FROM unnest(CAST(:tables AS text[])) AS tables(table_name) "
        "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privileges(privilege_name) "
        "WHERE has_table_privilege(:role, format('public.%I', table_name), privilege_name)",
        tables=tables,
        privileges=table_privileges,
        role=runtime_role,
    ) == [(0,)]
    assert _query(
        integration_settings,
        "SELECT count(*) FROM pg_class AS table_data "
        "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
        "JOIN pg_roles AS role_data ON role_data.rolname = :role "
        "CROSS JOIN LATERAL aclexplode(COALESCE(table_data.relacl, "
        "acldefault('r', table_data.relowner))) AS privilege "
        "WHERE namespace.nspname = 'public' "
        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
        "AND privilege.grantee = role_data.oid "
        "AND privilege.privilege_type = ANY(CAST(:privileges AS text[])) "
        "AND privilege.is_grantable",
        tables=tables,
        privileges=table_privileges,
        role=runtime_role,
    ) == [(0,)]
    assert _query(
        integration_settings,
        "SELECT count(*) FROM pg_class AS table_data "
        "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
        "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
        "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privileges(privilege_name) "
        "WHERE namespace.nspname = 'public' "
        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
        "AND has_column_privilege(:role, table_data.oid, attribute.attname, privilege_name)",
        tables=tables,
        privileges=column_privileges,
        role=runtime_role,
    ) == [(0,)]
    assert _query(
        integration_settings,
        "SELECT count(*) FROM pg_class AS table_data "
        "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
        "JOIN pg_roles AS role_data ON role_data.rolname = :role "
        "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
        "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
        "WHERE namespace.nspname = 'public' "
        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
        "AND privilege.grantee = role_data.oid "
        "AND privilege.privilege_type = ANY(CAST(:privileges AS text[])) "
        "AND privilege.is_grantable",
        tables=tables,
        privileges=column_privileges,
        role=runtime_role,
    ) == [(0,)]
    assert _query(
        integration_settings,
        "SELECT count(*) FROM pg_class AS table_data "
        "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
        "JOIN pg_roles AS role_data ON role_data.rolname = :role "
        "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
        "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
        "WHERE namespace.nspname = 'public' "
        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
        "AND privilege.grantee IN (0, role_data.oid) "
        "AND privilege.privilege_type = ANY(CAST(:privileges AS text[]))",
        tables=tables,
        privileges=column_privileges,
        role=runtime_role,
    ) == [(0,)]
    assert _query(
        integration_settings,
        "SELECT count(*) FROM pg_class AS table_data "
        "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
        "CROSS JOIN LATERAL aclexplode(COALESCE(table_data.relacl, "
        "acldefault('r', table_data.relowner))) AS privilege "
        "WHERE namespace.nspname = 'public' "
        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
        "AND privilege.grantee = 0 "
        "AND privilege.privilege_type = ANY(CAST(:privileges AS text[]))",
        tables=tables,
        privileges=table_privileges,
    ) == [(0,)]
    public_rows = _query(
        integration_settings,
        "SELECT table_data.relname, privilege.privilege_type FROM pg_class AS table_data "
        "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
        "CROSS JOIN LATERAL aclexplode(COALESCE(table_data.relacl, "
        "acldefault('r', table_data.relowner))) AS privilege "
        "WHERE namespace.nspname = 'public' "
        "AND table_data.relname IN ('entity_alias', 'entity_alias_evidence') "
        "AND privilege.grantee = 0 ORDER BY table_data.relname, privilege.privilege_type",
    )
    assert public_rows == []

    engine = create_engine(_runtime_url(integration_settings), poolclass=NullPool)
    try:
        for table in tables:
            with pytest.raises(ProgrammingError), engine.connect() as connection:
                connection.execute(text(f"SELECT * FROM public.{table} LIMIT 0"))
            with pytest.raises(ProgrammingError), engine.begin() as connection:
                connection.execute(text(f"INSERT INTO public.{table} DEFAULT VALUES"))
            with pytest.raises(ProgrammingError), engine.begin() as connection:
                connection.execute(text(f"UPDATE public.{table} SET entity_id = entity_id"))
            with pytest.raises(ProgrammingError), engine.begin() as connection:
                connection.execute(text(f"DELETE FROM public.{table} WHERE false"))
            with pytest.raises(ProgrammingError), engine.begin() as connection:
                connection.execute(text(f"TRUNCATE TABLE public.{table}"))
    finally:
        engine.dispose()


def _privilege_surface(settings: IntegrationTestSettings) -> tuple[list[tuple[object, ...]], ...]:
    return (
        _query(
            settings,
            "SELECT nspname, nspacl::text FROM pg_namespace WHERE nspname = 'public'",
        ),
        _query(
            settings,
            "SELECT datname, datacl::text FROM pg_database WHERE datname = current_database()",
        ),
        _query(
            settings,
            "SELECT procedure.oid, procedure.proname, "
            "pg_get_function_identity_arguments(procedure.oid), procedure.proacl::text "
            "FROM pg_proc AS procedure "
            "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
            "WHERE namespace.nspname = 'public' ORDER BY procedure.oid",
        ),
        _query(
            settings,
            "SELECT table_data.relname, pg_get_userbyid(table_data.relowner), "
            "table_data.relacl::text FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "WHERE namespace.nspname = 'public' AND table_data.relkind = 'S' "
            "ORDER BY table_data.relname",
        ),
        _query(
            settings,
            "SELECT extname, extversion FROM pg_extension ORDER BY extname",
        ),
    )


def test_identity_lifecycle_does_not_expand_non_table_acl_surface(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
    try:
        before = _privilege_surface(integration_settings)
        _run_upgrade(integration_settings)
        after = _privilege_surface(integration_settings)
        assert after == before
    finally:
        if _query(integration_settings, "SELECT version_num FROM public.alembic_version") != [
            (_REVISION,)
        ]:
            _run_upgrade(integration_settings)


def test_upgrade_downgrade_reupgrade_preserves_phase1a_rows_and_candidate_key(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    before = _query(
        integration_settings,
        "SELECT id, entity_type, canonical_name FROM public.entity ORDER BY id",
    )
    assert set(before) == {(row[0], row[1], row[2]) for row in _ENTITY_ROWS}
    _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
    try:
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_PARENT_REVISION,)
        ]
        assert _query(
            integration_settings,
            "SELECT pg_get_constraintdef(constraint_data.oid, true) "
            "FROM pg_constraint AS constraint_data "
            "WHERE constraint_data.conrelid = 'public.source_record'::regclass "
            "AND constraint_data.conname = 'uq_source_record_id_canonical_entity_id'",
        ) == [("UNIQUE (id, canonical_entity_id)",)]
        _run_upgrade(integration_settings)
        after = _query(
            integration_settings,
            "SELECT id, entity_type, canonical_name, slug FROM public.entity ORDER BY id",
        )
        assert set(after) == set(_ENTITY_ROWS)
        assert _query(integration_settings, "SELECT count(*) FROM public.entity_alias") == [(0,)]
        assert _query(
            integration_settings, "SELECT count(*) FROM public.entity_alias_evidence"
        ) == [(0,)]
    finally:
        if _query(integration_settings, "SELECT version_num FROM public.alembic_version") != [
            (_REVISION,)
        ]:
            _run_upgrade(integration_settings)


def test_downgrade_refuses_alias_or_evidence_rows_before_destructive_work(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    def insert_alias_and_evidence(connection: Connection) -> None:
        connection.execute(
            text(
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'Fixture Alias', 'fixture alias', 1, 'common')"
            ),
            {"id": _FIXTURE_ALIAS, "entity_id": _ENTITY_IDS[0]},
        )
        connection.commit()

    run_migration_operation(historical_sync_url(integration_settings), insert_alias_and_evidence)
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_REVISION,)
        ]
        _execute(
            integration_settings,
            "DELETE FROM public.entity_alias WHERE id = :id",
            id=_FIXTURE_ALIAS,
        )
    finally:
        # The deletion is deliberately best-effort only after the refusal assertion.
        if _query(
            integration_settings,
            "SELECT count(*) FROM public.entity_alias WHERE id = :id",
            id=_FIXTURE_ALIAS,
        ) == [(1,)]:
            _execute(
                integration_settings,
                "DELETE FROM public.entity_alias WHERE id = :id",
                id=_FIXTURE_ALIAS,
            )


def test_downgrade_refuses_evidence_rows_before_destructive_work(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    def insert_graph_with_evidence(connection: Connection) -> None:
        connection.begin()
        _insert_fixture_graph(connection)
        connection.execute(
            text(
                "INSERT INTO public.entity_alias "
                "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                "VALUES (:id, :entity_id, 'Fixture Evidence Alias', "
                "'fixture evidence alias', 1, 'common')"
            ),
            {"id": _FIXTURE_ALIAS, "entity_id": _FIXTURE_ENTITY_A},
        )
        connection.execute(
            text(
                "INSERT INTO public.entity_alias_evidence "
                "(alias_id, entity_id, source_record_id) VALUES "
                "(:alias_id, :entity_id, :source_record_id)"
            ),
            {
                "alias_id": _FIXTURE_ALIAS,
                "entity_id": _FIXTURE_ENTITY_A,
                "source_record_id": _FIXTURE_SOURCE_A,
            },
        )
        connection.commit()

    def cleanup() -> None:
        for statement in (
            "DELETE FROM public.entity_alias_evidence",
            "DELETE FROM public.entity_alias",
            "DELETE FROM public.source_record",
            "DELETE FROM public.dataset",
            "DELETE FROM public.provider",
        ):
            _execute(integration_settings, statement)
        _execute(
            integration_settings,
            "DELETE FROM public.entity WHERE id IN (:entity_a, :entity_b)",
            entity_a=_FIXTURE_ENTITY_A,
            entity_b=_FIXTURE_ENTITY_B,
        )

    run_migration_operation(historical_sync_url(integration_settings), insert_graph_with_evidence)
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_REVISION,)
        ]
        assert _query(
            integration_settings, "SELECT count(*) FROM public.entity_alias_evidence"
        ) == [(1,)]
    finally:
        cleanup()


def test_downgrade_refuses_slug_drift_without_removing_identity_tables(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    original = _ENTITY_ROWS[0][3]
    _execute(
        integration_settings,
        "UPDATE public.entity SET slug = :slug WHERE id = :id",
        id=_ENTITY_ROWS[0][0],
        slug="hd-209458-drift",
    )
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_REVISION,)
        ]
        assert _query(
            integration_settings,
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' "
            "AND table_name IN ('entity_alias', 'entity_alias_evidence')",
        ) == [(2,)]
    finally:
        _execute(
            integration_settings,
            "UPDATE public.entity SET slug = :slug WHERE id = :id",
            id=_ENTITY_ROWS[0][0],
            slug=original,
        )


def _admin_execute(admin_url: URL, statement: str) -> None:
    engine = create_engine(admin_url.set(database="lumina_history_test"), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(statement)
    finally:
        engine.dispose()


def test_downgrade_refuses_identity_constraint_drift_before_destructive_work(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    _execute(
        integration_settings,
        "ALTER TABLE public.entity_alias DROP CONSTRAINT ck_entity_alias_language",
    )
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_REVISION,)
        ]
    finally:
        _execute(
            integration_settings,
            "ALTER TABLE public.entity_alias "
            "ADD CONSTRAINT ck_entity_alias_language CHECK ("
            "language IS NULL OR (char_length(language) BETWEEN 2 AND 35 "
            'AND (language COLLATE "C") ~ '
            "'^[a-z]{2,8}(-[a-z0-9]{1,8})*$'))",
        )


def test_downgrade_refuses_identity_acl_drift_before_destructive_work(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    runtime_role = _runtime_url(integration_settings).username
    assert runtime_role is not None
    _execute(
        integration_settings,
        f"GRANT SELECT ON TABLE public.entity_alias TO {runtime_role}",
    )
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_REVISION,)
        ]
    finally:
        _execute(
            integration_settings,
            f"REVOKE SELECT ON TABLE public.entity_alias FROM {runtime_role}",
        )


def test_downgrade_refuses_identity_owner_drift_before_destructive_work(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    migration_role = historical_sync_url(integration_settings).username
    runtime_role = _runtime_url(integration_settings).username
    assert migration_role is not None
    assert runtime_role is not None
    # Keep the migration role able to acquire the required table lock after
    # ownership is transferred; the migration must then reject the owner drift
    # during its exact-contract precondition check.
    _admin_execute(
        postgres_admin_sync_url,
        f"GRANT ALL PRIVILEGES ON TABLE public.entity_alias TO {migration_role}",
    )
    _admin_execute(
        postgres_admin_sync_url,
        f"ALTER TABLE public.entity_alias OWNER TO {runtime_role}",
    )
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_REVISION,)
        ]
    finally:
        _admin_execute(
            postgres_admin_sync_url,
            f"ALTER TABLE public.entity_alias OWNER TO {migration_role}",
        )
        _admin_execute(
            postgres_admin_sync_url,
            f"GRANT ALL PRIVILEGES ON TABLE public.entity_alias TO {migration_role}",
        )


def test_upgrade_refuses_missing_or_extra_entity_prestate_without_partial_changes(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
    missing = _ENTITY_ROWS[0]
    _execute(integration_settings, "DELETE FROM public.entity WHERE id = :id", id=missing[0])
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_upgrade(integration_settings)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_PARENT_REVISION,)
        ]
        _execute(
            integration_settings,
            "INSERT INTO public.entity (id, entity_type, canonical_name) "
            "VALUES (:id, :type, :name)",
            id=missing[0],
            type=missing[1],
            name=missing[2],
        )
    finally:
        if _query(
            integration_settings, "SELECT count(*) FROM public.entity WHERE id = :id", id=missing[0]
        ) == [(0,)]:
            _execute(
                integration_settings,
                "INSERT INTO public.entity (id, entity_type, canonical_name) "
                "VALUES (:id, :type, :name)",
                id=missing[0],
                type=missing[1],
                name=missing[2],
            )
        _run_upgrade(integration_settings)

    _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
    extra = UUID("96000000-0000-0000-0000-000000000901")
    _execute(
        integration_settings,
        "INSERT INTO public.entity (id, entity_type, canonical_name) "
        "VALUES (:id, 'star', 'Fixture Extra Entity')",
        id=extra,
    )
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_upgrade(integration_settings)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_PARENT_REVISION,)
        ]
    finally:
        _execute(integration_settings, "DELETE FROM public.entity WHERE id = :id", id=extra)
        _run_upgrade(integration_settings)

    _run_historical_downgrade(integration_settings, postgres_admin_sync_url)
    altered = _ENTITY_ROWS[1]
    _execute(
        integration_settings,
        "UPDATE public.entity SET canonical_name = :name WHERE id = :id",
        id=altered[0],
        name="Fixture Altered Canonical Name",
    )
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_upgrade(integration_settings)
        assert _query(integration_settings, "SELECT version_num FROM public.alembic_version") == [
            (_PARENT_REVISION,)
        ]
    finally:
        _execute(
            integration_settings,
            "UPDATE public.entity SET canonical_name = :name WHERE id = :id",
            id=altered[0],
            name=altered[2],
        )
        _run_upgrade(integration_settings)
