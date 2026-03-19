import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, apiUpload, crmUrl } from '../../shared/api';
import { useToast } from '../../shared/ui/Toast';
import { useAuth } from '../../shared/store';
import {
  Phone,
  Mail,
  MessageCircle,
  Handshake,
  Building,
  FileText,
  Paperclip,
  Image,
  FileSpreadsheet,
  FileText as FileDoc,
  Presentation,
  Video,
  Music,
  Archive,
  ArrowLeft,
  RefreshCw,
  XCircle,
  Calendar,
  Check,
  X,
  Pencil,
  Download,
  Trash2,
  Tag,
  Link,
  MessageSquare,
  Search,
} from 'lucide-react';

interface LeadData {
  id: number;
  name: string;
  type: string;
  stage_id: number;
  stage_name: string;
  contact_name: string;
  partner_id: number | null;
  partner_name: string;
  email_from: string;
  phone: string;
  mobile: string;
  expected_revenue: number;
  probability: number;
  priority: string;
  description: string;
  street: string;
  city: string;
  state_name: string;
  country_name: string;
  user_id: number | null;
  user_name: string;
  team_id: number | null;
  team_name: string;
  source_id: number | null;
  source_name: string;
  function: string;
  tag_ids: Array<{ id: number; name: string; color: number }>;
  create_date: string;
  write_date: string;
  date_deadline: string | null;
  date_closed: string | null;
  lost_reason: string;
}

interface Stage {
  id: number;
  name: string;
  sequence: number;
  is_won: boolean;
}
interface StagesResponse {
  stages: Stage[];
}

interface Interaction {
  id: number;
  type: string;
  body: string;
  preview: string;
  date: string;
  author_name: string;
  author_id: number | null;
  attachments: Array<{ id: number; name: string; size: number }>;
}

interface LeadAttachment {
  id: number;
  attachment_id: number;
  name: string;
  description: string;
  size: number;
  mimetype: string;
  create_date: string;
}

interface CustomFieldDef {
  id: number;
  name: string;
  field_type: string;
  options: string;
  sequence: number;
  required: boolean;
}

interface CustomFieldValue {
  id: number;
  field_id: number | null;
  field_name: string;
  field_type: string;
  value: string;
  is_local?: boolean;
  sequence: number;
}

