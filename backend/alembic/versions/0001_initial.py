"""initial

Revision ID: 0001
Revises:
Create Date: 2026-04-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True, server_default="inspector"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # defect_types
    op.create_table(
        "defect_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("system", sa.String(), nullable=False),
        sa.Column("system_name", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("default_criticality", sa.String(), nullable=False),
        sa.Column("norm_references", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.UniqueConstraint("code", name="uq_defect_types_code"),
    )

    # analyses
    op.create_table(
        "analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("object_name", sa.String(), nullable=False),
        sa.Column("shot_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )

    # analysis_photos
    op.create_table(
        "analysis_photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "analysis_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("analyses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("original_key", sa.String(), nullable=False),
        sa.Column("annotated_key", sa.String(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
    )

    # defects
    op.create_table(
        "defects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "photo_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("analysis_photos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "defect_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("defect_types.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("criticality", sa.String(), nullable=False),
        sa.Column("bbox_x", sa.Float(), nullable=False),
        sa.Column("bbox_y", sa.Float(), nullable=False),
        sa.Column("bbox_w", sa.Float(), nullable=False),
        sa.Column("bbox_h", sa.Float(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("consequences", sa.Text(), nullable=False),
        sa.Column("norm_references", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("recommendations", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("defects")
    op.drop_table("analysis_photos")
    op.drop_table("analyses")
    op.drop_table("defect_types")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
