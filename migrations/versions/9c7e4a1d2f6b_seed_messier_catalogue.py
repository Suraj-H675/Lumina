"""Seed the reviewed Phase 2G Messier catalogue foundation."""

from __future__ import annotations

from typing import NoReturn
from uuid import NAMESPACE_URL, UUID, uuid5

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "9c7e4a1d2f6b"
down_revision = "f2a6c8d9e0b1"
branch_labels = None
depends_on = None

_SAFE_ERROR = "Messier catalogue foundation migration precondition failed."
_UNIT_ID = UUID("48176d92-8406-52ae-855a-aa2f48dfd089")
_QUANTITY_ROWS = (
    (UUID("8354f911-f6fd-5b7c-90d8-6f9e5300982a"), "icrs_right_ascension_j2000", "ICRS right ascension (J2000.0)"),
    (UUID("3cf0863b-ed7a-5970-a147-bc6323479e5a"), "icrs_declination_j2000", "ICRS declination (J2000.0)"),
)
_ENTITY_ROWS = (
    (UUID("e87068a4-91a2-5d18-8d3a-efb153c76a79"), "nebula", "Messier 1", "messier-1"),
    (UUID("105098c1-b7b9-579c-832f-2c32a44129b0"), "cluster", "Messier 2", "messier-2"),
    (UUID("68c1ebea-5146-52de-9961-cc3e9fe58bf6"), "cluster", "Messier 3", "messier-3"),
    (UUID("41099e96-cc76-516f-aa72-36c27c3b6bdc"), "cluster", "Messier 4", "messier-4"),
    (UUID("7c78606b-7539-54f0-9d1f-357b53f63408"), "cluster", "Messier 5", "messier-5"),
    (UUID("fc2b63f3-b706-56e4-af7b-88d112024eb4"), "cluster", "Messier 6", "messier-6"),
    (UUID("b6b9efe4-34c7-5ae8-9da5-abe8d753778b"), "cluster", "Messier 7", "messier-7"),
    (UUID("3756292d-4401-5694-9797-7c7580513eef"), "cluster", "Messier 8", "messier-8"),
    (UUID("a9a26062-4164-55fe-bd2e-c05c53cc7c10"), "cluster", "Messier 9", "messier-9"),
    (UUID("5c7de235-47d7-582e-a7a6-7e419bcad150"), "cluster", "Messier 10", "messier-10"),
    (UUID("93690ac3-97ab-58b8-a033-bd8f86c7fd8b"), "cluster", "Messier 11", "messier-11"),
    (UUID("7b316a40-f88a-50da-a087-5ebc7e25703c"), "cluster", "Messier 12", "messier-12"),
    (UUID("a1d2cb11-44f1-5504-b600-d1a70149fab3"), "cluster", "Messier 13", "messier-13"),
    (UUID("82d68cb9-7f8a-5667-9138-0b76f7cdacb0"), "cluster", "Messier 14", "messier-14"),
    (UUID("b85ad820-ad7e-5ad8-bd14-f3ed0de4db80"), "cluster", "Messier 15", "messier-15"),
    (UUID("84914de9-cf72-51eb-8091-975f1fbf36b4"), "cluster", "Messier 16", "messier-16"),
    (UUID("c0c41784-25dd-5b8b-9c4d-b8154a806849"), "cluster", "Messier 17", "messier-17"),
    (UUID("4105ce0d-bdc1-5201-aca3-9aa196ce35c2"), "cluster", "Messier 18", "messier-18"),
    (UUID("7ef8eabb-434c-5ea5-a0ee-0b1d70f18ed1"), "cluster", "Messier 19", "messier-19"),
    (UUID("bdb1bf88-5e7b-5083-8733-ca853e664ec3"), "cluster", "Messier 20", "messier-20"),
    (UUID("a5e2c8af-219c-5b9d-a05b-d9cf48d7d03a"), "cluster", "Messier 21", "messier-21"),
    (UUID("bc39b150-b93b-5c6c-9baa-8b8b58d7e732"), "cluster", "Messier 22", "messier-22"),
    (UUID("b6775eeb-ffbb-5d93-b461-9c9da8951e73"), "cluster", "Messier 23", "messier-23"),
    (UUID("87347227-54a6-58a9-82aa-1d97e3d93313"), "sky_region", "Messier 24", "messier-24"),
    (UUID("8e476a8c-1182-5981-b220-dd7c715a1132"), "cluster", "Messier 25", "messier-25"),
    (UUID("abcddd14-8a85-5828-b2e9-b94a88070ef5"), "cluster", "Messier 26", "messier-26"),
    (UUID("bcd12969-e75a-502d-aef9-20111cf73061"), "nebula", "Messier 27", "messier-27"),
    (UUID("8093e3a4-d347-51b6-82db-bd7523029c67"), "cluster", "Messier 28", "messier-28"),
    (UUID("cd359c12-afc5-5a53-938f-a7ad227e559b"), "cluster", "Messier 29", "messier-29"),
    (UUID("df6c6c32-9070-5374-a64f-002e68af6b93"), "cluster", "Messier 30", "messier-30"),
    (UUID("63f8a58a-a62b-5ae7-824b-35f3ebf1f6f0"), "galaxy", "Messier 31", "messier-31"),
    (UUID("870a4be8-f2de-560d-83b3-3312a158feaf"), "galaxy", "Messier 32", "messier-32"),
    (UUID("e7f043a9-beb2-5516-bb8c-22f8a9e1e6ad"), "galaxy", "Messier 33", "messier-33"),
    (UUID("0e90b4ee-5ae1-5a28-8af7-e0febd4da676"), "cluster", "Messier 34", "messier-34"),
    (UUID("8abfb282-585b-5401-acaf-148d328afae7"), "cluster", "Messier 35", "messier-35"),
    (UUID("3e012a22-27ad-52fd-8b3b-e1ac00029919"), "cluster", "Messier 36", "messier-36"),
    (UUID("774a9d8c-eabd-5564-b17d-c7e0cf8402f6"), "cluster", "Messier 37", "messier-37"),
    (UUID("a8c8e5e9-bf6d-5f41-a3de-596445924cf5"), "cluster", "Messier 38", "messier-38"),
    (UUID("2cebea6b-672a-5721-8328-ef73f2559498"), "cluster", "Messier 39", "messier-39"),
    (UUID("9c8f111a-8939-54ee-93bd-eba11f24e769"), "system", "Messier 40", "messier-40"),
    (UUID("92a9eeb9-7b77-50cf-a88f-46fc6dcd290f"), "cluster", "Messier 41", "messier-41"),
    (UUID("6d4bdbe9-2fdb-5f42-b56a-922f0789bd10"), "nebula", "Messier 42", "messier-42"),
    (UUID("b038d3ab-7dfe-52b9-b371-c33b0fa282b8"), "nebula", "Messier 43", "messier-43"),
    (UUID("fb3316e9-17b2-57b6-8b6c-158433d1b605"), "cluster", "Messier 44", "messier-44"),
    (UUID("8b2e8401-2e83-5eee-a699-2d2bd88f21b5"), "cluster", "Messier 45", "messier-45"),
    (UUID("6cfceb56-25e3-5f27-8460-a5cf26029edc"), "cluster", "Messier 46", "messier-46"),
    (UUID("d0ac23ff-efe8-5b07-9557-13b03dc24cf6"), "cluster", "Messier 47", "messier-47"),
    (UUID("c04d6c7b-3926-5d88-981e-03f9cd748dbe"), "cluster", "Messier 48", "messier-48"),
    (UUID("0d450589-f904-5539-b22b-a788e9b87eef"), "galaxy", "Messier 49", "messier-49"),
    (UUID("c711f30b-d17a-57da-b2f7-1d4392d9339b"), "cluster", "Messier 50", "messier-50"),
    (UUID("eb9b00fb-3828-5843-9928-4add6ddfb259"), "galaxy", "Messier 51", "messier-51"),
    (UUID("939f2161-20ab-5b7a-a2d8-b9a9f2d9893b"), "cluster", "Messier 52", "messier-52"),
    (UUID("b9c8bd29-9280-5929-9335-3370d5314cae"), "cluster", "Messier 53", "messier-53"),
    (UUID("d00a469c-2404-5df0-aaf9-990230b1ab24"), "cluster", "Messier 54", "messier-54"),
    (UUID("cc3df63c-2847-5527-a3d4-55af7c745334"), "cluster", "Messier 55", "messier-55"),
    (UUID("c1fdfc85-a4af-5586-b4f1-a2329305d39d"), "cluster", "Messier 56", "messier-56"),
    (UUID("4d868956-c982-5a72-8cbd-99a68f5659d6"), "nebula", "Messier 57", "messier-57"),
    (UUID("ceea07cb-efc6-5828-92b6-13a085286c7a"), "galaxy", "Messier 58", "messier-58"),
    (UUID("e28caac2-e066-5c08-aedf-5ba6546b99e1"), "galaxy", "Messier 59", "messier-59"),
    (UUID("3eb52b45-5a6f-52ba-b2e5-46b97829fcd4"), "galaxy", "Messier 60", "messier-60"),
    (UUID("c2b01301-5b84-520a-823f-59f735b4c324"), "galaxy", "Messier 61", "messier-61"),
    (UUID("564483d8-2ce2-5f29-b017-10cbb36d2636"), "cluster", "Messier 62", "messier-62"),
    (UUID("e8033172-355e-5c5e-bded-0b459a309f90"), "galaxy", "Messier 63", "messier-63"),
    (UUID("18054570-d90b-5709-844b-69e82d15f9f6"), "galaxy", "Messier 64", "messier-64"),
    (UUID("e810093d-85e7-573a-9be2-a824501802c3"), "galaxy", "Messier 65", "messier-65"),
    (UUID("ff4dd3f9-91e1-5704-879f-95a4e633fdd2"), "galaxy", "Messier 66", "messier-66"),
    (UUID("10d8ecca-8d94-5b6c-83c4-7db92f19d26f"), "cluster", "Messier 67", "messier-67"),
    (UUID("ecede90c-02c0-5300-bf20-23d58c1d0125"), "cluster", "Messier 68", "messier-68"),
    (UUID("8dc89a2c-7601-5afb-91f3-3182925307d1"), "cluster", "Messier 69", "messier-69"),
    (UUID("0061a869-b768-5326-9ae9-003ccabf5393"), "cluster", "Messier 70", "messier-70"),
    (UUID("858a7fa2-4323-54a4-9276-a26803e64bce"), "cluster", "Messier 71", "messier-71"),
    (UUID("e9d41759-7652-5d89-831c-a154f19ca8f3"), "cluster", "Messier 72", "messier-72"),
    (UUID("21cf84d3-410c-536f-9b41-2744d2b8b9e7"), "sky_region", "Messier 73", "messier-73"),
    (UUID("4135603f-df87-5ebe-b6b3-5ff06687f5ca"), "galaxy", "Messier 74", "messier-74"),
    (UUID("1b84da4a-76cd-5006-a539-89f41be15e95"), "cluster", "Messier 75", "messier-75"),
    (UUID("7d14779f-180d-5f99-a8c0-58cb48a2fe2a"), "nebula", "Messier 76", "messier-76"),
    (UUID("91546d3d-1c18-5ef1-9f67-dae14eed876e"), "galaxy", "Messier 77", "messier-77"),
    (UUID("d5c665fc-26d1-55ea-9304-b8b57cf8c536"), "nebula", "Messier 78", "messier-78"),
    (UUID("c47c349e-9f4d-5349-9938-bf7f31996e88"), "cluster", "Messier 79", "messier-79"),
    (UUID("db5bb3b7-b382-55d6-b52d-36a4607e353d"), "cluster", "Messier 80", "messier-80"),
    (UUID("c14bb6fe-655d-54c3-a437-6e9357199bf7"), "galaxy", "Messier 81", "messier-81"),
    (UUID("03aa06bb-116c-5a94-9ad7-6a1ec619b04c"), "galaxy", "Messier 82", "messier-82"),
    (UUID("3236408e-2d24-532a-a68d-954e931049fb"), "galaxy", "Messier 83", "messier-83"),
    (UUID("c2cf7c6d-4a79-5902-890c-4ff6141a8b31"), "galaxy", "Messier 84", "messier-84"),
    (UUID("a8f97915-d5be-53de-b40b-0b8b3e930fdb"), "galaxy", "Messier 85", "messier-85"),
    (UUID("dcddd8b8-7de9-5e71-8340-a700b35f3c08"), "galaxy", "Messier 86", "messier-86"),
    (UUID("8bee5bc0-114d-502d-81dd-dac50cf39ded"), "galaxy", "Messier 87", "messier-87"),
    (UUID("40c87c17-599c-5373-95a9-b6c658290ee1"), "galaxy", "Messier 88", "messier-88"),
    (UUID("d12d612f-b63b-5821-8637-33f63477937c"), "galaxy", "Messier 89", "messier-89"),
    (UUID("a86a103c-1467-578c-a6a4-e454f739b129"), "galaxy", "Messier 90", "messier-90"),
    (UUID("8d7c9b59-21d3-5d58-b321-d65730da9722"), "galaxy", "Messier 91", "messier-91"),
    (UUID("eb787187-ae74-5e30-909b-05f717907c1a"), "cluster", "Messier 92", "messier-92"),
    (UUID("2ad4c2d8-45d1-5255-bf6d-50c57ab302f1"), "cluster", "Messier 93", "messier-93"),
    (UUID("1bfd6a81-0bbd-52f7-bd2b-a537f5ad593a"), "galaxy", "Messier 94", "messier-94"),
    (UUID("ab3fc187-51ea-5819-976f-049b22b47925"), "galaxy", "Messier 95", "messier-95"),
    (UUID("e38318b2-467e-5072-97e5-367a8c915071"), "galaxy", "Messier 96", "messier-96"),
    (UUID("7446ca40-7a43-5388-9efd-f92191986a54"), "nebula", "Messier 97", "messier-97"),
    (UUID("ad1f14fa-5cdf-5a93-b688-d2e3674c1205"), "galaxy", "Messier 98", "messier-98"),
    (UUID("f25620df-8a9b-5e13-9c34-671b644454b9"), "galaxy", "Messier 99", "messier-99"),
    (UUID("3f00fdf3-c2cb-5c64-a848-d7788bc70e4e"), "galaxy", "Messier 100", "messier-100"),
    (UUID("3f75d29b-44d3-5450-8836-23636ee57927"), "galaxy", "Messier 101", "messier-101"),
    (UUID("99911e61-aa19-5bba-ba41-012a0b39898b"), "galaxy", "Messier 102", "messier-102"),
    (UUID("7a0ea762-a704-507e-bb6c-34866a5d9cb0"), "cluster", "Messier 103", "messier-103"),
    (UUID("f788c50d-7539-5f1b-9742-1649572ee765"), "galaxy", "Messier 104", "messier-104"),
    (UUID("4a90e745-21a0-515b-b461-01aedab811ba"), "galaxy", "Messier 105", "messier-105"),
    (UUID("45cbd812-06a3-5fa5-9657-17f6c43c2b28"), "galaxy", "Messier 106", "messier-106"),
    (UUID("cc4c9fdc-9e63-5f8e-b732-352f90b754cf"), "cluster", "Messier 107", "messier-107"),
    (UUID("b6d13ae8-f4bf-5e49-aea6-d86f2b2c767e"), "galaxy", "Messier 108", "messier-108"),
    (UUID("7fc175f2-83c0-52b8-97a8-63e138415339"), "galaxy", "Messier 109", "messier-109"),
    (UUID("04366a03-42e6-5dfb-9c08-79f968b63b32"), "galaxy", "Messier 110", "messier-110"),

)


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _identity() -> MigrationIdentity:
    configured = context.get_context().config.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _assert_actor(connection: Connection) -> None:
    identity = _identity()
    current, session = connection.execute(sa.text("SELECT current_user, session_user")).one()
    if current != identity.migration_role or session != identity.migration_role or current == identity.runtime_role:
        _fail()


