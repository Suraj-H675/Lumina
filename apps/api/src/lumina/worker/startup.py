"""Secret-safe read-only worker startup compatibility checks."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Coroutine
from contextlib import suppress
from enum import Enum, auto
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

_READ_ONLY_SQL = "SET TRANSACTION READ ONLY"
_TIMEOUT_SQL = """
SELECT
    set_config('statement_timeout', :timeout, true),
    set_config('lock_timeout', :timeout, true)
"""
_BASELINE_SQL = """
SELECT
    1,
    current_setting('transaction_read_only') = 'on',
    current_user = session_user,
    pg_catalog.to_regclass('public.job') IS NOT NULL
"""
_COLUMNS_SQL = """
SELECT
    a.attname,
    pg_catalog.format_type(a.atttypid, a.atttypmod),
    a.attnotnull,
    pg_catalog.pg_get_expr(d.adbin, d.adrelid)
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = c.oid
LEFT JOIN pg_catalog.pg_attrdef AS d
  ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relname = 'job'
  AND c.relkind IN ('r', 'p')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum
"""
_CONSTRAINTS_SQL = """
SELECT
    con.conname,
    con.contype,
    pg_catalog.pg_get_constraintdef(con.oid, true)
FROM pg_catalog.pg_constraint AS con
WHERE con.conrelid = pg_catalog.to_regclass('public.job')
  AND con.contype IN ('c', 'p', 'u')
ORDER BY con.conname
"""
_INDEXES_SQL = """
SELECT
    idx.relname,
    pg_catalog.pg_get_indexdef(idx.oid)
