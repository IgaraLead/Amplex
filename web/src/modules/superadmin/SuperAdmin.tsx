import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { apiGet, apiPatch } from '@/shared/api';
import { useAuth } from '@/shared/store';

interface OverviewResponse {
  metrics: {
    active_orgs: number;
    active_members: number;
    active_leads: number;
    active_contacts: number;
  };
}

interface OrganizationsResponse {
  items: Array<{
    id: number;
    name: string;
    slug: string;
    hub_org_id: string;
    platform_quotas: Record<string, unknown>;
    members_count: number;
    leads_count: number;
    contacts_count: number;
  }>;
}

export default function SuperAdmin() {
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.is_super_admin);
  const queryClient = useQueryClient();
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, string>>({});
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const { data: overview } = useQuery<OverviewResponse>({
    queryKey: ['super-admin-overview'],
    queryFn: () => apiGet('/super-admin/overview'),
    enabled: isSuperAdmin,
  });

  const { data: orgs } = useQuery<OrganizationsResponse>({
    queryKey: ['super-admin-orgs'],
    queryFn: () => apiGet('/super-admin/organizations'),
    enabled: isSuperAdmin,
  });

  const saveQuotas = useMutation({
    mutationFn: async ({ slug, jsonText }: { slug: string; jsonText: string }) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        throw new Error('JSON inválido');
      }
      return apiPatch<{ slug: string; platform_quotas: Record<string, unknown> }>(
        `/super-admin/organizations/${encodeURIComponent(slug)}/quotas`,
        { platform_quotas: parsed }
      );
    },
    onSuccess: (_data, vars) => {
      setQuotaError(null);
      setQuotaDrafts(prev => {
        const next = { ...prev };
        delete next[vars.slug];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['super-admin-orgs'] });
    },
    onError: (e: Error) => setQuotaError(e.message),
  });

  const handleQuotaChange = (slug: string, value: string) => {
    setQuotaDrafts(prev => ({ ...prev, [slug]: value }));
  };

  const getQuotaText = (org: OrganizationsResponse['items'][0]) => {
    const d = quotaDrafts[org.slug];
    if (d !== undefined) return d;
    return JSON.stringify(org.platform_quotas ?? {}, null, 2);
  };

  if (!isSuperAdmin) {
    return <Navigate to="/orgs" replace />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Super Admin</h1>
      </div>

      <div className="stat-grid mb-6">
        <div className="stat bg-base-300">
          <div className="stat-title">Organizações ativas</div>
          <div className="stat-value text-primary">{overview?.metrics.active_orgs ?? 0}</div>
        </div>
        <div className="stat bg-base-300">
          <div className="stat-title">Membros ativos</div>
          <div className="stat-value text-info">{overview?.metrics.active_members ?? 0}</div>
        </div>
        <div className="stat bg-base-300">
          <div className="stat-title">Leads ativos</div>
          <div className="stat-value text-success">{overview?.metrics.active_leads ?? 0}</div>
        </div>
        <div className="stat bg-base-300">
          <div className="stat-title">Contatos ativos</div>
          <div className="stat-value">{overview?.metrics.active_contacts ?? 0}</div>
        </div>
      </div>

      <div className="card bg-base-300">
        <div className="card-body">
          <h2 className="card-title">Organizações</h2>
          {quotaError ? (
            <p className="text-error text-sm mb-2" role="alert">
              {quotaError}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Slug</th>
                  <th>Membros</th>
                  <th>Leads</th>
                  <th>Contatos</th>
                </tr>
              </thead>
              <tbody>
                {(orgs?.items ?? []).map(org => (
                  <Fragment key={org.id}>
                    <tr>
                      <td>{org.name}</td>
                      <td>{org.slug}</td>
                      <td>{org.members_count}</td>
                      <td>{org.leads_count}</td>
                      <td>{org.contacts_count}</td>
                    </tr>
                    <tr className="bg-base-200">
                      <td colSpan={5}>
                        <details className="collapse collapse-arrow bg-base-300 rounded-box">
                          <summary className="collapse-title text-sm font-medium">
                            Quotas ecossistema (JSON) — amplex / nexus / entity
                          </summary>
                          <div className="collapse-content">
                            <textarea
                              className="textarea textarea-bordered font-mono text-xs w-full min-h-40"
                              aria-label={`Quotas JSON para ${org.slug}`}
                              value={getQuotaText(org)}
                              onChange={e => handleQuotaChange(org.slug, e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-primary btn-sm mt-2"
                              disabled={saveQuotas.isPending}
                              onClick={() =>
                                saveQuotas.mutate({
                                  slug: org.slug,
                                  jsonText: getQuotaText(org),
                                })
                              }
                            >
                              {saveQuotas.isPending ? 'A guardar…' : 'Guardar quotas'}
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
