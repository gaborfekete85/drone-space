"""extend user_profile with personal info + social_links

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-05

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Personal text fields. All nullable — a brand-new user only has
    # location-derived data; we don't want to force them through a profile
    # editor before they can use the app.
    op.add_column(
        "user_profile",
        sa.Column("display_name", sa.Text(), nullable=True),
        schema="drone_space",
    )
    op.add_column(
        "user_profile",
        sa.Column("nickname", sa.Text(), nullable=True),
        schema="drone_space",
    )
    op.add_column(
        "user_profile",
        sa.Column("description", sa.Text(), nullable=True),
        schema="drone_space",
    )
    op.add_column(
        "user_profile",
        sa.Column("country", sa.Text(), nullable=True),
        schema="drone_space",
    )
    op.add_column(
        "user_profile",
        sa.Column("city", sa.Text(), nullable=True),
        schema="drone_space",
    )
    # JSONB so platforms can be added without migrations. Shape is a flat
    # object: {"youtube": "https://…", "linkedin": "…", …}.
    op.add_column(
        "user_profile",
        sa.Column(
            "social_links",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        schema="drone_space",
    )


def downgrade() -> None:
    op.drop_column("user_profile", "social_links", schema="drone_space")
    op.drop_column("user_profile", "city", schema="drone_space")
    op.drop_column("user_profile", "country", schema="drone_space")
    op.drop_column("user_profile", "description", schema="drone_space")
    op.drop_column("user_profile", "nickname", schema="drone_space")
    op.drop_column("user_profile", "display_name", schema="drone_space")