def _assert_revision(connection: Connection, expected: str) -> None:
    if connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one_or_none() != expected:
        _fail()


def _lock(connection: Connection, tables: tuple[str, ...]) -> None:
    connection.execute(sa.text("LOCK TABLE " + ", ".join("public." + table for table in tables) + " IN SHARE ROW EXCLUSIVE MODE"))


def _assert_no_collisions(connection: Connection) -> None:
    if connection.execute(sa.text("SELECT count(*) FROM public.entity WHERE id = ANY(:ids)"), {"ids": [row[0] for row in _ENTITY_ROWS]}).scalar_one() != 0:
        _fail()
    if connection.execute(sa.text("SELECT count(*) FROM public.entity WHERE slug = ANY(:slugs)"), {"slugs": [row[3] for row in _ENTITY_ROWS]}).scalar_one() != 0:
        _fail()
    alias_keys = [f"m {i}" for i in range(1, 111)] + [f"m{i}" for i in range(1, 111)]
    if connection.execute(sa.text("SELECT count(*) FROM public.entity_alias WHERE normalized_alias = ANY(:keys) AND normalization_version = 1"), {"keys": alias_keys}).scalar_one() != 0:
        _fail()
    if connection.execute(sa.text("SELECT count(*) FROM public.quantity WHERE code = ANY(:codes)"), {"codes": [row[1] for row in _QUANTITY_ROWS]}).scalar_one() != 0:
        _fail()


