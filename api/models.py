"""Django ORM models for Amplex CRM.

Amplex-owned tables use db_table="amplex_*" to coexist in the shared
igaralead database. Hub shared tables use managed=False.
"""

from django.db import models

# ══════════════════════════════════════════════════════════
#  Hub shared tables (read-only, managed=False)
# ══════════════════════════════════════════════════════════


class SharedOrganization(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.CharField(max_length=200)
    slug = models.CharField(max_length=100, unique=True)
    cnpj = models.CharField(max_length=18, blank=True, null=True)
    active_products = models.JSONField(default=dict)
    settings = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "organizations"


class SharedUser(models.Model):
    id = models.UUIDField(primary_key=True)
    email = models.EmailField(max_length=255, unique=True)
    name = models.CharField(max_length=200)
    password_hash = models.CharField(max_length=255)
    roles = models.JSONField(default=list)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "users"


class SharedMembership(models.Model):
    organization_id = models.UUIDField()
    user_id = models.UUIDField()
    role = models.CharField(max_length=30, default="member")
    platform_roles = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "org_members"


class SharedSubscription(models.Model):
    organization_id = models.UUIDField()
    plan_id = models.IntegerField(null=True, blank=True)
    amplex_users = models.IntegerField(default=0)
    nexus_users = models.IntegerField(default=0)
    nexus_channels = models.IntegerField(default=0)
    entity_credit_tier = models.CharField(max_length=20, blank=True, null=True)
    entity_credits = models.IntegerField(default=0)
    base_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    final_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, default="active")
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "subscriptions"


# ══════════════════════════════════════════════════════════
#  Amplex-owned tables (amplex_* prefix)
# ══════════════════════════════════════════════════════════


class AmplexOrganization(models.Model):
    hub_org_id = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    slug = models.CharField(max_length=100, unique=True, db_index=True, default="")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "amplex_organizations"

    def __str__(self):
        return self.name


class AmplexUser(models.Model):
    hub_id = models.CharField(max_length=64, unique=True, null=True, db_index=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(max_length=255, unique=True, db_index=True)
    login = models.CharField(max_length=255, unique=True, db_index=True)
    active = models.BooleanField(default=True)
    is_internal = models.BooleanField(default=True)
    permissions = models.JSONField(null=True, blank=True)
    hub_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "amplex_users"

    def __str__(self):
        return self.email


class AmplexOrgMember(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="members"
    )
    user = models.ForeignKey(
        AmplexUser, on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=32, default="member")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "amplex_org_members"
        unique_together = [("org", "user")]


class Contact(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="contacts"
    )
    hub_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(max_length=255, null=True, blank=True, db_index=True)
    phone = models.CharField(max_length=64, null=True, blank=True)
    mobile = models.CharField(max_length=64, null=True, blank=True)
    is_company = models.BooleanField(default=False)
    street = models.CharField(max_length=255, null=True, blank=True)
    street2 = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=128, null=True, blank=True)
    state_name = models.CharField(max_length=128, null=True, blank=True)
    country_name = models.CharField(max_length=128, null=True, blank=True)
    vat = models.CharField(max_length=32, null=True, blank=True)
    website = models.CharField(max_length=255, null=True, blank=True)
    comment = models.TextField(null=True, blank=True)
    active = models.BooleanField(default=True)
    hub_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "amplex_contacts"

    def __str__(self):
        return self.name


class Stage(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="stages"
    )
    name = models.CharField(max_length=128)
    sequence = models.IntegerField(default=10)
    is_won = models.BooleanField(default=False)

    class Meta:
        db_table = "amplex_stages"
        ordering = ["sequence"]

    def __str__(self):
        return self.name


class Tag(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="tags"
    )
    name = models.CharField(max_length=64)
    color = models.IntegerField(default=0)

    class Meta:
        db_table = "amplex_tags"
        unique_together = [("org", "name")]

    def __str__(self):
        return self.name


class Source(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="sources"
    )
    name = models.CharField(max_length=128)

    class Meta:
        db_table = "amplex_sources"
        unique_together = [("org", "name")]

    def __str__(self):
        return self.name


class LostReason(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="lost_reasons"
    )
    name = models.CharField(max_length=255)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "amplex_lost_reasons"

    def __str__(self):
        return self.name


