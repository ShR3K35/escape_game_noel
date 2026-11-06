"""La tournée du traîneau (endless runner) remplace les cadeaux mélangés

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-06
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Le 3e mini-jeu change : sa ligne est reprise (réussite et statistiques conservées), l'étape repart de zéro.
    op.execute("UPDATE kids_progress SET game_id = 'tournee', step = 0, data = NULL WHERE game_id = 'cadeaux'")


def downgrade() -> None:
    op.execute("UPDATE kids_progress SET game_id = 'cadeaux', step = 0, data = NULL WHERE game_id = 'tournee'")