def _assert_rows(connection: Connection) -> None:
    actual = {tuple(row) for row in connection.execute(sa.text("SELECT id, entity_type, canonical_name, slug FROM public.entity WHERE slug LIKE 'messier-%'"))}
    if actual != set(_ENTITY_ROWS):
        _fail()
    normalized = {tuple(row) for row in connection.execute(sa.text("SELECT id, normalized_canonical_name, canonical_name_normalization_version FROM public.entity WHERE slug LIKE 'messier-%'"))}
    if normalized != {(entity_id, f"messier {i}", 1) for i, (entity_id, _, _, _) in enumerate(_ENTITY_ROWS, 1)}:
        _fail()
    aliases = {tuple(row) for row in connection.execute(sa.text("SELECT entity_id, alias, normalized_alias, normalization_version, alias_type, catalog_name FROM public.entity_alias WHERE catalog_name = 'messier'"))}
    expected = {(entity_id, f"M {i}", f"m {i}", 1, "catalog_designation", "messier") for i, (entity_id, _, _, _) in enumerate(_ENTITY_ROWS, 1)} | {(entity_id, f"M{i}", f"m{i}", 1, "catalog_designation", "messier") for i, (entity_id, _, _, _) in enumerate(_ENTITY_ROWS, 1)}
    if aliases != expected or len(aliases) != 220:
        _fail()


