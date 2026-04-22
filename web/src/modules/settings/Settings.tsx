import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut, apiDelete } from '@/shared/api';
import { useAuth } from '@/shared/store';
import { useToast } from '@/shared/ui/useToast';
import { BRAND_NAME, AMPLEX_NAME } from '@/shared/branding';
import { Pencil, Trash2, Check, X, Shield } from 'lucide-react';

interface Stage {
  id: number;
  name: string;
  sequence: number;
  is_won: boolean;
}
interface LostReason {
  id: number;
  name: string;
}
interface Source {
  id: number;
  name: string;
}
interface CustomFieldDef {
  id: number;
  name: string;
  field_type: string;
  options: string;
  sequence: number;
  required: boolean;
}

type Tab = 'profile' | 'stages' | 'reasons' | 'sources' | 'users' | 'custom-fields' | 'permissions';

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'cursor-pointer rounded-t-md px-4 py-2 text-sm transition-colors',
        active
          ? 'border-b-2 border-info bg-info/15 font-semibold text-base-content'
          : 'border-b-2 border-transparent font-normal text-base-content/55 hover:text-base-content/70',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function FormLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <label className={`mb-1 block text-xs text-base-content/55 ${className}`}>{children}</label>
  );
}

function ListRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-base-300 bg-white/[0.02] px-3 py-2 ${className}`}
    >
      {children}
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('profile');
  const isManager = user?.role === 'admin';

  const tabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: 'profile', label: 'Perfil' },
    { key: 'stages', label: 'Pipeline', adminOnly: true },
    { key: 'reasons', label: 'Motivos de Perda', adminOnly: true },
    { key: 'sources', label: 'Origens', adminOnly: true },
    { key: 'custom-fields', label: 'Campos Personalizados', adminOnly: true },
    { key: 'users', label: 'Usuários', adminOnly: true },
    { key: 'permissions', label: 'Permissões', adminOnly: true },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-base-300 pb-2">
        {tabs
          .filter(t => !t.adminOnly || isManager)
          .map(t => (
            <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </TabButton>
          ))}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'stages' && isManager && <StagesTab addToast={addToast} queryClient={queryClient} />}
      {tab === 'reasons' && isManager && (
        <ReasonsTab addToast={addToast} queryClient={queryClient} />
      )}
      {tab === 'sources' && isManager && (
        <SourcesTab addToast={addToast} queryClient={queryClient} />
      )}
      {tab === 'custom-fields' && isManager && (
        <CustomFieldsTab addToast={addToast} queryClient={queryClient} />
      )}
      {tab === 'users' && isManager && <UsersTab addToast={addToast} queryClient={queryClient} />}
      {tab === 'permissions' && isManager && (
        <PermissionsTab addToast={addToast} queryClient={queryClient} />
      )}
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
      <div className="card bg-base-300">
        <div className="card-body">
          <h3 className="mb-4 text-sm font-semibold">Perfil</h3>
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs text-base-content/50">Nome</span>
              <p className="text-sm">{user?.name}</p>
            </div>
            <div>
              <span className="text-xs text-base-content/50">E-mail</span>
              <p className="text-sm">{user?.email}</p>
            </div>
            <div>
              <span className="text-xs text-base-content/50">Papel</span>
              <p className="text-sm">
                <span className="badge badge-info">
                  {user?.role === 'admin' ? 'Gestor' : 'Vendedor'}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card bg-base-300">
        <div className="card-body">
          <h3 className="mb-4 text-sm font-semibold">Sobre</h3>
          <div className="flex flex-col gap-3">
            <div>
              <span className="text-xs text-base-content/50">Produto</span>
              <p className="text-sm">
                <span className="brand-name">{AMPLEX_NAME}</span> CRM
              </p>
            </div>
            <div>
              <span className="text-xs text-base-content/50">Plataforma</span>
              <p className="text-sm">{BRAND_NAME}</p>
            </div>
            <div>
              <span className="text-xs text-base-content/50">Versão</span>
              <p className="text-sm">0.2.0</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StagesTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const { data } = useQuery<{ stages: Stage[] }>({
    queryKey: ['stages'],
    queryFn: () => apiGet('/crm/stages'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost('/crm/stages', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      setNewName('');
      addToast('Estágio criado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiPut(`/crm/stages/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      setEditingId(null);
      addToast('Estágio atualizado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/stages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      addToast('Estágio excluído', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const stages = data?.stages || [];

  return (
    <div className="card bg-base-300 max-w-xl">
      <div className="card-body">
        <h3 className="mb-4 text-sm font-semibold">Estágios do Pipeline</h3>

        <form
          onSubmit={e => {
            e.preventDefault();
            if (newName.trim()) createMutation.mutate(newName.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <input
            className="input min-w-0 flex-1"
            placeholder="Novo estágio..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm shrink-0"
            type="submit"
            disabled={!newName.trim()}
          >
            Adicionar
          </button>
        </form>

        <div className="flex flex-col gap-1.5">
          {stages.map(s => (
            <ListRow key={s.id}>
              {editingId === s.id ? (
                <>
                  <input
                    className="input min-w-0 flex-1 px-2 py-1.5 text-sm"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm px-2"
                    onClick={() => updateMutation.mutate({ id: s.id, name: editName })}
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-2"
                    onClick={() => setEditingId(null)}
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm text-base-content">
                    {s.name}
                    {s.is_won && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-success">
                        <Check size={12} /> Ganho
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[0.7rem] text-base-content/55">#{s.sequence}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-1.5 text-xs"
                    onClick={() => {
                      setEditingId(s.id);
                      setEditName(s.name);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-1.5 text-xs text-error"
                    onClick={() => {
                      if (confirm(`Excluir estágio "${s.name}"?`)) deleteMutation.mutate(s.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </ListRow>
          ))}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReasonsTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const [newName, setNewName] = useState('');

  const { data } = useQuery<{ items: LostReason[] }>({
    queryKey: ['lost-reasons'],
    queryFn: () => apiGet('/crm/lost-reasons'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost('/crm/lost-reasons', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lost-reasons'] });
      setNewName('');
      addToast('Motivo criado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/lost-reasons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lost-reasons'] });
      addToast('Motivo arquivado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const reasons = data?.items || [];

  return (
    <div className="card bg-base-300 max-w-xl">
      <div className="card-body">
        <h3 className="mb-4 text-sm font-semibold">Motivos de Perda</h3>

        <form
          onSubmit={e => {
            e.preventDefault();
            if (newName.trim()) createMutation.mutate(newName.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <input
            className="input min-w-0 flex-1"
            placeholder="Novo motivo..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm shrink-0"
            type="submit"
            disabled={!newName.trim()}
          >
            Adicionar
          </button>
        </form>

        <div className="flex flex-col gap-1.5">
          {reasons.map(r => (
            <ListRow key={r.id}>
              <span className="min-w-0 flex-1 text-sm text-base-content">{r.name}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm px-1.5 text-xs text-error"
                onClick={() => {
                  if (confirm(`Arquivar motivo "${r.name}"?`)) deleteMutation.mutate(r.id);
                }}
              >
                <Trash2 size={13} />
              </button>
            </ListRow>
          ))}
          {reasons.length === 0 && (
            <p className="text-sm text-base-content/55">Nenhum motivo cadastrado</p>
          )}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SourcesTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const [newName, setNewName] = useState('');

  const { data } = useQuery<{ items: Source[] }>({
    queryKey: ['sources'],
    queryFn: () => apiGet('/crm/sources'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost('/crm/sources', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      setNewName('');
      addToast('Origem criada', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const sources = data?.items || [];

  return (
    <div className="card bg-base-300 max-w-xl">
      <div className="card-body">
        <h3 className="mb-4 text-sm font-semibold">Origens de Leads</h3>

        <form
          onSubmit={e => {
            e.preventDefault();
            if (newName.trim()) createMutation.mutate(newName.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <input
            className="input min-w-0 flex-1"
            placeholder="Nova origem..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm shrink-0"
            type="submit"
            disabled={!newName.trim()}
          >
            Adicionar
          </button>
        </form>

        <div className="flex flex-col gap-1.5">
          {sources.map(s => (
            <ListRow key={s.id}>
              <span className="min-w-0 flex-1 text-sm text-base-content">{s.name}</span>
            </ListRow>
          ))}
          {sources.length === 0 && (
            <p className="text-sm text-base-content/55">Nenhuma origem cadastrada</p>
          )}
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UsersTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });

  const { data, isLoading } = useQuery<{
    users?: Array<{ id: number; name: string; email: string; role?: string; is_active?: boolean }>;
  }>({
    queryKey: ['hub-users'],
    queryFn: () => apiGet('/crm/hub/users'),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newUser) => apiPost('/crm/hub/users', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hub-users'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      addToast('Usuário criado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/hub/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hub-users'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      addToast('Usuário desativado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const users = Array.isArray(data) ? data : data?.users || [];

  return (
    <div className="card bg-base-300 max-w-2xl">
      <div className="card-body">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Gerenciar Usuários (Hub)</h3>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancelar' : '+ Novo Usuário'}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={e => {
              e.preventDefault();
              createMutation.mutate(newUser);
            }}
            className="mb-5 flex flex-col gap-3 rounded-lg border border-base-300 bg-white/[0.03] p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <FormLabel>Nome *</FormLabel>
                <input
                  className="input w-full"
                  required
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                />
              </div>
              <div>
                <FormLabel>E-mail *</FormLabel>
                <input
                  className="input w-full"
                  type="email"
                  required
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>
              <div>
                <FormLabel>Senha *</FormLabel>
                <input
                  className="input w-full"
                  type="password"
                  required
                  minLength={6}
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>
              <div>
                <FormLabel>Papel</FormLabel>
                <select
                  className="select w-full"
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="user">Vendedor</option>
                  <option value="admin">Gestor</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Criando...' : 'Criar Usuário'}
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <p className="text-sm text-base-content/55">Carregando...</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {users.map(u => (
              <ListRow key={u.id} className="gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-base-content">{u.name}</span>
                  <span className="ml-2 text-xs text-base-content/55">{u.email}</span>
                </div>
                <span className="badge badge-info badge-sm shrink-0 py-0 text-[0.7rem]">
                  {u.role === 'admin' || u.role === 'super_admin' ? 'Gestor' : 'Vendedor'}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0 px-1.5 text-xs text-error"
                  onClick={() => {
                    if (confirm(`Desativar "${u.name}"?`)) deleteMutation.mutate(u.id);
                  }}
                >
                  Desativar
                </button>
              </ListRow>
            ))}
            {users.length === 0 && (
              <p className="text-sm text-base-content/55">Nenhum usuário encontrado</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomFieldsTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const FIELD_TYPES = [
    { value: 'text', label: 'Texto' },
    { value: 'number', label: 'Número' },
    { value: 'date', label: 'Data' },
    { value: 'select', label: 'Seleção' },
    { value: 'checkbox', label: 'Checkbox' },
  ];

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    field_type: '',
    options: '',
    required: false,
  });

  const { data } = useQuery<{ items: CustomFieldDef[] }>({
    queryKey: ['custom-field-defs'],
    queryFn: () => apiGet('/crm/custom-fields'),
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      name: string;
      field_type: string;
      options?: string;
      required?: boolean;
    }) => apiPost('/crm/custom-fields', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-defs'] });
      setNewName('');
      setNewType('text');
      setNewOptions('');
      setNewRequired(false);
      addToast('Campo criado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name: string;
      field_type: string;
      options: string;
      required: boolean;
    }) => apiPut(`/crm/custom-fields/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-defs'] });
      setEditingId(null);
      addToast('Campo atualizado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-defs'] });
      addToast('Campo arquivado', 'success');
    },
    onError: (e: Error) => addToast(e.message, 'error'),
  });

  const fields = data?.items || [];

  return (
    <div className="card bg-base-300 max-w-2xl">
      <div className="card-body">
        <h3 className="mb-1 text-sm font-semibold">Campos Personalizados Globais</h3>
        <p className="mb-4 text-xs text-base-content/50">
          Defina campos personalizados que estarão disponíveis em todas as oportunidades.
        </p>

        <form
          onSubmit={e => {
            e.preventDefault();
            if (newName.trim()) {
              const opts =
                newType === 'select' && newOptions
                  ? JSON.stringify(
                      newOptions
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                    )
                  : undefined;
              createMutation.mutate({
                name: newName.trim(),
                field_type: newType,
                options: opts,
                required: newRequired,
              });
            }
          }}
          className="mb-5 rounded-lg border border-base-300 bg-white/[0.03] p-3"
        >
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <FormLabel>Nome do campo</FormLabel>
              <input
                className="input w-full text-sm"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ex: CNPJ"
              />
            </div>
            <div>
              <FormLabel>Tipo</FormLabel>
              <select
                className="select w-full text-sm sm:w-auto"
                value={newType}
                onChange={e => setNewType(e.target.value)}
              >
                {FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-sm w-full sm:w-auto"
              disabled={!newName.trim()}
            >
              Adicionar
            </button>
          </div>
          {newType === 'select' && (
            <div className="mt-2">
              <FormLabel>Opções (separadas por vírgula)</FormLabel>
              <input
                className="input w-full text-sm"
                value={newOptions}
                onChange={e => setNewOptions(e.target.value)}
                placeholder="Ex: Opção A, Opção B, Opção C"
              />
            </div>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-base-content/55">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={newRequired}
              onChange={e => setNewRequired(e.target.checked)}
            />
            Obrigatório
          </label>
        </form>

        <div className="flex flex-col gap-1.5">
          {fields.map(f => (
            <ListRow key={f.id}>
              {editingId === f.id ? (
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <input
                      className="input min-w-0 flex-1 text-sm"
                      value={editForm.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      autoFocus
                    />
                    <select
                      className="select text-sm"
                      value={editForm.field_type}
                      onChange={e => setEditForm({ ...editForm, field_type: e.target.value })}
                    >
                      {FIELD_TYPES.map(t => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editForm.field_type === 'select' && (
                    <input
                      className="input text-xs"
                      value={editForm.options}
                      onChange={e => setEditForm({ ...editForm, options: e.target.value })}
                      placeholder="Opções (separadas por vírgula)"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1 text-[0.7rem] text-base-content/55">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={editForm.required}
                        onChange={e => setEditForm({ ...editForm, required: e.target.checked })}
                      />
                      Obrigatório
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-2 text-xs"
                        onClick={() => {
                          const opts =
                            editForm.field_type === 'select' && editForm.options
                              ? JSON.stringify(
                                  editForm.options
                                    .split(',')
                                    .map(s => s.trim())
                                    .filter(Boolean)
                                )
                              : '';
                          updateMutation.mutate({
                            id: f.id,
                            name: editForm.name,
                            field_type: editForm.field_type,
                            options: opts,
                            required: editForm.required,
                          });
                        }}
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm px-2 text-xs"
                        onClick={() => setEditingId(null)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm text-base-content">
                    {f.name}
                    {f.required && <span className="ml-1 text-[0.7rem] text-error">*</span>}
                  </span>
                  <span className="badge badge-info shrink-0 py-0 text-[0.65rem]">
                    {FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type}
                  </span>
                  {f.options &&
                    (() => {
                      try {
                        const o = JSON.parse(f.options);
                        return Array.isArray(o) ? (
                          <span className="shrink-0 text-[0.65rem] text-base-content/55">
                            {o.length} opções
                          </span>
                        ) : null;
                      } catch {
                        return null;
                      }
                    })()}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0 px-1.5 text-xs"
                    onClick={() => {
                      setEditingId(f.id);
                      let optionsStr = '';
                      if (f.options) {
                        try {
                          const o = JSON.parse(f.options);
                          if (Array.isArray(o)) optionsStr = o.join(', ');
                        } catch {
                          optionsStr = f.options;
                        }
                      }
                      setEditForm({
                        name: f.name,
                        field_type: f.field_type,
                        options: optionsStr,
                        required: f.required,
                      });
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0 px-1.5 text-xs text-error"
                    onClick={() => {
                      if (confirm(`Arquivar campo "${f.name}"?`)) deleteMutation.mutate(f.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </ListRow>
          ))}
          {fields.length === 0 && (
            <p className="py-2 text-center text-sm text-base-content/55">
              Nenhum campo personalizado criado
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Permissions Tab (Admin only) ──────────────────

const PERM_LABELS: Record<string, string> = {
  view_all_leads: 'Ver todos os leads',
  view_all_contacts: 'Ver todos os contatos',
  edit_contacts: 'Editar contatos',
  delete_leads: 'Excluir leads',
  export_data: 'Exportar dados',
  manage_pipeline: 'Gerenciar pipeline',
};

interface PermUser {
  id: number;
  name: string;
  email: string;
  permissions: Record<string, boolean>;
}

function PermissionsTab({
  addToast,
  queryClient,
}: {
  addToast: (message: string, type?: 'error' | 'success' | 'info') => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const { data } = useQuery<{ users: PermUser[] }>({
    queryKey: ['permissions'],
    queryFn: () => apiGet('/permissions/users'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, perms }: { userId: number; perms: Record<string, boolean> }) =>
      apiPut(`/permissions/users/${userId}`, { permissions: perms }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      addToast('Permissões atualizadas', 'success');
    },
    onError: () => addToast('Erro ao salvar permissões', 'error'),
  });

  const users = data?.users || [];
  const permKeys = Object.keys(PERM_LABELS);

  function togglePerm(user: PermUser, key: string) {
    const updated = { ...user.permissions, [key]: !user.permissions[key] };
    updateMutation.mutate({ userId: user.id, perms: updated });
  }

  return (
    <div className="max-w-[900px]">
      <div className="mb-4 flex items-center gap-2">
        <Shield size={18} className="text-info" />
        <h3 className="text-sm font-semibold text-base-content">Permissões dos Usuários</h3>
      </div>
      <p className="mb-5 text-xs text-base-content/55">
        Defina quais ações cada usuário da organização pode realizar. Por padrão, todos veem os
        contatos — o pipeline define quem trabalha com cada lead.
      </p>
      <div className="card bg-base-300 overflow-x-auto">
        <div className="card-body p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-base-300">
                <th className="px-3 py-2 text-left font-medium text-base-content/55">Usuário</th>
                {permKeys.map(k => (
                  <th
                    key={k}
                    className="whitespace-nowrap px-2 py-2 text-center font-medium text-base-content/55"
                  >
                    {PERM_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-base-300/50">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-base-content">{u.name}</div>
                    <div className="text-[0.7rem] text-base-content/55">{u.email}</div>
                  </td>
                  {permKeys.map(k => (
                    <td key={k} className="p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => togglePerm(u, k)}
                        className={`relative h-5 w-9 cursor-pointer rounded-full border-none transition-colors ${
                          u.permissions[k] ? 'bg-info' : 'bg-base-300/60'
                        }`}
                      >
                        <span
                          className="absolute top-0.5 size-4 rounded-full bg-base-content transition-[left] duration-200"
                          style={{ left: u.permissions[k] ? 18 : 2 }}
                        />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="py-4 text-center text-sm text-base-content/55">
              Nenhum usuário encontrado
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
