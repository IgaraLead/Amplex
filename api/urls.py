"""API URL routing — RESTful patterns matching frontend expectations."""

from django.urls import path
from django.views.decorators.http import require_http_methods

from .views import (
    attachments,
    auth,
    config,
    contacts,
    custom_fields,
    dashboard,
    export,
    health_check,
    hub_users,
    integrations,
    interactions,
    leads,
    lost_reasons,
    notifications,
    orgs,
    permissions,
    pipeline,
    s2s,
    sources,
    stages,
    tags,
    users,
)


def _dispatch(**methods):
    """Create a view that dispatches by HTTP method."""
    allowed = [m.upper() for m in methods]

    @require_http_methods(allowed)
    def view(request, *args, **kwargs):
        handler = methods.get(request.method)
        if handler:
            return handler(request, *args, **kwargs)
        return None

    return view


urlpatterns = [
    # Health
    path("health", health_check, name="health"),
    # Auth
    path("auth/login", auth.login, name="auth-login"),
    path("auth/refresh", auth.refresh, name="auth-refresh"),
    path("auth/me", auth.me, name="auth-me"),
    path("auth/logout", auth.logout, name="auth-logout"),
    # Config
    path("config", config.get_config, name="config"),
    path("id/<slug:slug>/crm/config", config.get_scoped_config, name="config-scoped"),
    # Orgs (no org context)
    path(
        "orgs",
        _dispatch(GET=orgs.list_my_orgs, POST=orgs.create_org),
        name="orgs",
    ),
    # S2S (API key protected, no org context)
    path("metrics", s2s.metrics, name="s2s-metrics"),
    path("opportunities", s2s.create_opportunity, name="s2s-opportunity"),
    path(
        "opportunities/<int:opp_id>",
        s2s.get_opportunity,
        name="s2s-opportunity-detail",
    ),
    path(
        "opportunities/<int:opp_id>/stage",
        s2s.update_opportunity_stage,
        name="s2s-opportunity-stage",
    ),
    path("contacts/search", s2s.search_contacts, name="s2s-contacts-search"),
    path("contacts/import", s2s.import_contacts, name="s2s-import-contacts"),
    # === Org-scoped CRM routes ===
    # Org management
    path("id/<slug:slug>/org/update", orgs.update_org, name="org-update"),
    path("id/<slug:slug>/org/members", orgs.list_members, name="org-members"),
    path("id/<slug:slug>/org/members/add", orgs.add_member, name="org-member-add"),
    path(
        "id/<slug:slug>/org/members/<int:user_id>/remove",
        orgs.remove_member,
        name="org-member-remove",
    ),
    # Hub users (admin proxy)
    path(
        "id/<slug:slug>/hub-users",
        _dispatch(GET=hub_users.list_hub_users, POST=hub_users.create_hub_user),
        name="hub-users",
    ),
    path(
        "id/<slug:slug>/hub-users/<str:hub_user_id>",
        _dispatch(PUT=hub_users.update_hub_user, DELETE=hub_users.deactivate_hub_user),
        name="hub-users-detail",
    ),
    # Dashboard
    path("id/<slug:slug>/crm/dashboard", dashboard.dashboard, name="dashboard"),
    path(
        "id/<slug:slug>/crm/dashboard/advanced",
        dashboard.dashboard_advanced,
        name="dashboard-advanced",
    ),
    path(
        "id/<slug:slug>/crm/dashboard/next-contacts",
        dashboard.next_contacts,
        name="dashboard-next-contacts",
    ),
    # Pipeline
    path("id/<slug:slug>/crm/pipeline", pipeline.pipeline, name="pipeline"),
    # Leads
    path(
        "id/<slug:slug>/crm/leads",
        _dispatch(GET=leads.list_leads, POST=leads.create_lead),
        name="leads",
    ),
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>",
        _dispatch(GET=leads.get_lead, PUT=leads.update_lead, DELETE=leads.delete_lead),
        name="leads-detail",
    ),
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/move",
        leads.move_lead,
        name="leads-move",
    ),
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/transfer",
        leads.transfer_lead,
        name="leads-transfer",
    ),
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/lost",
        leads.mark_lead_lost,
        name="leads-lost",
    ),
    # Contacts
    path(
        "id/<slug:slug>/crm/contacts",
        _dispatch(GET=contacts.list_contacts, POST=contacts.create_contact),
        name="contacts",
    ),
    path(
        "id/<slug:slug>/crm/contacts/<int:contact_id>",
        contacts.get_contact,
        name="contacts-detail",
    ),
    # Interactions
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/interactions",
        _dispatch(
            GET=interactions.list_interactions,
            POST=interactions.create_interaction,
        ),
        name="interactions",
    ),
    # Stages
    path(
        "id/<slug:slug>/crm/stages",
        _dispatch(GET=stages.list_stages, POST=stages.create_stage),
        name="stages",
    ),
    path(
        "id/<slug:slug>/crm/stages/<int:stage_id>",
        _dispatch(PUT=stages.update_stage, DELETE=stages.delete_stage),
        name="stages-detail",
    ),
    # Tags
    path("id/<slug:slug>/crm/tags", tags.list_tags, name="tags"),
    # Sources
    path(
        "id/<slug:slug>/crm/sources",
        _dispatch(GET=sources.list_sources, POST=sources.create_source),
        name="sources",
    ),
    # Lost reasons
    path(
        "id/<slug:slug>/crm/lost-reasons",
        _dispatch(
            GET=lost_reasons.list_lost_reasons, POST=lost_reasons.create_lost_reason
        ),
        name="lost-reasons",
    ),
    path(
        "id/<slug:slug>/crm/lost-reasons/<int:reason_id>",
        lost_reasons.delete_lost_reason,
        name="lost-reasons-detail",
    ),
    # Users
    path("id/<slug:slug>/crm/users", users.list_users, name="users"),
    # Custom fields
    path(
        "id/<slug:slug>/crm/custom-fields",
        _dispatch(
            GET=custom_fields.list_custom_fields, POST=custom_fields.create_custom_field
        ),
        name="custom-fields",
    ),
    path(
        "id/<slug:slug>/crm/custom-fields/<int:field_id>",
        _dispatch(
            PUT=custom_fields.update_custom_field,
            DELETE=custom_fields.delete_custom_field,
        ),
        name="custom-fields-detail",
    ),
    # Lead custom field values
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/custom-fields",
        _dispatch(
            GET=custom_fields.list_lead_custom_fields,
            POST=custom_fields.set_lead_custom_field,
        ),
        name="lead-custom-fields",
    ),
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/custom-fields/<int:value_id>",
        custom_fields.delete_lead_custom_field,
        name="lead-custom-fields-detail",
    ),
    # Attachments
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/attachments",
        _dispatch(
            GET=attachments.list_attachments,
            POST=attachments.upload_attachment,
        ),
        name="attachments",
    ),
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/attachments/<int:attachment_id>",
        _dispatch(
            PUT=attachments.update_attachment,
            DELETE=attachments.delete_attachment,
        ),
        name="attachments-detail",
    ),
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/attachments/<int:attachment_id>/download",
        attachments.download_attachment,
        name="attachments-download",
    ),
    # Export
    path("id/<slug:slug>/crm/export/leads", export.export_leads, name="export-leads"),
    path(
        "id/<slug:slug>/crm/export/contacts",
        export.export_contacts,
        name="export-contacts",
    ),
    # Permissions
    path(
        "id/<slug:slug>/crm/permissions",
        permissions.list_permissions,
        name="permissions",
    ),
    path(
        "id/<slug:slug>/crm/permissions/bulk",
        permissions.bulk_update_permissions,
        name="permissions-bulk",
    ),
    path(
        "id/<slug:slug>/crm/permissions/<int:user_id>",
        permissions.update_permission,
        name="permissions-detail",
    ),
    # Notifications
    path(
        "id/<slug:slug>/crm/notifications",
        notifications.list_notifications,
        name="notifications",
    ),
    path(
        "id/<slug:slug>/crm/notifications/<int:activity_id>/done",
        notifications.complete_notification,
        name="notifications-done",
    ),
    path(
        "id/<slug:slug>/crm/notifications/<int:activity_id>",
        notifications.dismiss_notification,
        name="notifications-dismiss",
    ),
    # Integrations
    path(
        "id/<slug:slug>/crm/integrations",
        integrations.get_integrations,
        name="integrations",
    ),
    path(
        "id/<slug:slug>/crm/integrations/nexus-conversation",
        integrations.open_nexus_conversation,
        name="integrations-nexus",
    ),
    path(
        "id/<slug:slug>/crm/integrations/open-conversation",
        integrations.open_nexus_conversation,
        name="integrations-open-conversation",
    ),
    path(
        "id/<slug:slug>/crm/integrations/enrich-cnpj",
        integrations.enrich_cnpj,
        name="integrations-enrich",
    ),
    path(
        "id/<slug:slug>/crm/integrations/search-lead",
        integrations.search_lead,
        name="integrations-search",
    ),
]