def upgrade() -> None:
    if context.is_offline_mode():
        _fail()
    connection = op.get_bind()
    _assert_actor(connection)
    _assert_revision(connection, "f2a6c8d9e0b1")
    _lock(connection, ("entity", "entity_alias", "quantity", "quantity_unit"))
    _assert_no_collisions(connection)
    connection.execute(sa.text("ALTER TABLE public.entity DROP CONSTRAINT ck_entity_type"))
    connection.execute(sa.text("ALTER TABLE public.entity ADD CONSTRAINT ck_entity_type CHECK (entity_type IN ('star','planet','dwarf_planet','moon','asteroid','comet','exoplanet','galaxy','nebula','cluster','black_hole','compact_object','system','constellation','mission','spacecraft','launch_vehicle','observatory','person','concept','event','sky_region'))"))
    connection.execute(sa.text("INSERT INTO public.quantity (id, code, name) VALUES (:id, :code, :name)"), [{"id": q[0], "code": q[1], "name": q[2]} for q in _QUANTITY_ROWS])
    connection.execute(sa.text("INSERT INTO public.quantity_unit (quantity_id, unit_id) VALUES (:quantity_id, :unit_id)"), [{"quantity_id": q[0], "unit_id": _UNIT_ID} for q in _QUANTITY_ROWS])
    connection.execute(sa.text("INSERT INTO public.entity (id, entity_type, canonical_name, slug, normalized_canonical_name, canonical_name_normalization_version) VALUES (:id, :entity_type, :canonical_name, :slug, :normalized_canonical_name, :canonical_name_normalization_version)"), [{"id": e[0], "entity_type": e[1], "canonical_name": e[2], "slug": e[3], "normalized_canonical_name": f"messier {i}", "canonical_name_normalization_version": 1} for i, e in enumerate(_ENTITY_ROWS, 1)])
    aliases = []
    for i, (entity_id, _, _, _) in enumerate(_ENTITY_ROWS, 1):
        for display, normalized in ((f"M {i}", f"m {i}"), (f"M{i}", f"m{i}")):
            aliases.append({"id": uuid5(NAMESPACE_URL, f"urn:lumina:catalog-alias:v1:messier:{i}:{normalized}"), "entity_id": entity_id, "alias": display, "normalized_alias": normalized, "normalization_version": 1, "alias_type": "catalog_designation", "catalog_name": "messier"})
    connection.execute(sa.text("INSERT INTO public.entity_alias (id, entity_id, alias, normalized_alias, normalization_version, alias_type, catalog_name) VALUES (:id, :entity_id, :alias, :normalized_alias, :normalization_version, :alias_type, :catalog_name)"), aliases)
    _assert_rows(connection)


