"""add profile_image_filename to user_profile

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-05

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Filename of the uploaded avatar (e.g. "profile.jpg"). The file lives at
    # app_data/user_data/<user_id>/<profile_image_filename>. NULL means no
    # custom upload — UI falls back to the Clerk social-login image.
    op.add_column(
        "user_profile",
        sa.Column("profile_image_filename", sa.Text(), nullable=True),
        schema="drone_space",
    )


def downgrade() -> None:
    op.drop_column("user_profile", "profile_image_filename", schema="drone_space")
