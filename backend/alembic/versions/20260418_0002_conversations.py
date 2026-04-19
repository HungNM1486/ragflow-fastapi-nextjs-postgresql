"""conversations and chat_messages

Revision ID: 20260418_0002
Revises: 20260418_0001
Create Date: 2026-04-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260418_0002"
down_revision: Union[str, None] = "20260418_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("uid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ragflow_session_id", sa.String(length=64), nullable=False),
        sa.Column("ragflow_chat_id", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("uid"),
    )
    op.create_index(
        "ix_conversations_ragflow_session_id",
        "conversations",
        ["ragflow_session_id"],
        unique=False,
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conversation_uid", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["conversation_uid"],
            ["conversations.uid"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chat_messages_conversation_uid",
        "chat_messages",
        ["conversation_uid"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_conversation_uid", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_conversations_ragflow_session_id", table_name="conversations")
    op.drop_table("conversations")
