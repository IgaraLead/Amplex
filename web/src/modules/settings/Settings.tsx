import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/shared/page/PageHeader';
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api';
import { useAuth } from '@/shared/store';
import { useToast } from '@/shared/ui/useToast';

interface Stage {
  id: number;
  name: string;
  sequence: number;
  is_won?: boolean;
  is_lost?: boolean;
  is_fixed?: boolean;
}
interface NamedItem {
  id: number;
  name: string;
}
interface UserItem {
  id: number;
  name: string;
  email: string;
  role: string;
}
interface CustomField {
  id: number;
  name: string;
  field_type: string;
  options?: string;
  sequence?: number;
  required?: boolean;
  active?: boolean;
}
interface PermissionUser {
  id: number;
  name: string;
  email: string;
  permissions: Record<string, boolean>;
}

function ListManager({
  title,
  description,
  items,
  value,
  onValueChange,
  onCreate,
  onDelete,
  pending,
}: {
  title: string;
  description: string;
  items: NamedItem[];
  value: string;
  onValueChange: (value: string) => void;
  onCreate: () => void;
  onDelete?: (id: number) => void;
  pending?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={event => onValueChange(event.target.value)}
            placeholder="Nome"
          />
          <Button type="button" onClick={onCreate} disabled={pending || !value.trim()}>
            <Plus className="size-4" />
            Adicionar
          </Button>
        </div>
        <div className="space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <span>{item.name}</span>
              {onDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum registro cadastrado.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { user, currentOrg } = useAuth();
  const isAdmin =
    currentOrg?.role === 'admin' ||
    user?.role === 'admin' ||
    user?.role === 'super_admin' ||
    user?.is_super_admin === true;
  const [stageName, setStageName] = useState('');
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const [editingStageName, setEditingStageName] = useState('');
  const [draggingStageId, setDraggingStageId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);
  const [lostReasonName, setLostReasonName] = useState('');
  const [wonReasonName, setWonReasonName] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'agente' });
  const [customField, setCustomField] = useState({
    name: '',
    field_type: 'text',
    options: '',
    required: false,
  });

  const { data: stagesData } = useQuery<{ items?: Stage[]; stages?: Stage[] }>({
    queryKey: ['stages'],
    queryFn: () => apiGet('/crm/stages'),
  });
  const { data: lostReasonsData } = useQuery<{ items: NamedItem[] }>({
    queryKey: ['lost-reasons'],
    queryFn: () => apiGet('/crm/lost-reasons'),
    enabled: isAdmin,
  });
  const { data: wonReasonsData } = useQuery<{ items: NamedItem[] }>({
    queryKey: ['won-reasons'],
    queryFn: () => apiGet('/crm/won-reasons'),
    enabled: isAdmin,
  });
  const { data: sourcesData } = useQuery<{ items: NamedItem[] }>({
    queryKey: ['sources'],
    queryFn: () => apiGet('/crm/sources'),
    enabled: isAdmin,
  });
  const { data: usersData } = useQuery<{ users: UserItem[] }>({
    queryKey: ['crm-users'],
    queryFn: () => apiGet('/crm/users'),
    enabled: isAdmin,
  });
  const { data: customFieldsData } = useQuery<{ items: CustomField[] }>({
    queryKey: ['custom-fields'],
    queryFn: () => apiGet('/crm/custom-fields'),
    enabled: isAdmin,
  });
  const { data: permissionsData } = useQuery<{ users: PermissionUser[] }>({
    queryKey: ['permission-users'],
    queryFn: () => apiGet('/permissions/users'),
    enabled: isAdmin,
  });

  const createStage = useMutation({
    mutationFn: (name: string) => apiPost('/crm/stages', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      setStageName('');
      addToast('Estágio criado', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const deleteStage = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/stages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      addToast('Estágio excluído', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const updateStage = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiPut(`/crm/stages/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      setEditingStageId(null);
      setEditingStageName('');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const reorderStages = useMutation({
    mutationFn: (stageIds: number[]) => apiPut('/crm/stages/reorder', { stage_ids: stageIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const createLostReason = useMutation({
    mutationFn: (name: string) => apiPost('/crm/lost-reasons', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lost-reasons'] });
      setLostReasonName('');
    },
  });
  const deleteLostReason = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/lost-reasons/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lost-reasons'] }),
  });
  const createWonReason = useMutation({
    mutationFn: (name: string) => apiPost('/crm/won-reasons', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['won-reasons'] });
      setWonReasonName('');
    },
  });
  const deleteWonReason = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/won-reasons/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['won-reasons'] }),
  });
  const createSource = useMutation({
    mutationFn: (name: string) => apiPost('/crm/sources', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setSourceName('');
    },
  });
  const createUser = useMutation({
    mutationFn: (body: typeof newUser) => apiPost('/crm/users', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-users'] });
      setNewUser({ name: '', email: '', password: '', role: 'agente' });
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const removeUser = useMutation({
    mutationFn: (id: number) => apiDelete(`/org/members/${id}/remove`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm-users'] }),
  });
  const createCustomField = useMutation({
    mutationFn: (body: typeof customField) => apiPost('/crm/custom-fields', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      setCustomField({ name: '', field_type: 'text', options: '', required: false });
    },
  });
  const deleteCustomField = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/custom-fields/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-fields'] }),
  });
  const updatePermissions = useMutation({
    mutationFn: ({
      userId,
      permissions,
    }: {
      userId: number;
      permissions: Record<string, boolean>;
    }) => apiPut(`/permissions/users/${userId}`, { permissions }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permission-users'] }),
  });

  const stages = stagesData?.items ?? stagesData?.stages ?? [];
  const regularStages = stages.filter(stage => !stage.is_fixed);
  const fixedStages = stages.filter(stage => stage.is_fixed);
  const handleStageDrop = (targetStage: Stage) => {
    if (!draggingStageId || targetStage.is_fixed || draggingStageId === targetStage.id) {
      setDraggingStageId(null);
      setDragOverStageId(null);
      return;
    }
    const draggingStage = regularStages.find(stage => stage.id === draggingStageId);
    if (!draggingStage) {
      setDraggingStageId(null);
      setDragOverStageId(null);
      return;
    }
    const nextStages = regularStages.filter(stage => stage.id !== draggingStageId);
    const targetIndex = nextStages.findIndex(stage => stage.id === targetStage.id);
    nextStages.splice(targetIndex < 0 ? nextStages.length : targetIndex, 0, draggingStage);
    reorderStages.mutate(nextStages.map(stage => stage.id));
    setDraggingStageId(null);
    setDragOverStageId(null);
  };
  const handleStageNameSubmit = (stage: Stage) => {
    const name = editingStageName.trim();
    if (!name || name === stage.name) {
      setEditingStageId(null);
      setEditingStageName('');
      return;
    }
    updateStage.mutate({ id: stage.id, name });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border/70 pb-6">
        <PageHeader
          title="Configurações"
          description="Gerencie preferências pessoais, pipeline e administração da organização."
          tag="Amplex"
        />
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="stages">Estágios</TabsTrigger>
          {isAdmin && <TabsTrigger value="reasons">Motivos</TabsTrigger>}
          {isAdmin && <TabsTrigger value="fields">Campos customizados</TabsTrigger>}
          {isAdmin && <TabsTrigger value="admin">Administração</TabsTrigger>}
          {isAdmin && <TabsTrigger value="permissions">Permissões</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Minha conta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="font-medium">{user?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">E-mail</p>
                  <p className="font-medium">{user?.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Papel</p>
                  <Badge>{isAdmin ? 'Gestor' : 'Vendedor'}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Organização</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Nome</p>
                  <p className="font-medium">{currentOrg?.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Slug</p>
                  <p className="font-mono text-sm">{currentOrg?.slug}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stages">
          <Card>
            <CardHeader>
              <CardTitle>Estágios do pipeline</CardTitle>
              <CardDescription>Ordem operacional do funil comercial.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAdmin && (
                <div className="flex gap-2">
                  <Input
                    value={stageName}
                    onChange={event => setStageName(event.target.value)}
                    placeholder="Nome"
                  />
                  <Button
                    type="button"
                    onClick={() => createStage.mutate(stageName)}
                    disabled={createStage.isPending || !stageName.trim()}
                  >
                    <Plus className="size-4" />
                    Adicionar
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {[...regularStages, ...fixedStages].map(stage => (
                  <div
                    key={stage.id}
                    draggable={isAdmin && !stage.is_fixed}
                    onDragStart={event => {
                      if (stage.is_fixed) return;
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', String(stage.id));
                      setDraggingStageId(stage.id);
                    }}
                    onDragOver={event => {
                      if (stage.is_fixed) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDragEnter={() => !stage.is_fixed && setDragOverStageId(stage.id)}
                    onDragLeave={() => setDragOverStageId(null)}
                    onDrop={() => handleStageDrop(stage)}
                    onDragEnd={() => {
                      setDraggingStageId(null);
                      setDragOverStageId(null);
                    }}
                    className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition ${
                      dragOverStageId === stage.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <GripVertical
                        className={`size-4 shrink-0 ${
                          stage.is_fixed ? 'text-muted-foreground/30' : 'text-muted-foreground'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        {editingStageId === stage.id ? (
                          <form
                            className="flex gap-2"
                            onSubmit={event => {
                              event.preventDefault();
                              handleStageNameSubmit(stage);
                            }}
                          >
                            <Input
                              autoFocus
                              value={editingStageName}
                              onChange={event => setEditingStageName(event.target.value)}
                              onBlur={() => handleStageNameSubmit(stage)}
                            />
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="truncate text-left font-medium hover:text-primary disabled:hover:text-foreground"
                            disabled={!isAdmin || stage.is_fixed}
                            onClick={() => {
                              setEditingStageId(stage.id);
                              setEditingStageName(stage.name);
                            }}
                          >
                            {stage.name}
                          </button>
                        )}
                      </div>
                      {stage.is_won && <Badge variant="success">Ganho</Badge>}
                      {stage.is_lost && <Badge variant="destructive">Perda</Badge>}
                      {stage.is_fixed && <Badge variant="secondary">Fixo</Badge>}
                    </div>
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={stage.is_fixed}
                        onClick={() => deleteStage.mutate(stage.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                        Excluir
                      </Button>
                    )}
                  </div>
                ))}
                {stages.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum registro cadastrado.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="reasons">
            <div className="grid gap-6 lg:grid-cols-2">
              <ListManager
                title="Motivos de ganho"
                description="Motivos usados ao concluir oportunidades ganhas."
                items={wonReasonsData?.items ?? []}
                value={wonReasonName}
                onValueChange={setWonReasonName}
                onCreate={() => createWonReason.mutate(wonReasonName)}
                onDelete={id => deleteWonReason.mutate(id)}
              />
              <ListManager
                title="Motivos de perda"
                description="Motivos usados ao encerrar oportunidades perdidas."
                items={lostReasonsData?.items ?? []}
                value={lostReasonName}
                onValueChange={setLostReasonName}
                onCreate={() => createLostReason.mutate(lostReasonName)}
                onDelete={id => deleteLostReason.mutate(id)}
              />
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="admin">
            <div className="grid gap-6 lg:grid-cols-2">
              <ListManager
                title="Origens"
                description="Canais de aquisição para oportunidades."
                items={sourcesData?.items ?? []}
                value={sourceName}
                onValueChange={setSourceName}
                onCreate={() => createSource.mutate(sourceName)}
              />
            </div>
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Usuários</CardTitle>
                <CardDescription>Convide e remova membros desta organização.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <form
                  className="grid gap-3 md:grid-cols-5"
                  onSubmit={event => {
                    event.preventDefault();
                    createUser.mutate(newUser);
                  }}
                >
                  <Input
                    placeholder="Nome"
                    value={newUser.name}
                    onChange={event => setNewUser({ ...newUser, name: event.target.value })}
                    required
                  />
                  <Input
                    type="email"
                    placeholder="E-mail"
                    value={newUser.email}
                    onChange={event => setNewUser({ ...newUser, email: event.target.value })}
                    required
                  />
                  <Input
                    type="password"
                    placeholder="Senha"
                    value={newUser.password}
                    onChange={event => setNewUser({ ...newUser, password: event.target.value })}
                    required
                  />
                  <Select
                    value={newUser.role}
                    onValueChange={role => setNewUser({ ...newUser, role })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agente">Agente</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit">Criar</Button>
                </form>
                <div className="space-y-2">
                  {(usersData?.users ?? []).map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{item.role}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeUser.mutate(item.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="fields">
            <Card>
              <CardHeader>
                <CardTitle>Campos personalizados</CardTitle>
                <CardDescription>
                  Campos extras exibidos nos detalhes da oportunidade.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <form
                  className="grid gap-3 md:grid-cols-[1fr_180px_1fr_auto_auto]"
                  onSubmit={event => {
                    event.preventDefault();
                    createCustomField.mutate(customField);
                  }}
                >
                  <Input
                    placeholder="Nome"
                    value={customField.name}
                    onChange={event => setCustomField({ ...customField, name: event.target.value })}
                    required
                  />
                  <Select
                    value={customField.field_type}
                    onValueChange={field_type => setCustomField({ ...customField, field_type })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="number">Número</SelectItem>
                      <SelectItem value="date">Data</SelectItem>
                      <SelectItem value="select">Seleção</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Opções (uma por linha)"
                    value={customField.options}
                    disabled={customField.field_type !== 'select'}
                    onChange={event =>
                      setCustomField({ ...customField, options: event.target.value })
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={customField.required}
                      onCheckedChange={checked =>
                        setCustomField({ ...customField, required: checked === true })
                      }
                    />
                    Obrigatório
                  </label>
                  <Button type="submit">Criar</Button>
                </form>
                <div className="space-y-2">
                  {(customFieldsData?.items ?? []).map(field => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div>
                        <p className="font-medium">{field.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {field.field_type}
                          {field.required ? ' · obrigatório' : ''}
                          {field.options ? ' · com opções' : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteCustomField.mutate(field.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="permissions">
            <Card>
              <CardHeader>
                <CardTitle>Permissões por usuário</CardTitle>
                <CardDescription>Controle permissões operacionais adicionais.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(permissionsData?.users ?? []).map(item => (
                  <div key={item.id} className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="mb-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.email}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.keys(item.permissions).map(key => (
                        <label
                          key={key}
                          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                        >
                          <Checkbox
                            checked={item.permissions[key]}
                            onCheckedChange={checked =>
                              updatePermissions.mutate({
                                userId: item.id,
                                permissions: { ...item.permissions, [key]: checked === true },
                              })
                            }
                          />
                          {key.replace(/_/g, ' ')}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
