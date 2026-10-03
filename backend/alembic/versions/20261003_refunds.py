"""refunds

Revision ID: e1d8a311392b
Revises: 5cedd5005463
Create Date: 2026-10-03 13:09:18.456600

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1d8a311392b'
down_revision: Union[str, Sequence[str], None] = '5cedd5005463'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ADD VALUE can't run inside a transaction block on older Postgres versions.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded' AFTER 'shipped'")
    op.add_column("orders", sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("orders", "refunded_at")
    # Postgres can't drop an enum value: rebuild the type without it.
    op.execute("UPDATE orders SET status = 'cancelled' WHERE status = 'refunded'")
    op.execute("ALTER TYPE order_status RENAME TO order_status_old")
    op.execute("CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'cancelled', 'expired')")
    op.execute(
        "ALTER TABLE orders ALTER COLUMN status TYPE order_status USING status::text::order_status"
    )
    op.execute("DROP TYPE order_status_old")
