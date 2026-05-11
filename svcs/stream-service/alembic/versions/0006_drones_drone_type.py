"""add drone_type to drones

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-05

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOT NULL with a 'video' default so any pre-existing drone rows get a
    # sensible value without backfill — same pattern as videos.visibility in
    # migration 0002.
    op.add_column(
        "drones",
        sa.Column(
            "drone_type",
            sa.Text(),
            nullable=False,
            server_default="video",
        ),
        schema="drone_space",
    )
    op.create_check_constraint(
        "drones_drone_type_check",
        "drones",
        "drone_type IN ('video', 'fpv')",
        schema="drone_space",
    )


def downgrade() -> None:
    op.drop_constraint(
        "drones_drone_type_check", "drones", type_="check", schema="drone_space"
    )
    op.drop_column("drones", "drone_type", schema="drone_space")
