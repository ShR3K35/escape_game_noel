"""Autorisation du protocole d'urgence (action 5 du boîtier Matter)

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

def upgrade() -> None:
    with op.batch_alter_table("game_state") as batch:
        batch.add_column(sa.Column("emergency_authorized", sa.Boolean(), nullable=False, server_default=sa.false()))

def downgrade() -> None:
    with op.batch_alter_table("game_state") as batch:
        batch.drop_column("emergency_authorized")
