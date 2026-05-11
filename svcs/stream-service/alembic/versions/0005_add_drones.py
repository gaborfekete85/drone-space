"""add drones table + videos.drone_id

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-05

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "drones",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("brand", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("nickname", sa.Text(), nullable=True),
        sa.Column("weight_g", sa.Double(), nullable=True),
        sa.Column("max_flight_time_min", sa.Integer(), nullable=True),
        sa.Column("year_acquired", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        # Stored filename only (e.g. "abc.jpg"); the absolute path is derived
        # from APP_DATA_ROOT / user_data / <user_id> / drones / <photo_filename>.
        sa.Column("photo_filename", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="drone_space",
    )
    op.create_index(
        "drones_user_idx",
        "drones",
        ["user_id"],
        schema="drone_space",
    )

    # Tie a video to the drone it was flown with. ON DELETE SET NULL so that
    # deleting a drone doesn't cascade-delete the user's footage — the videos
    # just lose their drone reference.
    op.add_column(
        "videos",
        sa.Column(
            "drone_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        schema="drone_space",
    )
    op.create_foreign_key(
        "videos_drone_id_fkey",
        source_table="videos",
        referent_table="drones",
        local_cols=["drone_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
        source_schema="drone_space",
        referent_schema="drone_space",
    )
    op.create_index(
        "videos_drone_idx",
        "videos",
        ["drone_id"],
        schema="drone_space",
    )


def downgrade() -> None:
    op.drop_index("videos_drone_idx", table_name="videos", schema="drone_space")
    op.drop_constraint(
        "videos_drone_id_fkey", "videos", type_="foreignkey", schema="drone_space"
    )
    op.drop_column("videos", "drone_id", schema="drone_space")
    op.drop_index("drones_user_idx", table_name="drones", schema="drone_space")
    op.drop_table("drones", schema="drone_space")
