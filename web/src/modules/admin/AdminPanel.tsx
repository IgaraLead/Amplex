import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, apiPost, apiPut } from '@/shared/api';
import PageHeader from '@/shared/page/PageHeader';
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
  is_default_org: boolean;
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
  is_default_super_admin: boolean;
  force_password_change: boolean;
  memberships: AdminUserMembership[];
};

type OrgForm = {
  name: string;
  slug: string;
  seat_limit: string;
  active: boolean;
};

type UserMembershipForm = {
  org_id: string;
  role: 'member' | 'admin';
};

type UserForm = {
  name: string;
  email: string;
  password: string;
  active: boolean;
  is_super_admin: boolean;
  memberships: UserMembershipForm[];
};

type OrgDialogState = { mode: 'create' } | { mode: 'edit'; org: AdminOrg };
type UserDialogState = { mode: 'create' } | { mode: 'edit'; user: AdminUser };

const initialOrgForm: OrgForm = {
  name: '',
  slug: '',
  seat_limit: '1',
  active: true,
};

const initialUserForm: UserForm = {
  name: '',
  email: '',
  password: '',
  active: true,
  is_super_admin: false,
  memberships: [],
};

export default function AdminPanel() {
  const queryClient = useQueryClient();
  const { user, loading, fetchUser } = useAuth();
  const [orgDialog, setOrgDialog] = useState<OrgDialogState | null>(null);
  const [userDialog, setUserDialog] = useState<UserDialogState | null>(null);
  const [orgForm, setOrgForm] = useState<OrgForm>(initialOrgForm);
  const [userForm, setUserForm] = useState<UserForm>(initialUserForm);
  const [orgError, setOrgError] = useState('');
  const [userError, setUserError] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const isAllowed = Boolean(user?.is_super_admin);

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

  const orgs = useMemo(() => orgsData?.items ?? [], [orgsData?.items]);
  const users = useMemo(() => usersData?.items ?? [], [usersData?.items]);
  const activeOrgs = useMemo(() => orgs.filter(org => org.active), [orgs]);
  const hasValidMemberships =
    userForm.memberships.length > 0 && userForm.memberships.every(item => item.org_id);

  const invalidateAdminQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-orgs'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-overview'] });
  };

  const createOrgMutation = useMutation({
    mutationFn: (body: { name: string; slug: string; seat_limit: number }) =>
      apiPost('/admin/orgs', body),
    onSuccess: () => {
      setOrgError('');
      setOrgDialog(null);
      setOrgForm(initialOrgForm);
      invalidateAdminQueries();
    },
    onError: (error: Error) => setOrgError(error.message),
  });

  const updateOrgMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<AdminOrg> }) =>
      apiPut(`/admin/orgs/${id}`, body),
    onSuccess: () => {
      setOrgError('');
      setOrgDialog(null);
      invalidateAdminQueries();
    },
    onError: (error: Error) => setOrgError(error.message),
  });

  const createUserMutation = useMutation({
    mutationFn: (
      body: Pick<UserForm, 'name' | 'email' | 'password'> & {
        role: 'superadmin' | 'agente';
        memberships: { org_id: number; role: UserMembershipForm['role'] }[];
      }
    ) => apiPost('/admin/users', body),
    onSuccess: () => {
      setUserError('');
      setUserDialog(null);
      setUserForm(initialUserForm);
      invalidateAdminQueries();
    },
    onError: (error: Error) => setUserError(error.message),
  });

  const updateUserMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Pick<AdminUser, 'name' | 'email' | 'active' | 'is_super_admin'> & {
        memberships: { org_id: number; role: UserMembershipForm['role'] }[];
      };
    }) => apiPut(`/admin/users/${id}`, body),
    onSuccess: () => {
      setUserError('');
      setUserDialog(null);
      invalidateAdminQueries();
    },
    onError: (error: Error) => setUserError(error.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiPost<{ temporary_password: string }>(`/admin/users/${id}/reset-password`, {}),
    onSuccess: (result, variables) => {
      const target = users.find(item => item.id === variables.id);
      setUserError('');
      setTemporaryPassword({
        email: target?.email ?? 'usuário',
        password: result.temporary_password,
      });
      invalidateAdminQueries();
    },
    onError: (error: Error) => setUserError(error.message),
  });

  const handleOpenCreateOrg = () => {
    setOrgError('');
    setOrgForm(initialOrgForm);
    setOrgDialog({ mode: 'create' });
  };

  const handleOpenEditOrg = (org: AdminOrg) => {
    setOrgError('');
    setOrgForm({
      name: org.name,
      slug: org.slug,
      seat_limit: String(org.seat_limit),
      active: org.active,
    });
    setOrgDialog({ mode: 'edit', org });
  };

  const handleOpenCreateUser = () => {
    setUserError('');
    setResetConfirmOpen(false);
    setUserForm(initialUserForm);
    setUserDialog({ mode: 'create' });
  };

  const handleOpenEditUser = (item: AdminUser) => {
    setUserError('');
    setResetConfirmOpen(false);
    setUserForm({
      name: item.name,
      email: item.email,
      password: '',
      active: item.active,
      is_super_admin: item.is_super_admin,
      memberships: item.memberships
        .filter(member => member.active)
        .map(member => ({
          org_id: String(member.org_id),
          role: member.role === 'admin' ? 'admin' : 'member',
        })),
    });
    setUserDialog({ mode: 'edit', user: item });
  };

  const handleAddUserMembership = () => {
    const selectedOrgIds = new Set(userForm.memberships.map(item => item.org_id));
    const nextOrg = activeOrgs.find(org => !selectedOrgIds.has(String(org.id)));
    if (!nextOrg) return;
    setUserForm(prev => ({
      ...prev,
      memberships: [...prev.memberships, { org_id: String(nextOrg.id), role: 'member' }],
    }));
  };

  const handleUpdateUserMembership = (index: number, patch: Partial<UserMembershipForm>) => {
    setUserForm(prev => ({
      ...prev,
      memberships: prev.memberships.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));
  };

  const handleRemoveUserMembership = (index: number) => {
    setUserForm(prev => ({
      ...prev,
      memberships: prev.memberships.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const buildMembershipPayload = () =>
    userForm.memberships.map(item => ({
      org_id: Number(item.org_id),
      role: item.role,
    }));

  const handleSubmitOrg = (event: React.FormEvent) => {
    event.preventDefault();
    const body = {
      name: orgForm.name.trim(),
      slug: orgForm.slug.trim().toLowerCase(),
      seat_limit: Number(orgForm.seat_limit),
      active: orgForm.active,
    };
    if (orgDialog?.mode === 'edit') {
      updateOrgMutation.mutate({ id: orgDialog.org.id, body });
      return;
    }
    createOrgMutation.mutate({
      name: body.name,
      slug: body.slug,
      seat_limit: body.seat_limit,
    });
  };

  const handleSubmitUser = (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasValidMemberships) {
      setUserError('Selecione pelo menos uma organização para salvar o usuário.');
      return;
    }
    if (userDialog?.mode === 'edit') {
      updateUserMutation.mutate({
        id: userDialog.user.id,
        body: {
          name: userForm.name.trim(),
          email: userForm.email.trim().toLowerCase(),
          active: userForm.active,
          is_super_admin: userForm.is_super_admin,
          memberships: buildMembershipPayload(),
        },
      });
      return;
    }

    createUserMutation.mutate({
      name: userForm.name.trim(),
      email: userForm.email.trim().toLowerCase(),
      password: userForm.password,
      role: userForm.is_super_admin ? 'superadmin' : 'agente',
      memberships: buildMembershipPayload(),
    });
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAllowed) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">
          Apenas usuários com perfil super admin podem acessar este painel.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border/70 pb-6">
        <PageHeader
          title="Admin Global"
          description="Gerencie organizações, usuários e vínculos do Amplex."
          tag="Super admin"
          className="mb-0 border-b-0 pb-0"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Organizações
            </p>
            <p className="mt-2 text-3xl font-bold">{overview?.organizations.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {overview?.organizations.active ?? 0} ativas
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Usuários</p>
            <p className="mt-2 text-3xl font-bold">{overview?.users.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">{overview?.users.active ?? 0} ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Assentos ativos
            </p>
            <p className="mt-2 text-3xl font-bold">{overview?.memberships.active ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="organizations" className="gap-4">
        <TabsList>
          <TabsTrigger value="organizations">Organizações</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <Card className="min-w-0">
            <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Organizações</CardTitle>
                <CardDescription>Crie e edite workspaces comerciais.</CardDescription>
              </div>
              <Button type="button" onClick={handleOpenCreateOrg}>
                Nova organização
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Assentos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map(org => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">
                        {org.name}
                        {org.is_default_org && (
                          <Badge className="ml-2" variant="outline">
                            default
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{org.slug}</TableCell>
                      <TableCell>
                        {org.active_members}/{org.seat_limit || '∞'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={org.active ? 'success' : 'warning'}>
                          {org.active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditOrg(org)}
                        >
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="min-w-0">
            <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Usuários</CardTitle>
                <CardDescription>
                  Cadastre usuários com organização obrigatória e gerencie acesso.
                </CardDescription>
              </div>
              <Button type="button" onClick={handleOpenCreateUser}>
                Novo usuário
              </Button>
            </CardHeader>
            <CardContent className="space-y-5 overflow-x-auto">
              {temporaryPassword && (
                <Alert variant="warning">
                  <div>
                    <AlertTitle>Senha temporária gerada para {temporaryPassword.email}</AlertTitle>
                    <AlertDescription className="mt-2">
                      Copie esta senha agora. Ela não será exibida novamente; as sessões atuais
                      foram encerradas e o usuário precisará definir uma nova senha no próximo
                      login.
                    </AlertDescription>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <code className="rounded-lg bg-background px-3 py-2 font-mono text-sm text-foreground">
                        {temporaryPassword.password}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(temporaryPassword.password)}
                      >
                        Copiar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setTemporaryPassword(null)}
                      >
                        Fechar
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Organizações</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="w-[220px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.email}</TableCell>
                      <TableCell>
                        {item.memberships
                          .filter(member => member.active)
                          .map(member => `${member.org_name} · ${member.role}`)
                          .join(', ') || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={item.active ? 'success' : 'warning'}>
                            {item.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                          {item.force_password_change && (
                            <Badge variant="warning">Troca obrigatória</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.is_super_admin ? 'default' : 'outline'}>
                          {item.is_super_admin ? 'Super admin' : 'Usuário'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEditUser(item)}
                          >
                            Editar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(orgDialog)} onOpenChange={open => !open && setOrgDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {orgDialog?.mode === 'edit' ? 'Editar organização' : 'Nova organização'}
            </DialogTitle>
            <DialogDescription>
              Defina nome, slug e assentos disponíveis para a organização.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmitOrg}>
            <div className="space-y-2">
              <Label htmlFor="org-name">Nome</Label>
              <Input
                id="org-name"
                value={orgForm.name}
                onChange={event => setOrgForm(prev => ({ ...prev, name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={orgForm.slug}
                onChange={event => setOrgForm(prev => ({ ...prev, slug: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-seat-limit">Assentos</Label>
              <Input
                id="org-seat-limit"
                type="number"
                min={0}
                value={orgForm.seat_limit}
                onChange={event =>
                  setOrgForm(prev => ({ ...prev, seat_limit: event.target.value }))
                }
              />
            </div>
            {orgDialog?.mode === 'edit' && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={orgForm.active}
                  disabled={orgDialog.org.is_default_org}
                  onCheckedChange={checked =>
                    setOrgForm(prev => ({ ...prev, active: checked === true }))
                  }
                />
                Organização ativa
              </label>
            )}
            {orgError && (
              <Alert variant="destructive">
                <AlertDescription>{orgError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOrgDialog(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createOrgMutation.isPending || updateOrgMutation.isPending}
              >
                {orgDialog?.mode === 'edit' ? 'Salvar alterações' : 'Criar organização'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(userDialog)} onOpenChange={open => !open && setUserDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {userDialog?.mode === 'edit' ? 'Editar usuário' : 'Novo usuário'}
            </DialogTitle>
            <DialogDescription>
              Defina os dados do usuário e uma ou mais organizações com o papel em cada workspace.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmitUser}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-name">Nome</Label>
                <Input
                  id="user-name"
                  value={userForm.name}
                  onChange={event => setUserForm(prev => ({ ...prev, name: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">E-mail</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={userForm.email}
                  disabled={userDialog?.mode === 'edit' && userDialog.user.is_default_super_admin}
                  onChange={event => setUserForm(prev => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
            </div>

            {userDialog?.mode === 'create' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user-password">Senha inicial</Label>
                  <Input
                    id="user-password"
                    type="password"
                    minLength={6}
                    value={userForm.password}
                    onChange={event =>
                      setUserForm(prev => ({ ...prev, password: event.target.value }))
                    }
                    required
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={userForm.is_super_admin}
                    onCheckedChange={checked =>
                      setUserForm(prev => ({ ...prev, is_super_admin: checked === true }))
                    }
                  />
                  Super admin global
                </label>
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Label>Organizações</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selecione todos os workspaces que este usuário poderá acessar.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={userForm.memberships.length >= activeOrgs.length}
                  onClick={handleAddUserMembership}
                >
                  Adicionar organização
                </Button>
              </div>

              {userForm.memberships.length === 0 ? (
                <Alert variant="info">
                  <AlertDescription>
                    Adicione pelo menos uma organização para salvar este usuário.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  {userForm.memberships.map((membership, index) => (
                    <div
                      key={`${membership.org_id}-${index}`}
                      className="grid gap-3 sm:grid-cols-[1fr_160px_auto]"
                    >
                      <Select
                        value={membership.org_id || undefined}
                        onValueChange={orgId =>
                          handleUpdateUserMembership(index, { org_id: orgId })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Organização" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeOrgs.map(org => {
                            const isSelectedElsewhere = userForm.memberships.some(
                              (item, itemIndex) =>
                                itemIndex !== index && item.org_id === String(org.id)
                            );
                            return (
                              <SelectItem
                                key={org.id}
                                value={String(org.id)}
                                disabled={isSelectedElsewhere}
                              >
                                {org.name}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Select
                        value={membership.role}
                        onValueChange={role =>
                          handleUpdateUserMembership(index, {
                            role: role as UserMembershipForm['role'],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Membro</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveUserMembership(index)}
                      >
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {userDialog?.mode === 'edit' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={userForm.active}
                      disabled={userDialog.user.is_default_super_admin}
                      onCheckedChange={checked =>
                        setUserForm(prev => ({ ...prev, active: checked === true }))
                      }
                    />
                    Usuário ativo
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={userForm.is_super_admin}
                      disabled={userDialog.user.is_default_super_admin}
                      onCheckedChange={checked =>
                        setUserForm(prev => ({ ...prev, is_super_admin: checked === true }))
                      }
                    />
                    Super admin
                  </label>
                </div>

                <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-warning">Redefinir senha</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Gera uma senha temporária, encerra as sessões atuais e força a troca no
                        próximo login.
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="bg-warning text-warning-foreground hover:bg-warning/90"
                      size="sm"
                      disabled={
                        userDialog.user.is_default_super_admin || resetPasswordMutation.isPending
                      }
                      onClick={() => setResetConfirmOpen(true)}
                    >
                      Resetar senha
                    </Button>
                  </div>

                  {resetConfirmOpen && (
                    <Alert variant="warning" className="mt-4">
                      <div className="space-y-3">
                        <AlertTitle>Confirmar redefinição?</AlertTitle>
                        <AlertDescription>
                          A senha atual deixará de funcionar e todas as sessões do usuário serão
                          encerradas imediatamente.
                        </AlertDescription>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setResetConfirmOpen(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            className="bg-warning text-warning-foreground hover:bg-warning/90"
                            size="sm"
                            disabled={resetPasswordMutation.isPending}
                            onClick={() => {
                              resetPasswordMutation.mutate({ id: userDialog.user.id });
                              setResetConfirmOpen(false);
                            }}
                          >
                            {resetPasswordMutation.isPending ? 'Gerando...' : 'Confirmar reset'}
                          </Button>
                        </div>
                      </div>
                    </Alert>
                  )}

                  {temporaryPassword?.email === userDialog.user.email && (
                    <Alert variant="warning" className="mt-4">
                      <div>
                        <AlertTitle>Senha temporária gerada</AlertTitle>
                        <AlertDescription className="mt-2">
                          Copie esta senha agora. Ela não será exibida novamente.
                        </AlertDescription>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <code className="rounded-lg bg-background px-3 py-2 font-mono text-sm text-foreground">
                            {temporaryPassword.password}
                          </code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              navigator.clipboard.writeText(temporaryPassword.password)
                            }
                          >
                            Copiar
                          </Button>
                        </div>
                      </div>
                    </Alert>
                  )}
                </div>
              </div>
            )}

            {userError && (
              <Alert variant="destructive">
                <AlertDescription>{userError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUserDialog(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  createUserMutation.isPending ||
                  updateUserMutation.isPending ||
                  !hasValidMemberships
                }
              >
                {userDialog?.mode === 'edit' ? 'Salvar alterações' : 'Criar usuário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
