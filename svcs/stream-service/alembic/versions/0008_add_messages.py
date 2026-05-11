"""add messages table

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-05

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Threading via self-referenced thread_id: the first message in a thread
    # uses its own id as thread_id; replies copy the same thread_id. This
    # keeps queries simple (one table, indexed by thread_id) and avoids a
    # separate threads table for what's effectively a 1:N grouping.
    op.create_table(
        "messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "thread_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("sender_user_id", sa.Text(), nullable=False),
        sa.Column("recipient_user_id", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        schema="drone_space",
    )

    # Unread inbox lookups — partial index; only rows that haven't been
    # read are interesting for the badge count.
    op.create_index(
        "messages_recipient_unread_idx",
        "messages",
        ["recipient_user_id"],
        unique=False,
        schema="drone_space",
        postgresql_where=sa.text("read_at IS NULL"),
    )
    # Thread reconstruction (chronological).
    op.create_index(
        "messages_thread_idx",
        "messages",
        ["thread_id", "created_at"],
        schema="drone_space",
    )
    # Inbox & sent listings.
    op.create_index(
        "messages_recipient_idx",
        "messages",
        ["recipient_user_id"],
        schema="drone_space",
    )
    op.create_index(
        "messages_sender_idx",
        "messages",
        ["sender_user_id"],
        schema="drone_space",
    )


def downgrade() -> None:
    op.drop_index("messages_sender_idx", table_name="messages", schema="drone_space")
    op.drop_index("messages_recipient_idx", table_name="messages", schema="drone_space")
    op.drop_index("messages_thread_idx", table_name="messages", schema="drone_space")
    op.drop_index(
        "messages_recipient_unread_idx", table_name="messages", schema="drone_space"
    )
    op.drop_table("messages", schema="drone_space")
