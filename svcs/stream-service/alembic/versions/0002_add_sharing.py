"""add visibility + video / folder sharing

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-04

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Visibility flag on videos.
    op.add_column(
        "videos",
        sa.Column(
            "visibility",
            sa.Text(),
            nullable=False,
            server_default="private",
        ),
        schema="drone_space",
    )
    op.create_check_constraint(
        "videos_visibility_check",
        "videos",
        "visibility IN ('public', 'private')",
        schema="drone_space",
    )

    # 2. Per-video shares.
    op.create_table(
        "video_shares",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "video_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("drone_space.videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("shared_with_user_id", sa.Text(), nullable=False),
        sa.Column("shared_by_user_id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "video_id",
            "shared_with_user_id",
            name="video_shares_unique",
        ),
        schema="drone_space",
    )
    op.create_index(
        "video_shares_with_idx",
        "video_shares",
        ["shared_with_user_id"],
        schema="drone_space",
    )

    # 3. Per-folder shares (cascade: matching path or descendant path).
    op.create_table(
        "folder_shares",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("owner_user_id", sa.Text(), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False),
        sa.Column("shared_with_user_id", sa.Text(), nullable=False),
        sa.Column("shared_by_user_id", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "owner_user_id",
            "folder_path",
            "shared_with_user_id",
            name="folder_shares_unique",
        ),
        schema="drone_space",
    )
    op.create_index(
        "folder_shares_with_idx",
        "folder_shares",
        ["shared_with_user_id"],
        schema="drone_space",
    )


def downgrade() -> None:
    op.drop_index(
        "folder_shares_with_idx",
        table_name="folder_shares",
        schema="drone_space",
    )
    op.drop_table("folder_shares", schema="drone_space")
    op.drop_index(
        "video_shares_with_idx",
        table_name="video_shares",
        schema="drone_space",
    )
    op.drop_table("video_shares", schema="drone_space")
    op.drop_constraint(
        "videos_visibility_check",
        "videos",
        schema="drone_space",
    )
    op.drop_column("videos", "visibility", schema="drone_space")
