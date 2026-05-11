"""add marketplace columns to drones

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-05

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `status` drives marketplace visibility. NOT NULL with default 'OWNED'
    # so existing drones don't need a backfill — same pattern as
    # videos.visibility in 0002.
    op.add_column(
        "drones",
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default="OWNED",
        ),
        schema="drone_space",
    )
    op.create_check_constraint(
        "drones_status_check",
        "drones",
        "status IN ('OWNED', 'SELLING')",
        schema="drone_space",
    )

    # Numeric for price — float would lose pennies on FX/rounding.
    op.add_column(
        "drones",
        sa.Column("sale_price", sa.Numeric(12, 2), nullable=True),
        schema="drone_space",
    )
    op.add_column(
        "drones",
        sa.Column("sale_currency", sa.Text(), nullable=True),
        schema="drone_space",
    )
    op.add_column(
        "drones",
        sa.Column(
            "listed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        schema="drone_space",
    )

    # Marketplace ordering — partial index so OWNED rows don't bloat the
    # tree (most rows long-term, presumably).
    op.create_index(
        "drones_marketplace_idx",
        "drones",
        [sa.text("listed_at DESC")],
        schema="drone_space",
        postgresql_where=sa.text("status = 'SELLING'"),
    )


def downgrade() -> None:
    op.drop_index(
        "drones_marketplace_idx", table_name="drones", schema="drone_space"
    )
    op.drop_column("drones", "listed_at", schema="drone_space")
    op.drop_column("drones", "sale_currency", schema="drone_space")
    op.drop_column("drones", "sale_price", schema="drone_space")
    op.drop_constraint(
        "drones_status_check", "drones", type_="check", schema="drone_space"
    )
    op.drop_column("drones", "status", schema="drone_space")
