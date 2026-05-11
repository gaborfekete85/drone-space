"""add geo extensions + earth index on user_profile

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-05

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # earthdistance is not a "trusted" extension — the connecting role needs
    # superuser or CREATE on the database. Locally that's `drone` (the docker
    # bootstrap superuser). On managed Postgres these are typically pre-
    # installed, so IF NOT EXISTS makes this a no-op.
    op.execute("CREATE EXTENSION IF NOT EXISTS cube")
    op.execute("CREATE EXTENSION IF NOT EXISTS earthdistance")

    # GIST on the earth point makes the bbox prefilter (`earth_box @> …`) fast.
    # Partial index — rows without coordinates would otherwise force NULL
    # branches into the tree for no benefit.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS user_profile_earth_idx
          ON drone_space.user_profile
          USING gist (ll_to_earth(latitude, longitude))
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS drone_space.user_profile_earth_idx"
    )
    # Intentionally do NOT drop cube/earthdistance — other code may grow to
    # depend on them, and dropping a contrib extension is irreversible enough
    # to want a human in the loop.
