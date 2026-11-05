"""La machine à cadeaux remplace les traces des rennes

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-05
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("kids_progress") as batch:
        batch.add_column(sa.Column("data", sa.JSON(), nullable=True))
    # Le 2e mini-jeu change : sa ligne est reprise (réussite et statistiques conservées), l'étape repart de zéro.
    # Les questions sont tirées au démarrage suivant.
    op.execute("UPDATE kids_progress SET game_id = 'machine', step = 0 WHERE game_id = 'traces'")


def downgrade() -> None:
    op.execute("UPDATE kids_progress SET game_id = 'traces', step = 0 WHERE game_id = 'machine'")
    with op.batch_alter_table("kids_progress") as batch:
        batch.drop_column("data")
