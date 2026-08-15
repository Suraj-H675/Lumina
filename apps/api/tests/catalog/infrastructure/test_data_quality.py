"""Focused contracts for the reviewed-slice PostgreSQL data-quality repository."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import cast
from uuid import UUID

import pytest
from lumina.catalog.domain.read import CatalogDataInconsistent
from lumina.catalog.domain.reviewed_slice import ReviewedSlice
from lumina.catalog.infrastructure.postgresql.data_quality import (
    PostgreSqlCatalogDataQualityRepository,
)
from sqlalchemy import RowMapping
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_PROVIDER_ID = UUID("12345678-1234-4234-9234-123456789abc")
_DATASET_ID = UUID("12345678-1234-4234-9234-123456789abd")
_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abe")
_QUANTITY_ID = UUID("12345678-1234-4234-9234-123456789abf")
_UNIT_ID = UUID("12345678-1234-4234-9234-123456789ac0")
_SOURCE_RECORD_ID = UUID("12345678-1234-4234-9234-123456789ac1")
_MEASUREMENT_ID = UUID("12345678-1234-4234-9234-123456789ac2")
_AT = datetime(2026, 8, 15, 12, 30, tzinfo=UTC)


@dataclass(frozen=True)
class _Provider:
    code: str = "fixture.provider"


@dataclass(frozen=True)
class _Dataset:
    code: str = "fixture.dataset"
    release_version: str = "fixture-release-v1"


@dataclass(frozen=True)
class _Identified:
    id: UUID
    provider_record_id: str = ""
    source_fact_key: str = ""


@dataclass(frozen=True)
class _Pair:
    quantity_id: UUID
    unit_id: UUID


@dataclass(frozen=True)
class _ReviewedSlice:
    provider: _Provider
    dataset: _Dataset
    provider_version: str
    entities: tuple[_Identified, ...]
    quantities: tuple[_Identified, ...]
    unit: _Identified
    compatibility_pairs: tuple[_Pair, ...]


def _slice() -> ReviewedSlice:
    return cast(
        ReviewedSlice,
        _ReviewedSlice(
            provider=_Provider(),
            dataset=_Dataset(),
            provider_version="fixture-provider-v1",
            entities=(_Identified(_ENTITY_ID, provider_record_id="fixture-record-1"),),
            quantities=(_Identified(_QUANTITY_ID, source_fact_key="fixture.magnitude"),),
            unit=_Identified(_UNIT_ID),
            compatibility_pairs=(_Pair(_QUANTITY_ID, _UNIT_ID),),
        ),
    )


class _Result:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[RowMapping]:
        return cast(list[RowMapping], self._rows)


class _Connection:
    def __init__(self, responses: list[list[dict[str, object]]]) -> None:
        self._responses = responses
        self.statements: list[tuple[str, dict[str, object] | None]] = []

    async def execute(
        self,
        statement: object,
        parameters: dict[str, object] | None = None,
    ) -> _Result:
        sql = str(statement)
        self.statements.append((sql, parameters))
        if "SET TRANSACTION" in sql or "set_config" in sql:
            return _Result([])
        if not self._responses:
            raise AssertionError(f"Unexpected query: {sql}")
        return _Result(self._responses.pop(0))


class _Session:
    def __init__(self, connection: _Connection) -> None:
        self._connection = connection
        self._in_transaction = False
        self.closed = False

    async def begin(self) -> None:
        self._in_transaction = True

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self._connection)

    def in_transaction(self) -> bool:
        return self._in_transaction

    async def rollback(self) -> None:
        self._in_transaction = False

    async def close(self) -> None:
        self.closed = True

    async def invalidate(self) -> None:
        self.closed = True


def _rows(
    *,
    measurement_unit_id: UUID = _UNIT_ID,
    canonical_name_count: int = 1,
    provider_record_id: str = "fixture-record-1",
) -> list[list[dict[str, object]]]:
    return [
        [
            {
                "provider_id": _PROVIDER_ID,
                "provider_code": "fixture.provider",
                "provider_name": "Fixture Provider",
                "documentation_url": "https://fixtures.invalid/docs",
                "terms_url": "https://fixtures.invalid/terms",
                "attribution_text": "Fixture attribution.",
            }
        ],
        [
            {
                "dataset_id": _DATASET_ID,
                "provider_id": _PROVIDER_ID,
                "dataset_code": "fixture.dataset",
                "dataset_name": "Fixture Dataset",
                "release_version": "fixture-release-v1",
                "source_url": "https://fixtures.invalid/data",
                "licence": "Fixture licence.",
                "citation": "Fixture citation.",
            }
        ],
        [
            {
                "entity_id": _ENTITY_ID,
                "entity_type": "star",
                "canonical_name": "Fixture Star",
                "canonical_name_count": canonical_name_count,
            }
        ],
        [
            {
                "quantity_id": _QUANTITY_ID,
                "quantity_code": "fixture.magnitude",
                "quantity_name": "Fixture magnitude",
            }
        ],
        [
            {
                "unit_id": _UNIT_ID,
                "unit_code": "mag",
                "unit_symbol": "mag",
                "unit_name": "magnitude",
            }
        ],
        [{"quantity_id": _QUANTITY_ID, "unit_id": _UNIT_ID}],
        [
            {
                "source_record_id": _SOURCE_RECORD_ID,
                "provider_id": _PROVIDER_ID,
                "dataset_id": _DATASET_ID,
                "provider_record_id": provider_record_id,
                "provider_version": "fixture-provider-v1",
                "entity_id": _ENTITY_ID,
                "source_url": "https://fixtures.invalid/record-1",
                "fetched_at": _AT,
                "adapter_id": "fixture.adapter",
                "adapter_version": "fixture-v1",
                "parser_version": "fixture-parser-v1",
                "normalized_content_sha256": "a" * 64,
            }
        ],
        [
            {
                "measurement_id": _MEASUREMENT_ID,
                "entity_id": _ENTITY_ID,
                "source_record_id": _SOURCE_RECORD_ID,
                "quantity_id": _QUANTITY_ID,
                "unit_id": measurement_unit_id,
                "value_numeric": Decimal("12.300"),
                "created_at": _AT,
                "source_fact_key": "fixture.magnitude",
                "original_value": "12.300",
                "original_unit": "mag from provider",
            }
        ],
        [
            {
                "fingerprint": "b" * 64,
                "category": "measurement_fact_mismatch",
                "provider_id": None,
                "dataset_id": None,
                "source_record_id": None,
                "measurement_id": _MEASUREMENT_ID,
                "source_fact_key": "fixture.magnitude",
                "status": "open",
                "created_at": _AT,
                "resolved_at": None,
            }
        ],
    ]


@pytest.mark.asyncio
async def test_loads_one_repeatable_source_fact_closure_with_original_lexemes() -> None:
    connection = _Connection(_rows())
    session = _Session(connection)
    repository = PostgreSqlCatalogDataQualityRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    state = await repository.load_slice_state(_slice())

    assert session.closed is True
    assert state.provider is not None and state.provider.id == _PROVIDER_ID
    assert state.dataset is not None and state.dataset.id == _DATASET_ID
    assert state.source_records[0].provider_version == "fixture-provider-v1"
    assert state.measurements[0].original_value == "12.300"
    assert state.measurements[0].original_unit == "mag from provider"
    assert state.conflicts[0].fingerprint == "b" * 64
    assert not connection._responses  # noqa: SLF001 - all closure queries must execute once.
    statements = tuple(sql for sql, _ in connection.statements)
    assert any("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ" in sql for sql in statements)
    assert any("SET TRANSACTION READ ONLY" in sql for sql in statements)
    assert any("statement_timeout" in sql and "lock_timeout" in sql for sql in statements)
    source_parameters = [
        parameters
        for sql, parameters in connection.statements
        if "JOIN public.source_record AS source_record" in sql
        and "normalized_content_sha256" in sql
    ]
    assert source_parameters == [
        {
            "provider_code": "fixture.provider",
            "dataset_code": "fixture.dataset",
            "dataset_release_version": "fixture-release-v1",
            "provider_version": "fixture-provider-v1",
            "entity_ids": [_ENTITY_ID],
            "provider_record_ids": ["fixture-record-1"],
            "quantity_ids": [_QUANTITY_ID],
            "source_fact_keys": ["fixture.magnitude"],
            "unit_id": _UNIT_ID,
            "pair_quantity_ids": [_QUANTITY_ID],
            "pair_unit_ids": [_UNIT_ID],
        }
    ]


@pytest.mark.asyncio
async def test_rejects_a_measurement_that_does_not_close_over_the_requested_unit() -> None:
    unexpected_unit_id = UUID("12345678-1234-4234-9234-123456789ac3")
    connection = _Connection(_rows(measurement_unit_id=unexpected_unit_id))
    session = _Session(connection)
    repository = PostgreSqlCatalogDataQualityRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    with pytest.raises(CatalogDataInconsistent):
        await repository.load_slice_state(_slice())

    assert session.closed is True


@pytest.mark.asyncio
async def test_rejects_a_duplicate_entity_name_outside_the_reviewed_identifier_set() -> None:
    connection = _Connection(_rows(canonical_name_count=2))
    session = _Session(connection)
    repository = PostgreSqlCatalogDataQualityRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    with pytest.raises(CatalogDataInconsistent):
        await repository.load_slice_state(_slice())

    assert session.closed is True


@pytest.mark.asyncio
async def test_rejects_a_source_record_outside_the_exact_reviewed_source_identifier_set() -> None:
    connection = _Connection(_rows(provider_record_id="unreviewed-record"))
    session = _Session(connection)
    repository = PostgreSqlCatalogDataQualityRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    with pytest.raises(CatalogDataInconsistent):
        await repository.load_slice_state(_slice())

    assert session.closed is True


def test_repository_source_never_queries_a_value_selection_relation_or_label() -> None:
    source = Path(
        "apps/api/src/lumina/catalog/infrastructure/postgresql/data_quality.py"
    ).read_text(encoding="utf-8")

    assert "canonical_measurement" not in source
    assert "selection_rule" not in source
    assert "selection_version" not in source
