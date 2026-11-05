"""Affichage de l'avancement sur la TV

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("game_state") as batch:
        batch.add_column(sa.Column("tv_show_progress", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    with op.batch_alter_table("game_state") as batch:
        batch.drop_column("tv_show_progress")
