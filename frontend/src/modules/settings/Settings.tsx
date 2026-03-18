import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "../../shared/api";
import { useAuth } from "../../shared/store";
import { useToast } from "../../shared/ui/Toast";
import { Pencil, Trash2, Check, X } from "lucide-react";

interface Stage { id: number; name: string; sequence: number; is_won: boolean; }
interface LostReason { id: number; name: string; }
interface Source { id: number; name: string; }
interface CustomFieldDef { id: number; name: string; field_type: string; options: string; sequence: number; required: boolean; }

type Tab = 'profile' | 'stages' | 'reasons' | 'sources' | 'users' | 'custom-fields';

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
  ];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Configurações</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
        {tabs.filter(t => !t.adminOnly || isManager).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.5rem 1rem", borderRadius: "6px 6px 0 0", fontSize: "0.85rem",
              border: "none", cursor: "pointer",
              background: tab === t.key ? "rgba(0,112,255,0.12)" : "transparent",
              color: tab === t.key ? "#fff" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400,
              borderBottom: tab === t.key ? "2px solid var(--primary)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'stages' && isManager && <StagesTab addToast={addToast} queryClient={queryClient} />}
      {tab === 'reasons' && isManager && <ReasonsTab addToast={addToast} queryClient={queryClient} />}
      {tab === 'sources' && isManager && <SourcesTab addToast={addToast} queryClient={queryClient} />}
      {tab === 'custom-fields' && isManager && <CustomFieldsTab addToast={addToast} queryClient={queryClient} />}
      {tab === 'users' && isManager && <UsersTab addToast={addToast} queryClient={queryClient} />}
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: 800 }}>
      <div className="glass" style={{ padding: "1.5rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>Perfil</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Nome</span>
            <p style={{ fontSize: "0.9rem", color: "#fff" }}>{user?.name}</p>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>E-mail</span>
            <p style={{ fontSize: "0.9rem", color: "#fff" }}>{user?.email}</p>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Papel</span>
            <p style={{ fontSize: "0.9rem", color: "#fff" }}>
              <span className="badge badge-info">{user?.role === 'admin' ? 'Gestor' : 'Vendedor'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: "1.5rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>Sobre</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Produto</span>
            <p style={{ fontSize: "0.9rem" }}><span className="brand-name">Amplex</span> CRM</p>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Plataforma</span>
            <p style={{ fontSize: "0.9rem", color: "#fff" }}>IgaraLead</p>
          </div>
          <div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Versão</span>
            <p style={{ fontSize: "0.9rem", color: "#fff" }}>0.2.0</p>
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
    queryKey: ["stages"],
    queryFn: () => apiGet("/crm/stages"),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost("/crm/stages", { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stages"] }); setNewName(''); addToast("Estágio criado", "success"); },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => apiPut(`/crm/stages/${id}`, { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stages"] }); setEditingId(null); addToast("Estágio atualizado", "success"); },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/stages/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["stages"] }); addToast("Estágio excluído", "success"); },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const stages = data?.stages || [];

  return (
    <div className="glass" style={{ padding: "1.5rem", maxWidth: 600 }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>Estágios do Pipeline</h3>

      <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()); }} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input className="input" placeholder="Novo estágio..." value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!newName.trim()}>Adicionar</button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {stages.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
            {editingId === s.id ? (
              <>
                <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1, padding: "0.3rem 0.5rem" }} autoFocus />
                <button className="btn btn-primary btn-sm" onClick={() => updateMutation.mutate({ id: s.id, name: editName })} style={{ padding: "0.25rem 0.5rem" }}><Check size={14} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)} style={{ padding: "0.25rem 0.5rem" }}><X size={14} /></button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: "0.85rem", color: "#fff" }}>
                  {s.name}
                  {s.is_won && <span style={{ color: "var(--success)", marginLeft: "0.5rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}><Check size={12} /> Ganho</span>}
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>#{s.sequence}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(s.id); setEditName(s.name); }} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}><Pencil size={13} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`Excluir estágio "${s.name}"?`)) deleteMutation.mutate(s.id); }} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--danger)" }}><Trash2 size={13} /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReasonsTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const [newName, setNewName] = useState('');

  const { data } = useQuery<{ items: LostReason[] }>({
    queryKey: ["lost-reasons"],
    queryFn: () => apiGet("/crm/lost-reasons"),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost("/crm/lost-reasons", { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lost-reasons"] }); setNewName(''); addToast("Motivo criado", "success"); },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/lost-reasons/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lost-reasons"] }); addToast("Motivo arquivado", "success"); },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const reasons = data?.items || [];

  return (
    <div className="glass" style={{ padding: "1.5rem", maxWidth: 600 }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>Motivos de Perda</h3>

      <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()); }} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input className="input" placeholder="Novo motivo..." value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!newName.trim()}>Adicionar</button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {reasons.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
            <span style={{ flex: 1, fontSize: "0.85rem", color: "#fff" }}>{r.name}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`Arquivar motivo "${r.name}"?`)) deleteMutation.mutate(r.id); }} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--danger)" }}><Trash2 size={13} /></button>
          </div>
        ))}
        {reasons.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Nenhum motivo cadastrado</p>}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SourcesTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const [newName, setNewName] = useState('');

  const { data } = useQuery<{ items: Source[] }>({
    queryKey: ["sources"],
    queryFn: () => apiGet("/crm/sources"),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => apiPost("/crm/sources", { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["sources"] }); setNewName(''); addToast("Origem criada", "success"); },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const sources = data?.items || [];

  return (
    <div className="glass" style={{ padding: "1.5rem", maxWidth: 600 }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>Origens de Leads</h3>

      <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate(newName.trim()); }} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input className="input" placeholder="Nova origem..." value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!newName.trim()}>Adicionar</button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {sources.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
            <span style={{ flex: 1, fontSize: "0.85rem", color: "#fff" }}>{s.name}</span>
          </div>
        ))}
        {sources.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Nenhuma origem cadastrada</p>}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UsersTab({ addToast, queryClient }: { addToast: any; queryClient: any }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });

  const { data, isLoading } = useQuery<{ users?: Array<{ id: number; name: string; email: string; role?: string; is_active?: boolean }> }>({
    queryKey: ["hub-users"],
    queryFn: () => apiGet("/crm/hub/users"),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newUser) => apiPost("/crm/hub/users", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hub-users"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      addToast("Usuário criado", "success");
    },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/hub/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hub-users"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      addToast("Usuário desativado", "success");
    },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const users = Array.isArray(data) ? data : (data?.users || []);

  return (
    <div className="glass" style={{ padding: "1.5rem", maxWidth: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff" }}>Gerenciar Usuários (Hub)</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancelar' : '+ Novo Usuário'}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newUser); }}
          style={{ marginBottom: "1.25rem", padding: "1rem", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Nome *</label>
              <input className="input" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>E-mail *</label>
              <input className="input" type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Senha *</label>
              <input className="input" type="password" required minLength={6} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Papel</label>
              <select className="select" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="user">Vendedor</option>
                <option value="admin">Gestor</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-primary btn-sm" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Carregando...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {users.map((u) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 500 }}>{u.name}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.5rem" }}>{u.email}</span>
              </div>
              <span className="badge badge-info" style={{ fontSize: "0.7rem" }}>
                {u.role === 'admin' || u.role === 'super_admin' ? 'Gestor' : 'Vendedor'}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { if (confirm(`Desativar "${u.name}"?`)) deleteMutation.mutate(u.id); }}
                style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--danger)" }}
              >
                Desativar
              </button>
            </div>
          ))}
          {users.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Nenhum usuário encontrado</p>}
        </div>
      )}
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
  const [editForm, setEditForm] = useState({ name: '', field_type: '', options: '', required: false });

  const { data } = useQuery<{ items: CustomFieldDef[] }>({
    queryKey: ["custom-field-defs"],
    queryFn: () => apiGet("/crm/custom-fields"),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; field_type: string; options?: string; required?: boolean }) =>
      apiPost("/crm/custom-fields", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-field-defs"] });
      setNewName('');
      setNewType('text');
      setNewOptions('');
      setNewRequired(false);
      addToast("Campo criado", "success");
    },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; name: string; field_type: string; options: string; required: boolean }) =>
      apiPut(`/crm/custom-fields/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-field-defs"] });
      setEditingId(null);
      addToast("Campo atualizado", "success");
    },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-field-defs"] });
      addToast("Campo arquivado", "success");
    },
    onError: (e: Error) => addToast(e.message, "error"),
  });

  const fields = data?.items || [];

  return (
    <div className="glass" style={{ padding: "1.5rem", maxWidth: 700 }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "#fff", marginBottom: "0.5rem" }}>Campos Personalizados Globais</h3>
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        Defina campos personalizados que estarão disponíveis em todas as oportunidades.
      </p>

      {/* Create form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) {
            const opts = newType === 'select' && newOptions
              ? JSON.stringify(newOptions.split(',').map(s => s.trim()).filter(Boolean))
              : undefined;
            createMutation.mutate({ name: newName.trim(), field_type: newType, options: opts, required: newRequired });
          }
        }}
        style={{ marginBottom: "1.25rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.5rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Nome do campo</label>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: CNPJ" style={{ fontSize: "0.8rem" }} />
          </div>
          <div>
            <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Tipo</label>
            <select className="select" value={newType} onChange={(e) => setNewType(e.target.value)} style={{ fontSize: "0.8rem" }}>
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={!newName.trim()}>Adicionar</button>
        </div>
        {newType === 'select' && (
          <div style={{ marginTop: "0.5rem" }}>
            <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Opções (separadas por vírgula)</label>
            <input className="input" value={newOptions} onChange={(e) => setNewOptions(e.target.value)} placeholder='Ex: Opção A, Opção B, Opção C' style={{ fontSize: "0.8rem" }} />
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />
          Obrigatório
        </label>
      </form>

      {/* Field list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {fields.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", borderRadius: "6px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
            {editingId === f.id ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={{ flex: 1, fontSize: "0.8rem" }} autoFocus />
                  <select className="select" value={editForm.field_type} onChange={(e) => setEditForm({ ...editForm, field_type: e.target.value })} style={{ fontSize: "0.8rem" }}>
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {editForm.field_type === 'select' && (
                  <input className="input" value={editForm.options} onChange={(e) => setEditForm({ ...editForm, options: e.target.value })} placeholder="Opções (separadas por vírgula)" style={{ fontSize: "0.75rem" }} />
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    <input type="checkbox" checked={editForm.required} onChange={(e) => setEditForm({ ...editForm, required: e.target.checked })} />
                    Obrigatório
                  </label>
                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const opts = editForm.field_type === 'select' && editForm.options
                          ? JSON.stringify(editForm.options.split(',').map(s => s.trim()).filter(Boolean))
                          : '';
                        updateMutation.mutate({ id: f.id, name: editForm.name, field_type: editForm.field_type, options: opts, required: editForm.required });
                      }}
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                    ><Check size={13} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)} style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}><X size={13} /></button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: "0.85rem", color: "#fff" }}>
                  {f.name}
                  {f.required && <span style={{ color: "var(--danger)", marginLeft: "0.3rem", fontSize: "0.7rem" }}>*</span>}
                </span>
                <span className="badge badge-info" style={{ fontSize: "0.65rem" }}>
                  {FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type}
                </span>
                {f.options && (() => { try { const o = JSON.parse(f.options); return Array.isArray(o) ? <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{o.length} opções</span> : null; } catch { return null; } })()}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditingId(f.id);
                    let optionsStr = '';
                    if (f.options) { try { const o = JSON.parse(f.options); if (Array.isArray(o)) optionsStr = o.join(', '); } catch { optionsStr = f.options; } }
                    setEditForm({ name: f.name, field_type: f.field_type, options: optionsStr, required: f.required });
                  }}
                  style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                ><Pencil size={13} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm(`Arquivar campo "${f.name}"?`)) deleteMutation.mutate(f.id); }} style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--danger)" }}><Trash2 size={13} /></button>
              </>
            )}
          </div>
        ))}
        {fields.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: "0.5rem" }}>Nenhum campo personalizado criado</p>}
      </div>
    </div>
  );
}
