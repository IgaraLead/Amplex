"""Shared database models (igaralead DB).

Read-only models mapping to Hub-managed tables in the shared ``igaralead``
database. All platforms read from these; Hub is the primary writer.
"""

import uuid

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from app.database import SharedBase


class SharedOrganization(SharedBase):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    cnpj: Mapped[str | None] = mapped_column(String(18))
    active_products: Mapped[dict] = mapped_column(JSON, default=dict)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now())

    members: Mapped[list["SharedMembership"]] = relationship(
        back_populates="organization", viewonly=True,
    )
    subscriptions: Mapped[list["SharedSubscription"]] = relationship(
        back_populates="organization", viewonly=True,
    )


class SharedUser(SharedBase):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    roles: Mapped[dict] = mapped_column(JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now())

    memberships: Mapped[list["SharedMembership"]] = relationship(
        back_populates="user", viewonly=True,
    )


class SharedMembership(SharedBase):
    __tablename__ = "org_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False,
    )
    role: Mapped[str] = mapped_column(String(30), default="member")
    platform_roles: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at = mapped_column(DateTime, server_default=func.now())

    organization: Mapped["SharedOrganization"] = relationship(
        back_populates="members", viewonly=True,
        primaryjoin="SharedMembership.organization_id == SharedOrganization.id",
        foreign_keys="SharedMembership.organization_id",
    )
    user: Mapped["SharedUser"] = relationship(
        back_populates="memberships", viewonly=True,
        primaryjoin="SharedMembership.user_id == SharedUser.id",
        foreign_keys="SharedMembership.user_id",
    )


class SharedSubscription(SharedBase):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), nullable=False,
    )
    plan_id: Mapped[int | None] = mapped_column(Integer)
    amplex_users: Mapped[int] = mapped_column(Integer, default=0)
    nexus_users: Mapped[int] = mapped_column(Integer, default=0)
    nexus_channels: Mapped[int] = mapped_column(Integer, default=0)
    entity_credit_tier: Mapped[str | None] = mapped_column(String(20))
    entity_credits: Mapped[int] = mapped_column(Integer, default=0)
    base_price = mapped_column(Numeric(10, 2), default=0)
    final_price = mapped_column(Numeric(10, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")
    started_at = mapped_column(DateTime, server_default=func.now())
    expires_at = mapped_column(DateTime, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
    updated_at = mapped_column(DateTime, server_default=func.now())

    organization: Mapped["SharedOrganization"] = relationship(
        back_populates="subscriptions", viewonly=True,
        primaryjoin="SharedSubscription.organization_id == SharedOrganization.id",
        foreign_keys="SharedSubscription.organization_id",
    )
