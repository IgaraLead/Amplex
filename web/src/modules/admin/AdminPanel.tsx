import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { apiGet, apiPost, apiPut } from '@/shared/api';
import { useAuth } from '@/shared/store';

type AdminOverview = {
  organizations: { total: number; active: number };
  users: { total: number; active: number };
  memberships: { active: number };
};

type AdminOrg = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  seat_limit: number;
  active_members: number;
  available_seats: number;
};

type AdminUserMembership = {
  org_id: number;
  org_name: string;
  org_slug: string;
  role: string;
  active: boolean;
};

type AdminUser = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  is_super_admin: boolean;
  memberships: AdminUserMembership[];
};

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const { user, loading, fetchUser } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [membershipRole, setMembershipRole] = useState('member');

  const isAllowed = !!user?.is_super_admin;

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const { data: overview } = useQuery<AdminOverview>({
    queryKey: ['admin-overview'],
    queryFn: () => apiGet('/admin/overview'),
    enabled: isAllowed,
  });

  const { data: orgsData } = useQuery<{ items: AdminOrg[] }>({
    queryKey: ['admin-orgs'],
    queryFn: () => apiGet('/admin/orgs'),
    enabled: isAllowed,
  });

  const { data: usersData } = useQuery<{ items: AdminUser[] }>({
    queryKey: ['admin-users'],
    queryFn: () => apiGet('/admin/users'),
    enabled: isAllowed,
  });

  const orgs = useMemo(() => orgsData?.items || [], [orgsData?.items]);
  const users = useMemo(() => usersData?.items || [], [usersData?.items]);

  const updateOrgMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<AdminOrg> }) =>
      apiPut(`/admin/orgs/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Pick<AdminUser, 'active' | 'is_super_admin'>;
    }) => apiPut(`/admin/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });

  const addMembershipMutation = useMutation({
    mutationFn: ({ orgId, userId, role }: { orgId: number; userId: number; role: string }) =>
      apiPost(`/admin/orgs/${orgId}/members`, { user_id: userId, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
    },
  });

  const usersWithoutMembershipInSelectedOrg = useMemo(() => {
    if (!selectedOrgId) return users;
    return users.filter(u => !u.memberships.some(m => m.org_id === selectedOrgId && m.active));
  }, [users, selectedOrgId]);

  if (loading) {
    return <div className="p-8 text-center text-base-content/50">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAllowed) {
    return (
      <div className="page space-y-4">
        <h1 className="text-2xl font-semibold">Admin Global</h1>
        <div className="card bg-base-300">
          <div className="card-body">
            <p className="text-sm text-base-content/70">
              Apenas usuários com perfil super admin podem acessar este painel.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <h1 className="text-2xl font-semibold">Admin Global</h1>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card bg-base-300">
          <div className="card-body">
            <p className="text-xs text-base-content/55">Organizações</p>
            <p className="text-2xl font-semibold">
              {overview?.organizations.active ?? 0}/{overview?.organizations.total ?? 0}
            </p>
          </div>
        </div>
        <div className="card bg-base-300">
          <div className="card-body">
            <p className="text-xs text-base-content/55">Usuários</p>
            <p className="text-2xl font-semibold">
              {overview?.users.active ?? 0}/{overview?.users.total ?? 0}
            </p>
          </div>
        </div>
        <div className="card bg-base-300">
          <div className="card-body">
            <p className="text-xs text-base-content/55">Assentos ativos</p>
            <p className="text-2xl font-semibold">{overview?.memberships.active ?? 0}</p>
          </div>
        </div>
      </section>

      <section className="card bg-base-300">
        <div className="card-body">
          <h2 className="text-sm font-semibold">Organizações</h2>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Slug</th>
                  <th>Assentos</th>
                  <th>Uso</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map(org => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{org.slug}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        className="input input-xs w-20"
                        defaultValue={org.seat_limit}
                        onBlur={e => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next) || next < 1 || next === org.seat_limit) return;
                          updateOrgMutation.mutate({
                            id: org.id,
                            body: { seat_limit: next },
                          });
                        }}
                      />
                    </td>
                    <td>
                      {org.active_members}/{org.seat_limit}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-xs"
                        onClick={() =>
                          updateOrgMutation.mutate({
                            id: org.id,
                            body: { active: !org.active },
                          })
                        }
                      >
                        {org.active ? 'Ativa' : 'Inativa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card bg-base-300">
        <div className="card-body">
          <h2 className="text-sm font-semibold">Usuários Globais</h2>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Super admin</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={u.is_super_admin}
                        onChange={e =>
                          updateUserMutation.mutate({
                            id: u.id,
                            body: { active: u.active, is_super_admin: e.target.checked },
                          })
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-xs"
                        onClick={() =>
                          updateUserMutation.mutate({
                            id: u.id,
                            body: { active: !u.active, is_super_admin: u.is_super_admin },
                          })
                        }
                      >
                        {u.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card bg-base-300">
        <div className="card-body">
          <h2 className="text-sm font-semibold">Adicionar membership em organização</h2>
          <div className="grid gap-2 md:grid-cols-4">
            <select
              className="select select-sm"
              value={selectedOrgId ?? ''}
              onChange={e => setSelectedOrgId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="" disabled>
                Selecione organização
              </option>
              {orgs.map(org => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.active_members}/{org.seat_limit})
                </option>
              ))}
            </select>
            <select
              className="select select-sm"
              value={selectedUserId ?? ''}
              onChange={e => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="" disabled>
                Selecione usuário
              </option>
              {usersWithoutMembershipInSelectedOrg.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <select
              className="select select-sm"
              value={membershipRole}
              onChange={e => setMembershipRole(e.target.value)}
            >
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!selectedOrgId || !selectedUserId || addMembershipMutation.isPending}
              onClick={() => {
                if (!selectedOrgId || !selectedUserId) return;
                addMembershipMutation.mutate({
                  orgId: selectedOrgId,
                  userId: selectedUserId,
                  role: membershipRole,
                });
              }}
            >
              Adicionar
            </button>
          </div>
          {addMembershipMutation.error instanceof Error && (
            <p className="text-xs text-error">{addMembershipMutation.error.message}</p>
          )}
        </div>
      </section>
    </div>
  );
}
