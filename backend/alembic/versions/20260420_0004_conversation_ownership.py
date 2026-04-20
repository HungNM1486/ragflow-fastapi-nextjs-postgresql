"""conversation ownership and metadata

Revision ID: 20260420_0004
Revises: 20260420_0003
Create Date: 2026-04-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260420_0004"
down_revision: Union[str, None] = "20260420_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("user_uid", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column(
            "title",
            sa.String(length=200),
            nullable=False,
            server_default=sa.text("'Web'"),
        ),
    )
    op.add_column(
        "conversations",
        sa.Column(
            "last_active_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_conversations_user_uid", "conversations", ["user_uid"], unique=False)
    op.create_foreign_key(
        "fk_conversations_user_uid_users",
        "conversations",
        "users",
        ["user_uid"],
        ["uid"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_conversations_user_uid_users", "conversations", type_="foreignkey")
    op.drop_index("ix_conversations_user_uid", table_name="conversations")
    op.drop_column("conversations", "last_active_at")
    op.drop_column("conversations", "title")
    op.drop_column("conversations", "user_uid")