FROM pg_catalog.pg_index AS i
JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
WHERE i.indrelid = pg_catalog.to_regclass('public.job')
ORDER BY idx.relname
"""
_PRIVILEGES_SQL = """
WITH table_privileges(privilege_name) AS (
    SELECT unnest(
        ARRAY[
            'SELECT','INSERT','UPDATE','DELETE',
            'TRUNCATE','REFERENCES','TRIGGER'
        ]::text[]
    )
),
column_privileges(privilege_name) AS (
    SELECT unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']::text[])
),
columns(column_name) AS (
    SELECT a.attname
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('public.job')
      AND a.attnum > 0
      AND NOT a.attisdropped
)
SELECT NULL::text AS column_name, privilege_name
FROM table_privileges
WHERE has_table_privilege(current_user, 'public.job', privilege_name)
UNION ALL
SELECT column_name, privilege_name
FROM columns CROSS JOIN column_privileges
WHERE has_column_privilege(
    current_user, 'public.job', column_name, privilege_name
)
ORDER BY column_name NULLS FIRST, privilege_name
"""

_EXPECTED_COLUMNS = (
    ("id", "uuid", True, None),
    ("job_type", "character varying(128)", True, None),
    ("status", "character varying(32)", True, "'queued'::character varying"),
    ("idempotency_key", "character varying(255)", False, None),
    ("priority", "smallint", True, "'0'::smallint"),
    ("payload", "jsonb", True, None),
    ("result", "jsonb", False, None),
    ("progress", "double precision", True, "'0'::double precision"),
    ("attempts", "smallint", True, "'0'::smallint"),
    ("max_attempts", "smallint", True, "'5'::smallint"),
    ("available_at", "timestamp with time zone", True, "CURRENT_TIMESTAMP"),
    ("claimed_by", "character varying(128)", False, None),
    ("claimed_at", "timestamp with time zone", False, None),
    ("heartbeat_at", "timestamp with time zone", False, None),
    ("completed_at", "timestamp with time zone", False, None),
    ("error_code", "character varying(128)", False, None),
    ("error_message", "character varying(1024)", False, None),
    ("created_at", "timestamp with time zone", True, "CURRENT_TIMESTAMP"),
)
_EXPECTED_CONSTRAINTS = (
    ("ck_job_attempts", "c", "CHECK (attempts >= 0 AND attempts <= max_attempts)"),
    ("ck_job_claim_pair", "c", "CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))"),
    (
        "ck_job_claimed_by_identifier",
        "c",
        "CHECK (claimed_by IS NULL OR claimed_by::text ~ '^[a-z][a-z0-9_.-]{0,127}$'::text)",
    ),
    (
        "ck_job_completion_order",
        "c",
        "CHECK (completed_at IS NULL OR completed_at >= COALESCE(heartbeat_at, claimed_at))",
    ),
    (
        "ck_job_error_code_identifier",
        "c",
        "CHECK (error_code IS NULL OR error_code::text ~ '^[a-z][a-z0-9_.-]{0,127}$'::text)",
    ),
    (
        "ck_job_error_message_code",
        "c",
        "CHECK (error_message IS NULL OR error_code IS NOT NULL)",
    ),
    (
        "ck_job_error_state",
        "c",
        "CHECK ((status::text = ANY (ARRAY['failed'::character varying, "
        "'dead_letter'::character varying]::text[])) = (error_code IS NOT NULL))",
    ),
    (
        "ck_job_heartbeat_order",
        "c",
        "CHECK (heartbeat_at IS NULL OR heartbeat_at >= claimed_at)",
    ),
    (
        "ck_job_idempotency_key_nonempty",
        "c",
        "CHECK (idempotency_key IS NULL OR length(idempotency_key::text) > 0)",
    ),
    ("ck_job_max_attempts", "c", "CHECK (max_attempts >= 1 AND max_attempts <= 5)"),
    (
        "ck_job_payload_size",
        "c",
        "CHECK (octet_length(convert_to(payload::text, 'UTF8'::name)) <= 65536)",
    ),
    (
        "ck_job_progress",
        "c",
        "CHECK (progress >= 0::double precision AND progress <= 1::double precision)",
    ),
    (
        "ck_job_result_size",
        "c",
        "CHECK (result IS NULL OR octet_length(convert_to(result::text, 'UTF8'::name)) <= 65536)",
    ),
    (
        "ck_job_state_fields",
        "c",
        "CHECK (status::text = 'queued'::text AND claimed_by IS NULL AND "
        "heartbeat_at IS NULL AND completed_at IS NULL OR status::text = "
        "'running'::text AND claimed_by IS NOT NULL AND completed_at IS NULL OR "
        "(status::text = ANY (ARRAY['succeeded'::character varying, "
        "'failed'::character varying, 'dead_letter'::character varying]::text[])) "
        "AND claimed_by IS NOT NULL AND completed_at IS NOT NULL)",
    ),
    (
        "ck_job_status",
        "c",
        "CHECK (status::text = ANY (ARRAY['queued'::character varying, "
        "'running'::character varying, 'succeeded'::character varying, "
        "'failed'::character varying, 'dead_letter'::character varying]::text[]))",
    ),
    (
        "ck_job_type_identifier",
        "c",
        "CHECK (job_type::text ~ '^[a-z][a-z0-9_.-]{0,127}$'::text)",
    ),
    ("pk_job", "p", "PRIMARY KEY (id)"),
    ("uq_job_idempotency_key", "u", "UNIQUE (idempotency_key)"),
)
_EXPECTED_INDEXES = (
    (
        "ix_job_queue_poll",
        "CREATE INDEX ix_job_queue_poll ON public.job USING btree "
        "(priority DESC, available_at, created_at, id) "
        "WHERE ((status)::text = 'queued'::text)",
    ),
    ("pk_job", "CREATE UNIQUE INDEX pk_job ON public.job USING btree (id)"),
    (
        "uq_job_idempotency_key",
        "CREATE UNIQUE INDEX uq_job_idempotency_key ON public.job USING btree (idempotency_key)",
    ),
)
_COLUMN_NAMES = tuple(row[0] for row in _EXPECTED_COLUMNS)
_INSERT_COLUMNS = frozenset(
    {"id", "job_type", "idempotency_key", "priority", "payload", "max_attempts"}
)
_UPDATE_COLUMNS = frozenset(
    {
        "status",
        "result",
        "progress",
        "attempts",
        "available_at",
        "claimed_by",
        "claimed_at",
        "heartbeat_at",
        "completed_at",
        "error_code",
        "error_message",
    }
)
_EXPECTED_PRIVILEGES = frozenset(
    {(None, "SELECT")}
    | {(column, "SELECT") for column in _COLUMN_NAMES}
    | {(column, "INSERT") for column in _INSERT_COLUMNS}
    | {(column, "UPDATE") for column in _UPDATE_COLUMNS}
)


class StartupCompatibilityError(RuntimeError):
    """Fixed startup failure with no database or configuration evidence."""

    def __init__(self) -> None:
        super().__init__("Worker startup compatibility check failed.")

    def __repr__(self) -> str:
        return "StartupCompatibilityError(<redacted>)"


class StartupCheckSettlementUnknown(RuntimeError):
    """Checker work remained live after its one absolute lifecycle deadline."""

    def __init__(self) -> None:
        super().__init__("Worker startup check settlement is unknown.")

    def __repr__(self) -> str:
        return "StartupCheckSettlementUnknown(<redacted>)"


class _CloseOutcome(Enum):
    SUCCEEDED = auto()
    SETTLED_FAILURE = auto()
    UNSETTLED = auto()


async def check_startup_compatibility(
    engine: AsyncEngine,
    *,
    operation_wait_timeout_ms: int,
) -> None:
    """Verify exact 0001 catalog and 0002 effective privileges read-only."""
    if type(operation_wait_timeout_ms) is not int or not 100 <= operation_wait_timeout_ms <= 30_000:
        raise StartupCompatibilityError()
    loop = asyncio.get_running_loop()
    deadline = loop.time() + operation_wait_timeout_ms / 1_000
    captured_pool = engine.sync_engine.pool
    task = asyncio.create_task(
        _run_check(engine, captured_pool=captured_pool, deadline=deadline),
        name="lumina.worker.startup-check",
    )
    compatibility_failed = False
    settlement_unknown = False
    try:
        async with asyncio.timeout_at(deadline):
            await asyncio.shield(task)
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        if not task.done():
            task.cancel()
        if not await _observe_task(task, deadline=deadline):
            task.add_done_callback(_consume_task)
            settlement_unknown = True
        else:
            try:
                settlement_unknown = isinstance(
                    task.exception(),
                    StartupCheckSettlementUnknown,
                )
            except asyncio.CancelledError:
                settlement_unknown = False
            compatibility_failed = not settlement_unknown
    if settlement_unknown:
        raise StartupCheckSettlementUnknown() from None
    if compatibility_failed:
        raise StartupCompatibilityError() from None


async def _run_check(
    engine: AsyncEngine,
    *,
    captured_pool: object,
    deadline: float,
) -> None:
    connection: AsyncConnection | None = None
    safe_to_close = False
    try:
        connection = await _bounded(engine.connect(), deadline=deadline)
        transaction = await _bounded(connection.begin(), deadline=deadline)
        await _bounded(connection.execute(text(_READ_ONLY_SQL)), deadline=deadline)
        timeout = str(max(1, int((deadline - asyncio.get_running_loop().time()) * 1_000)))
        await _bounded(
            connection.execute(text(_TIMEOUT_SQL), {"timeout": timeout}),
            deadline=deadline,
        )
        baseline = tuple(
            (await _bounded(connection.execute(text(_BASELINE_SQL)), deadline=deadline)).one()
        )
        columns = tuple(
            tuple(row)
            for row in (
                await _bounded(connection.execute(text(_COLUMNS_SQL)), deadline=deadline)
            ).tuples()
        )
        raw_constraints = tuple(
            tuple(row)
            for row in (
                await _bounded(connection.execute(text(_CONSTRAINTS_SQL)), deadline=deadline)
            ).tuples()
        )
        constraints = tuple(
            (name, _constraint_kind(kind), definition) for name, kind, definition in raw_constraints
        )
        indexes = tuple(
            tuple(row)
            for row in (
                await _bounded(connection.execute(text(_INDEXES_SQL)), deadline=deadline)
            ).tuples()
        )
        privileges = frozenset(
            tuple(row)
            for row in (
                await _bounded(connection.execute(text(_PRIVILEGES_SQL)), deadline=deadline)
            ).tuples()
        )
        if (
            baseline != (1, True, True, True)
            or columns != _EXPECTED_COLUMNS
            or constraints != _EXPECTED_CONSTRAINTS
            or indexes != _EXPECTED_INDEXES
            or privileges != _EXPECTED_PRIVILEGES
        ):
            raise StartupCompatibilityError()
        await _bounded(transaction.rollback(), deadline=deadline)
        if connection.in_transaction():
            raise StartupCompatibilityError()
        safe_to_close = True
    finally:
        if connection is not None:
            await _cleanup_connection(
                connection,
                engine=engine,
                captured_pool=captured_pool,
                deadline=deadline,
                safe_to_close=safe_to_close,
            )


async def _cleanup_connection(
    connection: AsyncConnection,
    *,
    engine: AsyncEngine,
    captured_pool: object,
    deadline: float,
    safe_to_close: bool,
) -> None:
    connection_safe = safe_to_close
    if not connection_safe:
        try:
            if connection.in_transaction():
                await _bounded(connection.rollback(), deadline=deadline)
            connection_safe = not connection.in_transaction()
        except BaseException:
            connection_safe = False
    if not connection_safe:
        try:
            await _bounded(connection.invalidate(), deadline=deadline)
            connection_safe = bool(connection.invalidated)
        except BaseException:
            connection_safe = False
    if not connection_safe:
        try:
            await _bounded(engine.dispose(close=False), deadline=deadline)
            if engine.sync_engine.pool is captured_pool:
                raise StartupCheckSettlementUnknown()
            connection_safe = True
        except StartupCheckSettlementUnknown:
            raise
        except BaseException:
            raise StartupCheckSettlementUnknown() from None
    if not connection_safe:
        raise StartupCheckSettlementUnknown()

    close_outcome = await _close_connection(
        connection,
        deadline=deadline,
    )
    close_failed = close_outcome is _CloseOutcome.SETTLED_FAILURE
    settlement_unknown = close_outcome is _CloseOutcome.UNSETTLED
    if settlement_unknown:
        raise StartupCheckSettlementUnknown() from None
    if close_failed:
        raise StartupCompatibilityError() from None


async def _close_connection(
    connection: AsyncConnection,
    *,
    deadline: float,
) -> _CloseOutcome:
    """Settle close without allowing task or exception evidence to escape."""
    close_coroutine: Coroutine[Any, Any, None] | None = None
    close_task: asyncio.Task[None] | None = None
    done: set[asyncio.Task[None]] = set()
    pending: set[asyncio.Task[None]] = set()
    outcome = _CloseOutcome.SETTLED_FAILURE
    try:
        close_coroutine = connection.close()
        close_task = asyncio.create_task(
            close_coroutine,
            name="lumina.worker.startup-connection-close",
        )
    except BaseException:
        outcome = _CloseOutcome.SETTLED_FAILURE
    else:
        close_coroutine = None
        try:
            remaining = max(0.0, deadline - asyncio.get_running_loop().time())
            done, pending = await asyncio.wait((close_task,), timeout=remaining)
        except BaseException:
            if close_task.done():
                _consume_task(close_task)
                outcome = _CloseOutcome.SETTLED_FAILURE
            else:
                close_task.cancel()
                close_task.add_done_callback(_consume_task)
                outcome = _CloseOutcome.UNSETTLED
        else:
            if close_task not in done and not close_task.done():
                close_task.cancel()
                close_task.add_done_callback(_consume_task)
                outcome = _CloseOutcome.UNSETTLED
            else:
                try:
                    close_succeeded = close_task.exception() is None
                except BaseException:
                    outcome = _CloseOutcome.SETTLED_FAILURE
                else:
                    outcome = (
                        _CloseOutcome.SUCCEEDED
                        if close_succeeded
                        else _CloseOutcome.SETTLED_FAILURE
                    )
    finally:
        if close_coroutine is not None:
            with suppress(BaseException):
                close_coroutine.close()
        done.clear()
        pending.clear()
        close_coroutine = None
        close_task = None
    return outcome


async def _bounded[T](awaitable: Awaitable[T], *, deadline: float) -> T:
    async with asyncio.timeout_at(deadline):
        return await awaitable


async def _observe_task(task: asyncio.Task[None], *, deadline: float) -> bool:
    if not task.done():
        try:
            async with asyncio.timeout_at(deadline):
                await asyncio.shield(task)
        except BaseException:
            pass
    return task.done()


def _consume_task(task: asyncio.Task[object]) -> None:
    if not task.done():
        return
    with suppress(BaseException):
        task.exception()


def _constraint_kind(value: object) -> str:
    if isinstance(value, bytes):
        try:
            value = value.decode("ascii")
        except UnicodeDecodeError:
            raise StartupCompatibilityError() from None
    if value not in {"c", "p", "u"}:
        raise StartupCompatibilityError()
    return value
