"""Points bonus des équipes (missions personnelles des joueurs)

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-07
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

def upgrade() -> None:
    with op.batch_alter_table("team_progress") as batch:
        batch.add_column(sa.Column("bonus", sa.Integer(), nullable=False, server_default="0"))

def downgrade() -> None:
    with op.batch_alter_table("team_progress") as batch:
        batch.drop_column("bonus")
