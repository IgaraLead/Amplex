"""Database models for Amplex CRM."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# ── Organization (shared ecosystem ID) ──────────────────────


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hub_org_id: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    members: Mapped[list["OrgMember"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    contacts: Mapped[list["Contact"]] = relationship(back_populates="organization")
    stages: Mapped[list["Stage"]] = relationship(back_populates="organization")
    tags: Mapped[list["Tag"]] = relationship(back_populates="organization")
    sources: Mapped[list["Source"]] = relationship(back_populates="organization")
    lost_reasons: Mapped[list["LostReason"]] = relationship(
        back_populates="organization"
    )
    leads: Mapped[list["Lead"]] = relationship(back_populates="organization")
    custom_fields: Mapped[list["CustomField"]] = relationship(
        back_populates="organization"
    )


class OrgMember(Base):
    """Tracks which users belong to which organizations."""

    __tablename__ = "org_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(
        String(32), default="member"
    )  # 'admin' | 'member'
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_org_member"),)

    organization: Mapped["Organization"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="memberships")


# ── Users ────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hub_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    login: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_internal: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    permissions: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    hub_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    leads: Mapped[list["Lead"]] = relationship(back_populates="user")
    activities: Mapped[list["Activity"]] = relationship(back_populates="user")
    memberships: Mapped[list["OrgMember"]] = relationship(back_populates="user")


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    hub_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64))
    mobile: Mapped[Optional[str]] = mapped_column(String(64))
    is_company: Mapped[bool] = mapped_column(Boolean, default=False)
    street: Mapped[Optional[str]] = mapped_column(String(255))
    street2: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(128))
    state_name: Mapped[Optional[str]] = mapped_column(String(128))
    country_name: Mapped[Optional[str]] = mapped_column(String(128))
    vat: Mapped[Optional[str]] = mapped_column(String(32))
    website: Mapped[Optional[str]] = mapped_column(String(255))
    comment: Mapped[Optional[str]] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    hub_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    organization: Mapped["Organization"] = relationship(back_populates="contacts")
    leads: Mapped[list["Lead"]] = relationship(back_populates="contact")


class Stage(Base):
    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, default=10)
    is_won: Mapped[bool] = mapped_column(Boolean, default=False)

    organization: Mapped["Organization"] = relationship(back_populates="stages")
    leads: Mapped[list["Lead"]] = relationship(back_populates="stage")


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_tag_org_name"),)

    organization: Mapped["Organization"] = relationship(back_populates="tags")
    color: Mapped[int] = mapped_column(Integer, default=0)


lead_tags = Base.metadata.tables.get("lead_tags")
if lead_tags is None:
    from sqlalchemy import Column, Table

    lead_tags = Table(
        "lead_tags",
        Base.metadata,
        Column(
            "lead_id",
            Integer,
            ForeignKey("leads.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        Column(
            "tag_id",
            Integer,
            ForeignKey("tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    __table_args__ = (UniqueConstraint("org_id", "name", name="uq_source_org_name"),)

    organization: Mapped["Organization"] = relationship(back_populates="sources")


class LostReason(Base):
    __tablename__ = "lost_reasons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    organization: Mapped["Organization"] = relationship(back_populates="lost_reasons")


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(
        String(16), default="opportunity"
    )  # 'lead' | 'opportunity'
    contact_name: Mapped[Optional[str]] = mapped_column(String(255))
    email_from: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(64))
    expected_revenue: Mapped[float] = mapped_column(Float, default=0)
    probability: Mapped[float] = mapped_column(Float, default=0)
    priority: Mapped[str] = mapped_column(String(4), default="0")
    description: Mapped[Optional[str]] = mapped_column(Text)
    function: Mapped[Optional[str]] = mapped_column(String(128))
    street: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(128))
    state_name: Mapped[Optional[str]] = mapped_column(String(128))
    country_name: Mapped[Optional[str]] = mapped_column(String(128))
    date_deadline: Mapped[Optional[date]] = mapped_column(Date)
    date_closed: Mapped[Optional[datetime]] = mapped_column(DateTime)
    active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", index=True
    )

    stage_id: Mapped[Optional[int]] = mapped_column(ForeignKey("stages.id"))
    contact_id: Mapped[Optional[int]] = mapped_column(ForeignKey("contacts.id"))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    source_id: Mapped[Optional[int]] = mapped_column(ForeignKey("sources.id"))
    lost_reason_id: Mapped[Optional[int]] = mapped_column(ForeignKey("lost_reasons.id"))

    stage: Mapped[Optional["Stage"]] = relationship(
        back_populates="leads", lazy="joined"
    )
    contact: Mapped[Optional["Contact"]] = relationship(
        back_populates="leads", lazy="joined"
    )
    user: Mapped[Optional["User"]] = relationship(back_populates="leads", lazy="joined")
    source: Mapped[Optional["Source"]] = relationship(lazy="joined")
    lost_reason: Mapped[Optional["LostReason"]] = relationship(lazy="joined")
    organization: Mapped["Organization"] = relationship(back_populates="leads")
    tags: Mapped[list["Tag"]] = relationship(secondary="lead_tags", lazy="joined")

    interactions: Mapped[list["Interaction"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    attachments: Mapped[list["LeadAttachment"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    custom_field_values: Mapped[list["CustomFieldValue"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class Interaction(Base):
    """Timeline entries for a lead (notes, calls, emails, etc.)."""

    __tablename__ = "interactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), index=True
    )
    interaction_type: Mapped[str] = mapped_column(String(32), default="note")
    body: Mapped[Optional[str]] = mapped_column(Text)
    preview: Mapped[Optional[str]] = mapped_column(String(512))
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="interactions")
    author: Mapped[Optional["User"]] = relationship(lazy="joined")
    files: Mapped[list["InteractionFile"]] = relationship(
        back_populates="interaction", cascade="all, delete-orphan"
    )


class InteractionFile(Base):
    """Files attached to an interaction."""

    __tablename__ = "interaction_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    interaction_id: Mapped[int] = mapped_column(
        ForeignKey("interactions.id", ondelete="CASCADE")
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    mimetype: Mapped[Optional[str]] = mapped_column(String(128))

    interaction: Mapped["Interaction"] = relationship(back_populates="files")


class Activity(Base):
    """Scheduled follow-up activities on leads."""

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    activity_type: Mapped[str] = mapped_column(String(32), default="todo")
    summary: Mapped[Optional[str]] = mapped_column(String(512))
    note: Mapped[Optional[str]] = mapped_column(Text)
    date_deadline: Mapped[Optional[date]] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["Lead"] = relationship(lazy="joined")
    user: Mapped[Optional["User"]] = relationship(
        back_populates="activities", lazy="joined"
    )


class LeadAttachment(Base):
    __tablename__ = "lead_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    mimetype: Mapped[Optional[str]] = mapped_column(String(128))
    description: Mapped[Optional[str]] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["Lead"] = relationship(back_populates="attachments")


class CustomField(Base):
    __tablename__ = "custom_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(16), default="text")
    options: Mapped[Optional[str]] = mapped_column(Text)  # JSON array for select
    sequence: Mapped[int] = mapped_column(Integer, default=10)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    required: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        UniqueConstraint("org_id", "name", name="uq_custom_field_org_name"),
    )

    organization: Mapped["Organization"] = relationship(back_populates="custom_fields")

    values: Mapped[list["CustomFieldValue"]] = relationship(back_populates="field")


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), index=True
    )
    field_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("custom_fields.id", ondelete="CASCADE")
    )
    field_name: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(16), default="text")
    value: Mapped[Optional[str]] = mapped_column(Text)
    sequence: Mapped[int] = mapped_column(Integer, default=10)

    lead: Mapped["Lead"] = relationship(back_populates="custom_field_values")
    field: Mapped[Optional["CustomField"]] = relationship(back_populates="values")
