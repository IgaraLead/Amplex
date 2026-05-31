"""API URL routing — RESTful patterns matching frontend expectations."""

from django.urls import path
from django.views.decorators.http import require_http_methods

from .views import (
    admin as admin_views,
)
from .views import (
    attachments,
    auth,
    config,
    contacts,
    custom_fields,
    dashboard,
    export,
    health_check,
    integrations,
    interactions,
    leads,
    lost_reasons,
    notifications,
    orgs,
    permissions,
    pipeline,
    sources,
    stages,
    tags,
    users,
    won_reasons,
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
    path("health", health_check, name="health"),
    path("auth/login", auth.login, name="auth-login"),
    path("auth/refresh", auth.refresh, name="auth-refresh"),
    path("auth/me", auth.me, name="auth-me"),
    path("auth/change-password", auth.change_password, name="auth-change-password"),
    path("auth/logout", auth.logout, name="auth-logout"),
    path("admin/overview", admin_views.overview, name="admin-overview"),
    path(
        "admin/orgs",
        _dispatch(GET=admin_views.list_orgs, POST=admin_views.create_org),
        name="admin-orgs",
    ),
    path("admin/orgs/<int:org_id>", admin_views.update_org, name="admin-org-update"),
    path(
        "admin/orgs/<int:org_id>/members",
        admin_views.add_org_member,
        name="admin-org-member-add",
    ),
    path(
        "admin/users",
        _dispatch(GET=admin_views.list_users, POST=admin_views.create_user),
        name="admin-users",
    ),
    path(
        "admin/users/<int:user_id>", admin_views.update_user, name="admin-user-update"
    ),
    path(
        "admin/users/<int:user_id>/reset-password",
        admin_views.reset_user_password,
        name="admin-user-reset-password",
    ),
    path("config", config.get_config, name="config"),
    path("id/<slug:slug>/crm/config", config.get_scoped_config, name="config-scoped"),
    path(
        "orgs",
        _dispatch(GET=orgs.list_my_orgs, POST=orgs.create_org),
        name="orgs",
    ),
    path("id/<slug:slug>/org/update", orgs.update_org, name="org-update"),
    path("id/<slug:slug>/org/members", orgs.list_members, name="org-members"),
    path("id/<slug:slug>/org/members/add", orgs.add_member, name="org-member-add"),
    path(
        "id/<slug:slug>/org/members/<int:user_id>/remove",
        orgs.remove_member,
        name="org-member-remove",
    ),
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
    path("id/<slug:slug>/crm/pipeline", pipeline.pipeline, name="pipeline"),
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
    path(
        "id/<slug:slug>/crm/leads/<int:lead_id>/interactions",
        _dispatch(
            GET=interactions.list_interactions,
            POST=interactions.create_interaction,
        ),
        name="interactions",
    ),
    path(
        "id/<slug:slug>/crm/stages",
        _dispatch(GET=stages.list_stages, POST=stages.create_stage),
        name="stages",
    ),
    path(
        "id/<slug:slug>/crm/stages/reorder",
        stages.reorder_stages,
        name="stages-reorder",
    ),
    path(
        "id/<slug:slug>/crm/stages/<int:stage_id>",
        _dispatch(PUT=stages.update_stage, DELETE=stages.delete_stage),
        name="stages-detail",
    ),
    path("id/<slug:slug>/crm/tags", tags.list_tags, name="tags"),
    path(
        "id/<slug:slug>/crm/sources",
        _dispatch(GET=sources.list_sources, POST=sources.create_source),
        name="sources",
    ),
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
    path(
        "id/<slug:slug>/crm/won-reasons",
        _dispatch(GET=won_reasons.list_won_reasons, POST=won_reasons.create_won_reason),
        name="won-reasons",
    ),
    path(
        "id/<slug:slug>/crm/won-reasons/<int:reason_id>",
        won_reasons.delete_won_reason,
        name="won-reasons-detail",
    ),
    path(
        "id/<slug:slug>/crm/users",
        _dispatch(GET=users.list_users, POST=users.create_user),
        name="users",
    ),
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
    path("id/<slug:slug>/crm/export/leads", export.export_leads, name="export-leads"),
    path(
        "id/<slug:slug>/crm/export/contacts",
        export.export_contacts,
        name="export-contacts",
    ),
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
    path(
        "id/<slug:slug>/crm/notifications",
        notifications.list_notifications,
        name="notifications",
    ),
    path(
        "id/<slug:slug>/crm/notifications/<str:notification_id>/done",
        notifications.complete_notification,
        name="notifications-done",
    ),
    path(
        "id/<slug:slug>/crm/notifications/<str:notification_id>",
        notifications.dismiss_notification,
        name="notifications-dismiss",
    ),
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