class Lead(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="leads"
    )
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=16, default="opportunity")
    contact_name = models.CharField(max_length=255, null=True, blank=True)
    email_from = models.EmailField(max_length=255, null=True, blank=True, db_index=True)
    phone = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    mobile = models.CharField(max_length=64, null=True, blank=True)
    expected_revenue = models.FloatField(default=0)
    probability = models.FloatField(default=0)
    priority = models.CharField(max_length=4, default="0")
    description = models.TextField(null=True, blank=True)
    function = models.CharField(max_length=128, null=True, blank=True)
    street = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=128, null=True, blank=True)
    state_name = models.CharField(max_length=128, null=True, blank=True)
    country_name = models.CharField(max_length=128, null=True, blank=True)
    date_deadline = models.DateField(null=True, blank=True)
    date_closed = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True, db_index=True)

    stage = models.ForeignKey(
        Stage, on_delete=models.SET_NULL, null=True, blank=True, related_name="leads"
    )
    contact = models.ForeignKey(
        Contact, on_delete=models.SET_NULL, null=True, blank=True, related_name="leads"
    )
    user = models.ForeignKey(
        AmplexUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leads",
    )
    source = models.ForeignKey(Source, on_delete=models.SET_NULL, null=True, blank=True)
    lost_reason = models.ForeignKey(
        LostReason, on_delete=models.SET_NULL, null=True, blank=True
    )
    tags = models.ManyToManyField(Tag, blank=True, related_name="leads")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "amplex_leads"

    def __str__(self):
        return self.name


class Interaction(models.Model):
    """Timeline entries for a lead (notes, calls, emails, etc.)."""

    lead = models.ForeignKey(
        Lead, on_delete=models.CASCADE, related_name="interactions"
    )
    interaction_type = models.CharField(max_length=32, default="note")
    body = models.TextField(null=True, blank=True)
    preview = models.CharField(max_length=512, null=True, blank=True)
    author = models.ForeignKey(
        AmplexUser, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "amplex_interactions"


class InteractionFile(models.Model):
    interaction = models.ForeignKey(
        Interaction, on_delete=models.CASCADE, related_name="files"
    )
    filename = models.CharField(max_length=512)
    storage_path = models.CharField(max_length=1024)
    file_size = models.IntegerField(default=0)
    mimetype = models.CharField(max_length=128, null=True, blank=True)

    class Meta:
        db_table = "amplex_interaction_files"


class Activity(models.Model):
    """Scheduled follow-up activities on leads."""

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="activities")
    user = models.ForeignKey(
        AmplexUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activities",
    )
    activity_type = models.CharField(max_length=32, default="todo")
    summary = models.CharField(max_length=512, null=True, blank=True)
    note = models.TextField(null=True, blank=True)
    date_deadline = models.DateField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "amplex_activities"


class LeadAttachment(models.Model):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="attachments")
    filename = models.CharField(max_length=512)
    storage_path = models.CharField(max_length=1024)
    file_size = models.IntegerField(default=0)
    mimetype = models.CharField(max_length=128, null=True, blank=True)
    description = models.CharField(max_length=512, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "amplex_lead_attachments"


class CustomField(models.Model):
    org = models.ForeignKey(
        AmplexOrganization, on_delete=models.CASCADE, related_name="custom_fields"
    )
    name = models.CharField(max_length=255)
    field_type = models.CharField(max_length=16, default="text")
    options = models.TextField(null=True, blank=True)
    sequence = models.IntegerField(default=10)
    active = models.BooleanField(default=True)
    required = models.BooleanField(default=False)

    class Meta:
        db_table = "amplex_custom_fields"
        unique_together = [("org", "name")]


class CustomFieldValue(models.Model):
    lead = models.ForeignKey(
        Lead, on_delete=models.CASCADE, related_name="custom_field_values"
    )
    field = models.ForeignKey(
        CustomField,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="values",
    )
    field_name = models.CharField(max_length=255)
    field_type = models.CharField(max_length=16, default="text")
    value = models.TextField(null=True, blank=True)
    sequence = models.IntegerField(default=10)

    class Meta:
        db_table = "amplex_custom_field_values"
