"""Schéma initial

Revision ID: 0001
Revises:
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "game_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("phase", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("phase_changed_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("tv_play_id", sa.String(40), nullable=True),
        sa.Column("tv_video_id", sa.String(60), nullable=True),
        sa.Column("tv_play_started_at", sa.DateTime(), nullable=True),
        sa.Column("tv_message_id", sa.String(40), nullable=True),
        sa.Column("tv_message_title", sa.String(120), nullable=True),
        sa.Column("tv_message_text", sa.Text(), nullable=True),
        sa.Column("tv_message_until", sa.DateTime(), nullable=True),
        sa.Column("tv_ambient", sa.String(20), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "team_progress",
        sa.Column("team_id", sa.String(40), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "kids_progress",
        sa.Column("game_id", sa.String(40), primary_key=True),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_admin", sa.Boolean(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "schedule_state",
        sa.Column("item_id", sa.String(40), primary_key=True),
        sa.Column("at_override", sa.String(5), nullable=True),
        sa.Column("enabled_override", sa.Boolean(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("fired_at", sa.DateTime(), nullable=True),
        sa.Column("note", sa.String(200), nullable=True),
    )
    op.create_table(
        "event_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ts", sa.DateTime(), nullable=False),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("message", sa.String(300), nullable=False),
        sa.Column("data", sa.JSON(), nullable=True),
    )
    op.create_index("ix_event_log_ts", "event_log", ["ts"])
    op.create_index("ix_event_log_type", "event_log", ["type"])
    op.create_table(
        "processed_command",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("response", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("processed_command")
    op.drop_index("ix_event_log_type", "event_log")
    op.drop_index("ix_event_log_ts", "event_log")
    op.drop_table("event_log")
    op.drop_table("schedule_state")
    op.drop_table("kids_progress")
    op.drop_table("team_progress")
    op.drop_table("game_state")
