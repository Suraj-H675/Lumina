"""Create the minimal durable job table.

Revision ID: 0001_create_job
Revises: None
Create Date: 2026-07-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_create_job"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create only the job queue storage and its polling index."""
    op.create_table(
        "job",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_type", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="queued"),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("priority", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0"),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.SmallInteger(), nullable=False, server_default="5"),
        sa.Column(
            "available_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("claimed_by", sa.String(length=128), nullable=True),
        sa.Column("claimed_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("heartbeat_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=128), nullable=True),
        sa.Column("error_message", sa.String(length=1024), nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_job"),
        sa.UniqueConstraint("idempotency_key", name="uq_job_idempotency_key"),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter')",
            name="ck_job_status",
        ),
        sa.CheckConstraint("job_type ~ '^[a-z][a-z0-9_.-]{0,127}$'", name="ck_job_type_identifier"),
        sa.CheckConstraint(
            "idempotency_key IS NULL OR length(idempotency_key) > 0",
            name="ck_job_idempotency_key_nonempty",
        ),
        sa.CheckConstraint(
            "octet_length(convert_to(payload::text, 'UTF8')) <= 65536",
            name="ck_job_payload_size",
        ),
        sa.CheckConstraint(
            "result IS NULL OR octet_length(convert_to(result::text, 'UTF8')) <= 65536",
            name="ck_job_result_size",
        ),
        sa.CheckConstraint("progress >= 0 AND progress <= 1", name="ck_job_progress"),
        sa.CheckConstraint("attempts >= 0 AND attempts <= max_attempts", name="ck_job_attempts"),
        sa.CheckConstraint("max_attempts >= 1 AND max_attempts <= 5", name="ck_job_max_attempts"),
        sa.CheckConstraint("(claimed_by IS NULL) = (claimed_at IS NULL)", name="ck_job_claim_pair"),
        sa.CheckConstraint(
            "claimed_by IS NULL OR claimed_by ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_job_claimed_by_identifier",
        ),
        sa.CheckConstraint(
            "heartbeat_at IS NULL OR heartbeat_at >= claimed_at", name="ck_job_heartbeat_order"
        ),
        sa.CheckConstraint(
            "completed_at IS NULL OR completed_at >= COALESCE(heartbeat_at, claimed_at)",
            name="ck_job_completion_order",
        ),
        sa.CheckConstraint(
            "(status = 'queued' AND claimed_by IS NULL AND heartbeat_at IS NULL "
            "AND completed_at IS NULL) OR (status = 'running' AND claimed_by IS NOT NULL "
            "AND completed_at IS NULL) OR (status IN ('succeeded', 'failed', 'dead_letter') "
            "AND claimed_by IS NOT NULL AND completed_at IS NOT NULL)",
            name="ck_job_state_fields",
        ),
        sa.CheckConstraint(
            "error_code IS NULL OR error_code ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_job_error_code_identifier",
        ),
        sa.CheckConstraint(
            "error_message IS NULL OR error_code IS NOT NULL", name="ck_job_error_message_code"
        ),
        sa.CheckConstraint(
            "(status IN ('failed', 'dead_letter')) = (error_code IS NOT NULL)",
            name="ck_job_error_state",
        ),
    )
    op.create_index(
        "ix_job_queue_poll",
        "job",
        [
            sa.text("priority DESC"),
            sa.text("available_at ASC"),
            sa.text("created_at ASC"),
            sa.text("id ASC"),
        ],
        unique=False,
        postgresql_where=sa.text("status = 'queued'"),
    )


def downgrade() -> None:
    """Remove only the queue index and job table created by this revision."""
    op.drop_index("ix_job_queue_poll", table_name="job")
    op.drop_table("job")