interface LostReason {
  id: number;
  name: string;
}
interface UserItem {
  id: number;
  name: string;
  email: string;
}
interface SourceItem {
  id: number;
  name: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const INTERACTION_TYPES: Array<{ value: string; label: string; icon: ReactNode; color: string }> = [
  { value: 'phone', label: 'Ligação', icon: <Phone size={14} />, color: 'var(--info)' },
  { value: 'email', label: 'E-mail', icon: <Mail size={14} />, color: 'var(--warning)' },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: <MessageCircle size={14} />,
    color: 'var(--success)',
  },
  { value: 'meeting', label: 'Reunião', icon: <Handshake size={14} />, color: 'var(--primary)' },
  { value: 'visit', label: 'Visita', icon: <Building size={14} />, color: '#9b59b6' },
  { value: 'note', label: 'Nota', icon: <FileText size={14} />, color: 'var(--text-muted)' },
];

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<LeadData>>({});
  const [showTransfer, setShowTransfer] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [newInteraction, setNewInteraction] = useState({ type: 'note', description: '' });
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [interactionFollowup, setInteractionFollowup] = useState('');
  const [interactionFiles, setInteractionFiles] = useState<FileList | null>(null);

  // Attachments state
  const [attachFiles, setAttachFiles] = useState<FileList | null>(null);
  const [attachDescription, setAttachDescription] = useState('');
  const [editingAttId, setEditingAttId] = useState<number | null>(null);
  const [editAttDesc, setEditAttDesc] = useState('');

  // Custom fields state
  const [showAddField, setShowAddField] = useState(false);

  const isManager = user?.role === 'admin';

  // Integration state
  interface IntegrationAction {
    key: string;
    label: string;
    description: string;
    target: string;
    target_url: string;
    endpoint: string;
    method: string;
  }
  const { data: integrationsData } = useQuery<{ actions: IntegrationAction[] }>({
    queryKey: ['integrations'],
    queryFn: () => apiGet('/crm/integrations'),
    staleTime: 5 * 60 * 1000,
  });
  const integrationActions = integrationsData?.actions || [];
  const hasAction = (key: string) => integrationActions.some(a => a.key === key);

  const [enrichedData, setEnrichedData] = useState<Record<string, string> | null>(null);

  const openConversationMutation = useMutation<{ conversation_url?: string }, Error, void>({
    mutationFn: () =>
      apiPost<{ conversation_url?: string }>('/crm/integrations/open-conversation', {
        lead_id: Number(id),
      }),
    onSuccess: (data: { conversation_url?: string }) => {
      if (data.conversation_url) {
        window.open(data.conversation_url, '_blank');
        addToast('Conversa aberta no Nexus', 'success');
      } else {
        addToast('Conversa criada, mas URL não retornada', 'info');
      }
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const enrichCnpjMutation = useMutation<
    { data?: Record<string, string> },
    Error,
    string | undefined
  >({
    mutationFn: (cnpj?: string) =>
      apiPost<{ data?: Record<string, string> }>('/crm/integrations/enrich-cnpj', {
        lead_id: Number(id),
        cnpj,
      }),
    onSuccess: (data: { data?: Record<string, string> }) => {
      if (data.data && typeof data.data === 'object') {
        setEnrichedData(data.data);
      }
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      addToast('Dados do CNPJ consultados', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const { data: lead, isLoading } = useQuery<LeadData>({
    queryKey: ['lead', id],
    queryFn: () => apiGet(`/crm/leads/${id}`),
    enabled: !!id,
  });

  const { data: stagesData } = useQuery<StagesResponse>({
    queryKey: ['stages'],
    queryFn: () => apiGet('/crm/stages'),
  });

  const { data: interactionsData, refetch: refetchInteractions } = useQuery<{
    items: Interaction[];
  }>({
    queryKey: ['interactions', id],
    queryFn: () => apiGet(`/crm/leads/${id}/interactions`),
    enabled: !!id,
  });

  const { data: attachmentsData, refetch: refetchAttachments } = useQuery<{
    items: LeadAttachment[];
  }>({
    queryKey: ['lead-attachments', id],
    queryFn: () => apiGet(`/crm/leads/${id}/attachments`),
    enabled: !!id,
  });

  const { data: customFieldsData, refetch: refetchCustomFields } = useQuery<{
    items: CustomFieldValue[];
  }>({
    queryKey: ['lead-custom-fields', id],
    queryFn: () => apiGet(`/crm/leads/${id}/custom-fields`),
    enabled: !!id,
  });

  const { data: customFieldDefs } = useQuery<{ items: CustomFieldDef[] }>({
    queryKey: ['custom-field-defs'],
    queryFn: () => apiGet('/crm/custom-fields'),
  });

  const { data: usersData } = useQuery<{ users: UserItem[] }>({
    queryKey: ['users'],
    queryFn: () => apiGet('/crm/users'),
    enabled: isManager && showTransfer,
  });

  const { data: lostReasonsData } = useQuery<{ items: LostReason[] }>({
    queryKey: ['lost-reasons'],
    queryFn: () => apiGet('/crm/lost-reasons'),
    enabled: showLost,
  });

  const { data: sourcesData } = useQuery<{ items: SourceItem[] }>({
    queryKey: ['sources'],
    queryFn: () => apiGet('/crm/sources'),
  });

  useEffect(() => {
    if (lead) setForm(lead);
  }, [lead]);

  const updateMutation = useMutation({
    mutationFn: (body: Partial<LeadData>) => apiPut(`/crm/leads/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setEditing(false);
      addToast('Oportunidade atualizada', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/crm/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      addToast('Oportunidade arquivada', 'success');
      navigate('/leads');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const interactionMutation = useMutation({
    mutationFn: (body: {
      type: string;
      description: string;
      followup_date?: string;
      files?: FileList | null;
    }) => {
      if (body.files && body.files.length > 0) {
        const fd = new FormData();
        fd.append('type', body.type);
        fd.append('description', body.description);
        if (body.followup_date) fd.append('followup_date', body.followup_date);
        Array.from(body.files).forEach(f => fd.append('files', f));
        return apiUpload(`/crm/leads/${id}/interactions`, fd);
      }
      return apiPost(`/crm/leads/${id}/interactions`, {
        type: body.type,
        description: body.description,
        followup_date: body.followup_date || undefined,
      });
    },
    onSuccess: () => {
      refetchInteractions();
      setNewInteraction({ type: 'note', description: '' });
      setInteractionFollowup('');
      setInteractionFiles(null);
      setShowInteractionForm(false);
      addToast('Interação registrada', 'success');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const transferMutation = useMutation({
    mutationFn: (userId: number) => apiPost(`/crm/leads/${id}/transfer`, { user_id: userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      refetchInteractions();
      setShowTransfer(false);
      addToast('Lead transferido', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const lostMutation = useMutation({
    mutationFn: (reasonId: number) =>
      apiPost(`/crm/leads/${id}/lost`, { lost_reason_id: reasonId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      refetchInteractions();
      setShowLost(false);
      addToast('Oportunidade marcada como perdida', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  // Attachment mutations
  const uploadAttachmentMutation = useMutation({
    mutationFn: (data: { files: FileList; description: string }) => {
      const fd = new FormData();
      Array.from(data.files).forEach(f => fd.append('files', f));
      if (data.description) fd.append('description', data.description);
      return apiUpload(`/crm/leads/${id}/attachments`, fd);
    },
    onSuccess: () => {
      refetchAttachments();
      setAttachFiles(null);
      setAttachDescription('');
      addToast('Arquivo(s) anexado(s)', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateAttachmentMutation = useMutation({
    mutationFn: ({ attId, description }: { attId: number; description: string }) =>
      apiPut(`/crm/leads/${id}/attachments/${attId}`, { description }),
    onSuccess: () => {
      refetchAttachments();
      setEditingAttId(null);
      addToast('Descrição atualizada', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attId: number) => apiDelete(`/crm/leads/${id}/attachments/${attId}`),
    onSuccess: () => {
      refetchAttachments();
      addToast('Anexo removido', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  // Custom field mutations
  const setCustomFieldMutation = useMutation({
    mutationFn: (body: { field_id: number; value: string }) =>
      apiPost(`/crm/leads/${id}/custom-fields`, body),
    onSuccess: () => {
      refetchCustomFields();
      setShowAddField(false);
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteCustomFieldMutation = useMutation({
    mutationFn: (valueId: number) => apiDelete(`/crm/leads/${id}/custom-fields/${valueId}`),
    onSuccess: () => {
      refetchCustomFields();
      addToast('Campo removido', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  if (isLoading || !lead) {
    return (
      <div className="page">
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Carregando...
        </div>
      </div>
    );
  }

  const stages = stagesData?.stages || [];
  const interactions = interactionsData?.items || [];
  const attachments = attachmentsData?.items || [];
  const customFieldValues = customFieldsData?.items || [];
  const fieldDefs = customFieldDefs?.items || [];
  // Global fields not yet added to this lead
  const unsetGlobalFields = fieldDefs.filter(
    d => !customFieldValues.some(v => v.field_id === d.id)
  );

  function handleSave() {
    if (!lead) return;
    const changes: Record<string, unknown> = {};
    const fields = [
      'name',
      'contact_name',
      'email_from',
      'phone',
      'mobile',
      'expected_revenue',
      'probability',
      'priority',
      'description',
      'street',
      'city',
      'date_deadline',
      'function',
    ] as const;
    for (const f of fields) {
      if (form[f] !== lead[f]) changes[f] = form[f];
    }
    if (form.stage_id !== lead.stage_id) changes.stage_id = form.stage_id;
    if (form.source_id !== lead.source_id) changes.source_id = form.source_id;
    updateMutation.mutate(changes);
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className="btn btn-ghost"
            onClick={() => navigate(-1)}
            style={{ border: '1px solid var(--border)', padding: '0.4rem 0.6rem' }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title" style={{ marginBottom: '0.2rem' }}>
              {lead.name}
            </h1>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge-info">{lead.stage_name}</span>
              {lead.tag_ids.map(tag => (
                <span key={tag.id} className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setForm(lead);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => setEditing(true)}>
                Editar
              </button>
              {isManager && (
                <button
                  className="btn btn-ghost"
                  style={{ border: '1px solid var(--border)' }}
                  onClick={() => setShowTransfer(true)}
                >
                  <RefreshCw size={14} /> Transferir
                </button>
              )}
              <button
                className="btn btn-ghost"
                style={{ border: '1px solid var(--warning)', color: 'var(--warning)' }}
                onClick={() => setShowLost(true)}
              >
                <XCircle size={14} /> Perdida
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm('Arquivar esta oportunidade?')) deleteMutation.mutate();
                }}
              >
                Arquivar
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Main Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass" style={{ padding: '1.5rem' }}>
            <h3
              style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', marginBottom: '1rem' }}
            >
              Informações
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field
                label="Nome"
                value={form.name || ''}
                editing={editing}
                onChange={v => setForm({ ...form, name: v })}
              />
              <Field
                label="Contato"
                value={form.contact_name || ''}
                editing={editing}
                onChange={v => setForm({ ...form, contact_name: v })}
              />
              <Field
                label="E-mail"
                value={form.email_from || ''}
                editing={editing}
                type="email"
                onChange={v => setForm({ ...form, email_from: v })}
              />
              <Field
                label="Telefone"
                value={form.phone || ''}
                editing={editing}
                onChange={v => setForm({ ...form, phone: v })}
              />
              <Field
                label="Celular"
                value={form.mobile || ''}
                editing={editing}
                onChange={v => setForm({ ...form, mobile: v })}
              />
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.3rem',
                  }}
                >
                  Estágio
                </label>
                {editing ? (
                  <select
                    className="select"
                    value={form.stage_id || ''}
                    onChange={e => setForm({ ...form, stage_id: parseInt(e.target.value) })}
                  >
                    {stages.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: '#fff' }}>{lead.stage_name}</p>
                )}
              </div>
              <Field
                label="Receita Esperada"
                value={
                  editing
                    ? String(form.expected_revenue || 0)
                    : formatCurrency(lead.expected_revenue)
                }
                editing={editing}
                type={editing ? 'number' : 'text'}
                onChange={v => setForm({ ...form, expected_revenue: parseFloat(v) || 0 })}
              />
              <Field
                label="Probabilidade (%)"
                value={editing ? String(form.probability || 0) : `${lead.probability}%`}
                editing={editing}
                type={editing ? 'number' : 'text'}
                onChange={v => setForm({ ...form, probability: parseFloat(v) || 0 })}
              />
              <Field
                label="Cargo"
                value={form.function || ''}
                editing={editing}
                onChange={v => setForm({ ...form, function: v })}
              />
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.3rem',
                  }}
                >
                  Origem
                </label>
                {editing ? (
                  <select
                    className="select"
                    value={form.source_id || ''}
                    onChange={e =>
                      setForm({
                        ...form,
                        source_id: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Sem origem</option>
                    {(sourcesData?.items || []).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: lead.source_name ? '#fff' : 'var(--text-light)',
                    }}
                  >
                    {lead.source_name || '—'}
                  </p>
                )}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  marginBottom: '0.3rem',
                }}
              >
                Descrição
              </label>
              {editing ? (
                <textarea
                  className="input"
                  rows={4}
                  value={form.description || ''}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              ) : (
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: lead.description ? '#fff' : 'var(--text-light)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {lead.description || 'Sem descrição'}
                </p>
              )}
            </div>
          </div>

          {/* Timeline / Interactions */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                Histórico de Interações ({interactions.length})
              </h3>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowInteractionForm(!showInteractionForm)}
              >
                {showInteractionForm ? 'Cancelar' : '+ Nova Interação'}
              </button>
            </div>

            {/* New interaction form */}
            {showInteractionForm && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    marginBottom: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {INTERACTION_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setNewInteraction({ ...newInteraction, type: t.value })}
                      style={{
                        padding: '0.35rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        border:
                          newInteraction.type === t.value
                            ? `1px solid ${t.color}`
                            : '1px solid var(--border)',
                        background:
                          newInteraction.type === t.value ? `${t.color}20` : 'transparent',
                        color: newInteraction.type === t.value ? t.color : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Descreva a interação..."
                  value={newInteraction.description}
                  onChange={e =>
                    setNewInteraction({ ...newInteraction, description: e.target.value })
                  }
                  style={{ marginBottom: '0.75rem' }}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        display: 'block',
                        marginBottom: '0.2rem',
                      }}
                    >
                      <Calendar size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                      Agendar Retorno
                    </label>
                    <input
                      className="input"
                      type="date"
                      value={interactionFollowup}
                      onChange={e => setInteractionFollowup(e.target.value)}
                      style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        display: 'block',
                        marginBottom: '0.2rem',
                      }}
                    >
                      Anexos
                    </label>
                    <input
                      type="file"
                      multiple
                      onChange={e => setInteractionFiles(e.target.files)}
                      style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                    />
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!newInteraction.description.trim() || interactionMutation.isPending}
                  onClick={() =>
                    interactionMutation.mutate({
                      ...newInteraction,
                      followup_date: interactionFollowup || undefined,
                      files: interactionFiles,
                    })
                  }
                >
                  {interactionMutation.isPending ? 'Registrando...' : 'Registrar Interação'}
                </button>
              </div>
            )}

            {/* Interaction timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {interactions.length === 0 && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    padding: '1rem',
                  }}
                >
                  Nenhuma interação registrada
                </p>
              )}
              {interactions.map(msg => {
                const typeInfo =
                  INTERACTION_TYPES.find(t => t.value === msg.type) || INTERACTION_TYPES[5];
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.02)',
                      borderLeft: `3px solid ${typeInfo.color}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.3rem',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: typeInfo.color,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          {typeInfo.icon} {typeInfo.label}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(msg.date).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.825rem',
                          color: 'var(--text-light)',
                          lineHeight: 1.5,
                        }}
                        dangerouslySetInnerHTML={{ __html: msg.body }}
                      />
                      {msg.author_name && (
                        <p
                          style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            marginTop: '0.35rem',
                          }}
                        >
                          — {msg.author_name}
                        </p>
                      )}
                      {msg.attachments.length > 0 && (
                        <div
                          style={{
                            marginTop: '0.35rem',
                            display: 'flex',
                            gap: '0.4rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          {msg.attachments.map(a => (
                            <span
                              key={a.id}
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.2rem 0.4rem',
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              <Paperclip size={11} /> {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attachments */}
          <div className="glass" style={{ padding: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Paperclip size={14} /> Anexos ({attachments.length})
              </h3>
            </div>

            {/* Upload form */}
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}
              >
                <div style={{ flex: '1 1 auto', minWidth: 150 }}>
                  <label
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      display: 'block',
                      marginBottom: '0.2rem',
                    }}
                  >
                    Arquivo(s)
                  </label>
                  <input
                    type="file"
                    multiple
                    onChange={e => setAttachFiles(e.target.files)}
                    style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                  />
                </div>
                <div style={{ flex: '1 1 auto', minWidth: 150 }}>
                  <label
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      display: 'block',
                      marginBottom: '0.2rem',
                    }}
                  >
                    Descrição (opcional)
                  </label>
                  <input
                    className="input"
                    value={attachDescription}
                    onChange={e => setAttachDescription(e.target.value)}
                    placeholder="Ex: Proposta comercial"
                    style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                  />
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={
                    !attachFiles || attachFiles.length === 0 || uploadAttachmentMutation.isPending
                  }
                  onClick={() => {
                    if (attachFiles)
                      uploadAttachmentMutation.mutate({
                        files: attachFiles,
                        description: attachDescription,
                      });
                  }}
                >
                  {uploadAttachmentMutation.isPending ? 'Enviando...' : 'Anexar'}
                </button>
              </div>
            </div>

            {/* Attachment list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {attachments.length === 0 && (
                <p
                  style={{
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    padding: '0.5rem',
                  }}
                >
                  Nenhum anexo
                </p>
              )}
              {attachments.map(att => (
                <div
                  key={att.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.65rem',
                    borderRadius: '6px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>{getFileIcon(att.mimetype)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: '0.8rem',
                        color: '#fff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {att.name}
                    </p>
                    {editingAttId === att.id ? (
                      <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem' }}>
                        <input
                          className="input"
                          value={editAttDesc}
                          onChange={e => setEditAttDesc(e.target.value)}
                          placeholder="Descrição..."
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', flex: 1 }}
                          autoFocus
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                          onClick={() =>
                            updateAttachmentMutation.mutate({
                              attId: att.id,
                              description: editAttDesc,
                            })
                          }
                        >
                          <Check size={12} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem' }}
                          onClick={() => setEditingAttId(null)}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <p
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          marginTop: '0.1rem',
                        }}
                      >
                        {att.description || 'Sem descrição'} · {formatFileSize(att.size)}
                        {att.create_date &&
                          ` · ${new Date(att.create_date).toLocaleDateString('pt-BR')}`}
                      </p>
                    )}
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditingAttId(att.id);
                      setEditAttDesc(att.description);
                    }}
                    title="Editar descrição"
                    style={{ padding: '0.2rem 0.35rem', fontSize: '0.7rem' }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      window.open(
                        crmUrl(`/crm/leads/${id}/attachments/${att.id}/download`),
                        '_blank'
                      )
                    }
                    title="Baixar"
                    style={{ padding: '0.2rem 0.35rem', fontSize: '0.7rem' }}
                  >
                    <Download size={12} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (confirm(`Remover "${att.name}"?`))
                        deleteAttachmentMutation.mutate(att.id);
                    }}
                    title="Remover"
                    style={{
                      padding: '0.2rem 0.35rem',
                      fontSize: '0.7rem',
                      color: 'var(--danger)',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass" style={{ padding: '1.25rem' }}>
            <h3
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#fff',
                marginBottom: '0.75rem',
              }}
            >
              Detalhes
            </h3>
            <DetailRow label="Responsável" value={lead.user_name || 'Não atribuído'} />
            <DetailRow label="Equipe" value={lead.team_name || '—'} />
            <DetailRow label="Empresa" value={lead.partner_name || '—'} />
            <DetailRow label="Origem" value={lead.source_name || '—'} />
            <DetailRow label="Cargo" value={lead.function || '—'} />
            <DetailRow
              label="Prazo"
              value={
                lead.date_deadline ? new Date(lead.date_deadline).toLocaleDateString('pt-BR') : '—'
              }
            />
            <DetailRow
              label="Criado em"
              value={new Date(lead.create_date).toLocaleDateString('pt-BR')}
            />
            <DetailRow
              label="Última atualização"
              value={new Date(lead.write_date).toLocaleDateString('pt-BR')}
            />
            {lead.date_closed && (
              <DetailRow
                label="Encerrado em"
                value={new Date(lead.date_closed).toLocaleDateString('pt-BR')}
              />
            )}
            {lead.lost_reason && <DetailRow label="Motivo da perda" value={lead.lost_reason} />}
          </div>

          <div className="glass" style={{ padding: '1.25rem' }}>
            <h3
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#fff',
                marginBottom: '0.75rem',
              }}
            >
              Localização
            </h3>
            <DetailRow label="Endereço" value={lead.street || '—'} />
            <DetailRow label="Cidade" value={lead.city || '—'} />
            <DetailRow label="Estado" value={lead.state_name || '—'} />
            <DetailRow label="País" value={lead.country_name || '—'} />
          </div>

          {/* Custom Fields */}
          <div className="glass" style={{ padding: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                <Tag size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Campos
                Personalizados
              </h3>
              {unsetGlobalFields.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAddField(!showAddField)}
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem' }}
                >
                  {showAddField ? <X size={13} /> : '+ Campo'}
                </button>
              )}
            </div>

            {/* Add global field to this lead */}
            {showAddField && unsetGlobalFields.length > 0 && (
              <div
                style={{
                  marginBottom: '0.75rem',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                }}
              >
                <label
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--info)',
                    display: 'block',
                    marginBottom: '0.3rem',
                  }}
                >
                  Adicionar campo:
                </label>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                  {unsetGlobalFields.map(def => (
                    <button
                      key={def.id}
                      className="btn btn-ghost btn-sm"
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.2rem 0.5rem',
                        border: '1px solid var(--border)',
                      }}
                      onClick={() => setCustomFieldMutation.mutate({ field_id: def.id, value: '' })}
                    >
                      + {def.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom field values */}
            {customFieldValues.length === 0 && !showAddField && (
              <p
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '0.5rem 0',
                }}
              >
                {fieldDefs.length === 0
                  ? 'Nenhum campo personalizado definido'
                  : 'Nenhum campo personalizado'}
              </p>
            )}
            {customFieldValues.map(cfv => (
              <CustomFieldRow
                key={cfv.id}
                cfv={cfv}
                onSave={value => setCustomFieldMutation.mutate({ field_id: cfv.field_id!, value })}
                onDelete={() => deleteCustomFieldMutation.mutate(cfv.id)}
                fieldDef={cfv.field_id ? fieldDefs.find(d => d.id === cfv.field_id) : undefined}
              />
            ))}
          </div>

          {/* Cross-Product Integrations */}
          {integrationActions.length > 0 && (
            <div className="glass" style={{ padding: '1.25rem' }}>
              <h3
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: '#fff',
                  marginBottom: '0.75rem',
                }}
              >
                <Link size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                Integrações
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {hasAction('open_conversation') && (
                  <button
                    className="btn btn-sm"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      gap: '0.5rem',
                      background: 'rgba(52,199,89,0.1)',
                      border: '1px solid rgba(52,199,89,0.3)',
                      color: 'var(--success)',
                      fontSize: '0.8rem',
                    }}
                    onClick={() => openConversationMutation.mutate()}
                    disabled={openConversationMutation.isPending || !(lead.mobile || lead.phone)}
                    title={
                      !(lead.mobile || lead.phone)
                        ? 'Lead sem telefone/celular'
                        : 'Abrir conversa no Nexus'
                    }
                  >
                    {openConversationMutation.isPending ? (
                      'Abrindo...'
                    ) : (
                      <>
                        <MessageSquare size={14} /> Abrir WhatsApp (Nexus)
                      </>
                    )}
                  </button>
                )}
                {hasAction('send_whatsapp') && !hasAction('open_conversation') && (
                  <button
                    className="btn btn-sm"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      gap: '0.5rem',
                      background: 'rgba(52,199,89,0.1)',
                      border: '1px solid rgba(52,199,89,0.3)',
                      color: 'var(--success)',
                      fontSize: '0.8rem',
                    }}
                    onClick={() => openConversationMutation.mutate()}
                    disabled={openConversationMutation.isPending || !(lead.mobile || lead.phone)}
                  >
                    {openConversationMutation.isPending ? (
                      'Enviando...'
                    ) : (
                      <>
                        <MessageSquare size={14} /> Enviar WhatsApp
                      </>
                    )}
                  </button>
                )}
                {hasAction('lookup_cnpj') && (
                  <button
                    className="btn btn-sm"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      gap: '0.5rem',
                      background: 'rgba(0,112,255,0.1)',
                      border: '1px solid rgba(0,112,255,0.3)',
                      color: 'var(--info)',
                      fontSize: '0.8rem',
                    }}
                    onClick={() => enrichCnpjMutation.mutate(undefined)}
                    disabled={enrichCnpjMutation.isPending}
                  >
                    {enrichCnpjMutation.isPending ? (
                      'Consultando...'
                    ) : (
                      <>
                        <Search size={14} /> Consultar CNPJ (Entity)
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Enriched CNPJ data */}
              {enrichedData && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.65rem',
                    borderRadius: '6px',
                    background: 'rgba(0,112,255,0.05)',
                    border: '1px solid rgba(0,112,255,0.15)',
                  }}
                >
                  <p
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--info)',
                      fontWeight: 600,
                      marginBottom: '0.4rem',
                    }}
                  >
                    Dados CNPJ
                  </p>
                  {Object.entries(enrichedData)
                    .slice(0, 8)
                    .map(([key, val]) => (
                      <div
                        key={key}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '0.2rem 0',
                          fontSize: '0.7rem',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>{key.replace(/_/g, ' ')}</span>
                        <span style={{ color: '#fff', textAlign: 'right', maxWidth: '60%' }}>
                          {String(val) || '—'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransfer && (
        <Modal title="Transferir Lead" onClose={() => setShowTransfer(false)}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Selecione o novo responsável:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(usersData?.users || [])
              .filter(u => u.id !== lead.user_id)
              .map(u => (
                <button
                  key={u.id}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', border: '1px solid var(--border)' }}
                  onClick={() => transferMutation.mutate(u.id)}
                  disabled={transferMutation.isPending}
                >
                  {u.name} ({u.email})
                </button>
              ))}
          </div>
        </Modal>
      )}

      {/* Lost Reason Modal */}
      {showLost && (
        <Modal title="Marcar como Perdida" onClose={() => setShowLost(false)}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Selecione o motivo da perda:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(lostReasonsData?.items || []).map(r => (
              <button
                key={r.id}
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start', border: '1px solid var(--border)' }}
                onClick={() => lostMutation.mutate(r.id)}
                disabled={lostMutation.isPending}
              >
                {r.name}
              </button>
            ))}
            {(lostReasonsData?.items || []).length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Nenhum motivo cadastrado. Cadastre em Configurações.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          marginBottom: '0.3rem',
        }}
      >
        {label}
      </label>
      {editing ? (
        <input
          className="input"
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <p style={{ fontSize: '0.875rem', color: value ? '#fff' : 'var(--text-light)' }}>
          {value || '—'}
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '0.4rem 0',
        borderBottom: '1px solid rgba(45,56,71,0.3)',
      }}
    >
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.8rem', color: '#fff', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onClick={onClose}
    >
      <div
        className="glass"
        style={{ width: '100%', maxWidth: 440, padding: '2rem' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.25rem 0.5rem' }}>
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function getFileIcon(mimetype: string): ReactNode {
  if (mimetype.startsWith('image/')) return <Image size={14} />;
  if (mimetype === 'application/pdf') return <FileDoc size={14} />;
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel') || mimetype.includes('.sheet'))
    return <FileSpreadsheet size={14} />;
  if (mimetype.includes('document') || mimetype.includes('word') || mimetype.includes('.document'))
    return <FileText size={14} />;
  if (mimetype.includes('presentation') || mimetype.includes('powerpoint'))
    return <Presentation size={14} />;
  if (mimetype.startsWith('video/')) return <Video size={14} />;
  if (mimetype.startsWith('audio/')) return <Music size={14} />;
  if (mimetype.includes('zip') || mimetype.includes('compressed') || mimetype.includes('archive'))
    return <Archive size={14} />;
  return <Paperclip size={14} />;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function CustomFieldRow({
  cfv,
  onSave,
  onDelete,
  fieldDef,
}: {
  cfv: CustomFieldValue;
  onSave: (value: string) => void;
  onDelete: () => void;
  fieldDef?: CustomFieldDef;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(cfv.value);

  const options: string[] = fieldDef?.options
    ? (() => {
        try {
          return JSON.parse(fieldDef.options);
        } catch {
          return [];
        }
      })()
    : [];

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.4rem 0',
        borderBottom: '1px solid rgba(45,56,71,0.3)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {cfv.field_name}
          {cfv.is_local && (
            <span style={{ marginLeft: '0.3rem', fontSize: '0.6rem', color: 'var(--warning)' }}>
              local
            </span>
          )}
        </span>
        {editing ? (
          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.15rem' }}>
            {cfv.field_type === 'select' && options.length > 0 ? (
              <select
                className="select"
                value={val}
                onChange={e => setVal(e.target.value)}
                style={{ flex: 1, padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}
              >
                <option value="">— Selecione —</option>
                {options.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : cfv.field_type === 'checkbox' ? (
              <label
                style={{
                  fontSize: '0.8rem',
                  color: '#fff',
                  display: 'flex',
                  gap: '0.3rem',
                  alignItems: 'center',
                }}
              >
                <input
                  type="checkbox"
                  checked={val === 'true'}
                  onChange={e => setVal(e.target.checked ? 'true' : 'false')}
                />
                {val === 'true' ? 'Sim' : 'Não'}
              </label>
            ) : (
              <input
                className="input"
                value={val}
                onChange={e => setVal(e.target.value)}
                type={
                  cfv.field_type === 'number'
                    ? 'number'
                    : cfv.field_type === 'date'
                      ? 'date'
                      : 'text'
                }
                style={{ flex: 1, padding: '0.2rem 0.3rem', fontSize: '0.75rem' }}
                autoFocus
              />
            )}
            <button
              className="btn btn-primary btn-sm"
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem' }}
              onClick={() => {
                onSave(val);
                setEditing(false);
              }}
            >
              <Check size={12} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '0.15rem 0.4rem', fontSize: '0.65rem' }}
              onClick={() => {
                setVal(cfv.value);
                setEditing(false);
              }}
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <p
            style={{
              fontSize: '0.8rem',
              color: cfv.value ? '#fff' : 'var(--text-light)',
              cursor: 'pointer',
              marginTop: '0.1rem',
            }}
            onClick={() => setEditing(true)}
            title="Clique para editar"
          >
            {cfv.field_type === 'checkbox' ? (
              cfv.value === 'true' ? (
                <>
                  <Check size={12} /> Sim
                </>
              ) : (
                <>
                  <X size={12} /> Não
                </>
              )
            ) : (
              cfv.value || '—'
            )}
          </p>
        )}
      </div>
      {!editing && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (confirm(`Remover campo "${cfv.field_name}"?`)) onDelete();
          }}
          title="Remover"
          style={{ padding: '0.15rem 0.3rem', fontSize: '0.65rem', color: 'var(--danger)' }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
