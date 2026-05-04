"""create videos table

Revision ID: 0001
Revises:
Create Date: 2026-05-03

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema is created by db/init/01-create-schema.sql, but be defensive in
    # case migrations are run against a fresh database (e.g. CI, tests).
    op.execute("CREATE SCHEMA IF NOT EXISTS drone_space")

    op.create_table(
        "videos",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False, server_default=""),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("cover_filename", sa.Text(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Double(), nullable=True),
        sa.Column("longitude", sa.Double(), nullable=True),
        sa.Column("height_m", sa.Double(), nullable=True),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("drone_type", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.Text(), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "user_id",
            "folder_path",
            "filename",
            name="videos_user_path_filename_unique",
        ),
        schema="drone_space",
    )
    op.create_index(
        "videos_user_idx",
        "videos",
        ["user_id"],
        schema="drone_space",
    )
    op.create_index(
        "videos_user_folder_idx",
        "videos",
        ["user_id", "folder_path"],
        schema="drone_space",
    )


def downgrade() -> None:
    op.drop_index(
        "videos_user_folder_idx", table_name="videos", schema="drone_space"
    )
    op.drop_index("videos_user_idx", table_name="videos", schema="drone_space")
    op.drop_table("videos", schema="drone_space")
