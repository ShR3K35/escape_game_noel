"""Compte à rebours avant la vidéo d'introduction

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("game_state") as batch:
        batch.add_column(sa.Column("intro_countdown_until", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("game_state") as batch:
        batch.drop_column("intro_countdown_until")