def downgrade() -> None:
    if context.is_offline_mode():
        _fail()
    connection = op.get_bind()
    _assert_actor(connection)
    _assert_revision(connection, revision)
    _lock(connection, ("entity_alias_evidence", "ingestion_conflict", "canonical_measurement", "measurement", "source_record", "entity_alias", "entity", "quantity_unit", "quantity"))
    ids = [row[0] for row in _ENTITY_ROWS]
    if connection.execute(sa.text("SELECT count(*) FROM public.source_record WHERE canonical_entity_id = ANY(:ids)"), {"ids": ids}).scalar_one() != 0 or connection.execute(sa.text("SELECT count(*) FROM public.measurement WHERE entity_id = ANY(:ids)"), {"ids": ids}).scalar_one() != 0 or connection.execute(sa.text("SELECT count(*) FROM public.canonical_measurement WHERE entity_id = ANY(:ids)"), {"ids": ids}).scalar_one() != 0 or connection.execute(sa.text("SELECT count(*) FROM public.entity_alias_evidence WHERE entity_id = ANY(:ids)"), {"ids": ids}).scalar_one() != 0:
        _fail()
    _assert_rows(connection)
    connection.execute(sa.text("DELETE FROM public.entity_alias WHERE catalog_name = 'messier' AND entity_id = ANY(:ids)"), {"ids": ids})
    connection.execute(sa.text("DELETE FROM public.entity WHERE id = ANY(:ids)"), {"ids": ids})
    connection.execute(sa.text("DELETE FROM public.quantity_unit WHERE quantity_id = ANY(:ids)"), {"ids": [q[0] for q in _QUANTITY_ROWS]})
    connection.execute(sa.text("DELETE FROM public.quantity WHERE id = ANY(:ids)"), {"ids": [q[0] for q in _QUANTITY_ROWS]})
    connection.execute(sa.text("ALTER TABLE public.entity DROP CONSTRAINT ck_entity_type"))
    connection.execute(sa.text("ALTER TABLE public.entity ADD CONSTRAINT ck_entity_type CHECK (entity_type IN ('star','planet','dwarf_planet','moon','asteroid','comet','exoplanet','galaxy','nebula','cluster','black_hole','compact_object','system','constellation','mission','spacecraft','launch_vehicle','observatory','person','concept','event'))"))
