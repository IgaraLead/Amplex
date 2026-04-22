import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, apiUpload, crmUrl } from '@/shared/api';
import { useToast } from '@/shared/ui/useToast';
import { useAuth } from '@/shared/store';
import { Modal } from '@/shared/ui/Modal';
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

const INTERACTION_TYPES: Array<{
  value: string;
  label: string;
  icon: ReactNode;
  accentClass: string;
  badgeClass: string;
  borderClass: string;
}> = [
  {
    value: 'phone',
    label: 'Ligação',
    icon: <Phone size={14} />,
    accentClass: 'text-primary',
    badgeClass: 'border-primary/30 bg-primary/15 text-primary',
    borderClass: 'border-l-primary',
  },
  {
    value: 'email',
    label: 'E-mail',
    icon: <Mail size={14} />,
    accentClass: 'text-warning',
    badgeClass: 'border-warning/30 bg-warning/15 text-warning',
    borderClass: 'border-l-warning',
  },
  {
    value: 'whatsapp',
    label: 'WhatsApp',
    icon: <MessageCircle size={14} />,
    accentClass: 'text-success',
    badgeClass: 'border-success/30 bg-success/15 text-success',
    borderClass: 'border-l-success',
  },
  {
    value: 'meeting',
    label: 'Reunião',
    icon: <Handshake size={14} />,
    accentClass: 'text-info',
    badgeClass: 'border-info/30 bg-info/15 text-info',
    borderClass: 'border-l-info',
  },
  {
    value: 'visit',
    label: 'Visita',
    icon: <Building size={14} />,
    accentClass: 'text-secondary',
    badgeClass: 'border-secondary/30 bg-secondary/15 text-secondary',
    borderClass: 'border-l-secondary',
  },
  {
    value: 'note',
    label: 'Nota',
    icon: <FileText size={14} />,
    accentClass: 'text-base-content/70',
    badgeClass: 'border-base-300 bg-base-content/10 text-base-content/70',
    borderClass: 'border-l-base-content/30',
  },
];

export default function LeadDetail() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const orgBase = slug ? `/id/${slug}` : '';
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

  const [attachFiles, setAttachFiles] = useState<FileList | null>(null);
  const [attachDescription, setAttachDescription] = useState('');
  const [editingAttId, setEditingAttId] = useState<number | null>(null);
  const [editAttDesc, setEditAttDesc] = useState('');

  const [showAddField, setShowAddField] = useState(false);

  const isManager = user?.role === 'admin';

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
      navigate(`${orgBase}/leads`);
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
        <div className="py-12 text-center text-base-content/55">Carregando...</div>
      </div>
    );
  }

  const stages = stagesData?.stages || [];
  const interactions = interactionsData?.items || [];
  const attachments = attachmentsData?.items || [];
  const customFieldValues = customFieldsData?.items || [];
  const fieldDefs = customFieldDefs?.items || [];
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
      <div className="page-header">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="btn btn-ghost btn-sm border border-base-300 px-2.5"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title mb-1">{lead.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-info">{lead.stage_name}</span>
              {lead.tag_ids.map(tag => (
                <span key={tag.id} className="badge badge-info badge-sm py-0 text-[0.7rem]">
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditing(false);
                  setForm(lead);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
                Editar
              </button>
              {isManager && (
                <button
                  type="button"
                  className="btn btn-ghost border border-base-300"
                  onClick={() => setShowTransfer(true)}
                >
                  <RefreshCw size={14} /> Transferir
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost border border-warning text-warning"
                onClick={() => setShowLost(true)}
              >
                <XCircle size={14} /> Perdida
              </button>
              <button
                type="button"
                className="btn btn-error btn-sm"
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="card bg-base-300">
            <div className="card-body">
              <h3 className="mb-4 text-sm font-semibold">Informações</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <FieldShell label="Estágio">
                  {editing ? (
                    <select
                      className="select w-full"
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
                    <p className="text-sm text-base-content">{lead.stage_name}</p>
                  )}
                </FieldShell>
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
                <FieldShell label="Origem">
                  {editing ? (
                    <select
                      className="select w-full"
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
                      className={`text-sm ${
                        lead.source_name ? 'text-base-content' : 'text-base-content/40'
                      }`}
                    >
                      {lead.source_name || '—'}
                    </p>
                  )}
                </FieldShell>
              </div>

              <FieldShell label="Descrição" className="mt-6">
                {editing ? (
                  <textarea
                    className="input min-h-24 w-full"
                    rows={4}
                    value={form.description || ''}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                ) : (
                  <p
                    className={`whitespace-pre-wrap text-sm ${
                      lead.description ? 'text-base-content' : 'text-base-content/40'
                    }`}
                  >
                    {lead.description || 'Sem descrição'}
                  </p>
                )}
              </FieldShell>
            </div>
          </div>

          <div className="card bg-base-300">
            <div className="card-body">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-base-content">
                  Histórico de Interações ({interactions.length})
                </h3>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowInteractionForm(!showInteractionForm)}
                >
                  {showInteractionForm ? 'Cancelar' : '+ Nova Interação'}
                </button>
              </div>

              {showInteractionForm && (
                <div className="mb-5 rounded-lg border border-base-300 bg-white/[0.03] p-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {INTERACTION_TYPES.map(t => (
                      <InteractionTypeButton
                        key={t.value}
                        type={t}
                        active={newInteraction.type === t.value}
                        onClick={() => setNewInteraction({ ...newInteraction, type: t.value })}
                      />
                    ))}
                  </div>
                  <textarea
                    className="input mb-3 min-h-20 w-full"
                    rows={3}
                    placeholder="Descreva a interação..."
                    value={newInteraction.description}
                    onChange={e =>
                      setNewInteraction({ ...newInteraction, description: e.target.value })
                    }
                  />
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <div>
                      <label className="mb-1 block text-[0.7rem] text-base-content/55">
                        <Calendar size={11} className="mr-1 inline align-middle" />
                        Agendar Retorno
                      </label>
                      <input
                        className="input input-sm h-8 px-2 text-xs"
                        type="date"
                        value={interactionFollowup}
                        onChange={e => setInteractionFollowup(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[0.7rem] text-base-content/55">
                        Anexos
                      </label>
                      <input
                        type="file"
                        multiple
                        onChange={e => setInteractionFiles(e.target.files)}
                        className="text-[0.75rem] text-base-content/55"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
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

              <div className="flex flex-col gap-3">
                {interactions.length === 0 && (
                  <p className="py-4 text-center text-sm text-base-content/55">
                    Nenhuma interação registrada
                  </p>
                )}
                {interactions.map(msg => {
                  const typeInfo =
                    INTERACTION_TYPES.find(t => t.value === msg.type) || INTERACTION_TYPES[5];
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 rounded-lg border-l-[3px] bg-white/[0.02] p-3 ${typeInfo.borderClass}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={`flex items-center gap-1 text-xs font-semibold ${typeInfo.accentClass}`}
                          >
                            {typeInfo.icon} {typeInfo.label}
                          </span>
                          <span className="text-[0.7rem] text-base-content/55">
                            {new Date(msg.date).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <div
                          className="text-[0.825rem] leading-relaxed text-base-content/40"
                          dangerouslySetInnerHTML={{ __html: msg.body }}
                        />
                        {msg.author_name && (
                          <p className="mt-1.5 text-[0.7rem] text-base-content/55">
                            — {msg.author_name}
                          </p>
                        )}
                        {msg.attachments?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {msg.attachments.map(a => (
                              <span
                                key={a.id}
                                className="inline-flex items-center gap-1 rounded bg-white/[0.05] px-1.5 py-0.5 text-[0.7rem] text-base-content/55"
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
          </div>

          <div className="card bg-base-300">
            <div className="card-body">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-base-content">
                  <Paperclip size={14} /> Anexos ({attachments.length})
                </h3>
              </div>

              <div className="mb-4 rounded-lg border border-base-300 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[150px] flex-auto">
                    <label className="mb-1 block text-[0.7rem] text-base-content/55">
                      Arquivo(s)
                    </label>
                    <input
                      type="file"
                      multiple
                      onChange={e => setAttachFiles(e.target.files)}
                      className="text-[0.75rem] text-base-content/55"
                    />
                  </div>
                  <div className="min-w-[150px] flex-auto">
                    <label className="mb-1 block text-[0.7rem] text-base-content/55">
                      Descrição (opcional)
                    </label>
                    <input
                      className="input input-sm h-8 w-full px-2 text-xs"
                      value={attachDescription}
                      onChange={e => setAttachDescription(e.target.value)}
                      placeholder="Ex: Proposta comercial"
                    />
                  </div>
                  <button
                    type="button"
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

              <div className="flex flex-col gap-1.5">
                {attachments.length === 0 && (
                  <p className="py-2 text-center text-sm text-base-content/55">Nenhum anexo</p>
                )}
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 rounded-md border border-base-300 bg-white/[0.02] px-2.5 py-2"
                  >
                    <span className="text-base-content/70">{getFileIcon(att.mimetype)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-base-content">{att.name}</p>
                      {editingAttId === att.id ? (
                        <div className="mt-1 flex gap-1">
                          <input
                            className="input input-xs h-6 flex-1 px-1.5 text-[0.7rem]"
                            value={editAttDesc}
                            onChange={e => setEditAttDesc(e.target.value)}
                            placeholder="Descrição..."
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
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
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => setEditingAttId(null)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <p className="mt-0.5 text-[0.7rem] text-base-content/55">
                          {att.description || 'Sem descrição'} · {formatFileSize(att.size)}
                          {att.create_date &&
                            ` · ${new Date(att.create_date).toLocaleDateString('pt-BR')}`}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setEditingAttId(att.id);
                        setEditAttDesc(att.description);
                      }}
                      title="Editar descrição"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() =>
                        window.open(
                          crmUrl(`/crm/leads/${id}/attachments/${att.id}/download`),
                          '_blank'
                        )
                      }
                      title="Baixar"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => {
                        if (confirm(`Remover "${att.name}"?`))
                          deleteAttachmentMutation.mutate(att.id);
                      }}
                      title="Remover"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card bg-base-300">
            <div className="card-body p-5">
              <h3 className="mb-3 text-sm font-semibold">Detalhes</h3>
              <DetailRow label="Equipe" value={lead.team_name || '—'} />
              <DetailRow label="Empresa" value={lead.partner_name || '—'} />
              <DetailRow label="Origem" value={lead.source_name || '—'} />
              <DetailRow label="Cargo" value={lead.function || '—'} />
              <DetailRow
                label="Prazo"
                value={
                  lead.date_deadline
                    ? new Date(lead.date_deadline).toLocaleDateString('pt-BR')
                    : '—'
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
          </div>

          <div className="card bg-base-300">
            <div className="card-body p-5">
              <h3 className="mb-3 text-sm font-semibold">Localização</h3>
              <DetailRow label="Endereço" value={lead.street || '—'} />
              <DetailRow label="Cidade" value={lead.city || '—'} />
              <DetailRow label="Estado" value={lead.state_name || '—'} />
              <DetailRow label="País" value={lead.country_name || '—'} />
            </div>
          </div>

          <div className="card bg-base-300">
            <div className="card-body p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-base-content">
                  <Tag size={14} className="mr-1 inline align-middle" /> Campos Personalizados
                </h3>
                {unsetGlobalFields.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-[0.7rem]"
                    onClick={() => setShowAddField(!showAddField)}
                  >
                    {showAddField ? <X size={13} /> : '+ Campo'}
                  </button>
                )}
              </div>

              {showAddField && unsetGlobalFields.length > 0 && (
                <div className="mb-3 rounded-md border border-base-300 bg-white/[0.03] p-2.5">
                  <label className="mb-1.5 block text-[0.7rem] text-info">Adicionar campo:</label>
                  <div className="flex flex-wrap gap-1">
                    {unsetGlobalFields.map(def => (
                      <button
                        key={def.id}
                        type="button"
                        className="btn btn-ghost btn-xs border border-base-300 text-[0.7rem]"
                        onClick={() =>
                          setCustomFieldMutation.mutate({ field_id: def.id, value: '' })
                        }
                      >
                        + {def.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {customFieldValues.length === 0 && !showAddField && (
                <p className="py-2 text-center text-xs text-base-content/55">
                  {fieldDefs.length === 0
                    ? 'Nenhum campo personalizado definido'
                    : 'Nenhum campo personalizado'}
                </p>
              )}
              {customFieldValues.map(cfv => (
                <CustomFieldRow
                  key={cfv.id}
                  cfv={cfv}
                  onSave={value =>
                    setCustomFieldMutation.mutate({ field_id: cfv.field_id!, value })
                  }
                  onDelete={() => deleteCustomFieldMutation.mutate(cfv.id)}
                  fieldDef={cfv.field_id ? fieldDefs.find(d => d.id === cfv.field_id) : undefined}
                />
              ))}
            </div>
          </div>

          {integrationActions.length > 0 && (
            <div className="card bg-base-300">
              <div className="card-body p-5">
                <h3 className="mb-3 text-sm font-semibold">
                  <Link size={14} className="mr-1 inline align-middle" /> Integrações
                </h3>
                <div className="flex flex-col gap-2">
                  {hasAction('open_conversation') && (
                    <button
                      type="button"
                      className="btn btn-sm w-full justify-start gap-2 border border-success/30 bg-success/10 text-success text-xs"
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
                      type="button"
                      className="btn btn-sm w-full justify-start gap-2 border border-success/30 bg-success/10 text-success text-xs"
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
                      type="button"
                      className="btn btn-sm w-full justify-start gap-2 border border-info/30 bg-info/10 text-info text-xs"
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

                {enrichedData && (
                  <div className="mt-3 rounded-md border border-info/20 bg-info/5 p-2.5">
                    <p className="mb-1.5 text-[0.7rem] font-semibold text-info">Dados CNPJ</p>
                    {Object.entries(enrichedData)
                      .slice(0, 8)
                      .map(([key, val]) => (
                        <div key={key} className="flex justify-between py-0.5 text-[0.7rem]">
                          <span className="text-base-content/55">{key.replace(/_/g, ' ')}</span>
                          <span className="max-w-[60%] text-right text-base-content">
                            {String(val) || '—'}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} className="max-w-md px-4">
        <ModalCard title="Transferir Lead" onClose={() => setShowTransfer(false)}>
          <p className="mb-4 text-sm text-base-content/55">Selecione o novo responsável:</p>
          <div className="flex flex-col gap-2">
            {(usersData?.users || [])
              .filter(u => u.id !== lead.user_id)
              .map(u => (
                <button
                  key={u.id}
                  type="button"
                  className="btn btn-ghost justify-start border border-base-300"
                  onClick={() => transferMutation.mutate(u.id)}
                  disabled={transferMutation.isPending}
                >
                  {u.name} ({u.email})
                </button>
              ))}
          </div>
        </ModalCard>
      </Modal>

      <Modal open={showLost} onClose={() => setShowLost(false)} className="max-w-md px-4">
        <ModalCard title="Marcar como Perdida" onClose={() => setShowLost(false)}>
          <p className="mb-4 text-sm text-base-content/55">Selecione o motivo da perda:</p>
          <div className="flex flex-col gap-2">
            {(lostReasonsData?.items || []).map(r => (
              <button
                key={r.id}
                type="button"
                className="btn btn-ghost justify-start border border-base-300"
                onClick={() => lostMutation.mutate(r.id)}
                disabled={lostMutation.isPending}
              >
                {r.name}
              </button>
            ))}
            {(lostReasonsData?.items || []).length === 0 && (
              <p className="text-sm text-base-content/55">
                Nenhum motivo cadastrado. Cadastre em Configurações.
              </p>
            )}
          </div>
        </ModalCard>
      </Modal>
    </div>
  );
}

function FieldShell({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs text-base-content/55">{label}</label>
      {children}
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
    <FieldShell label={label}>
      {editing ? (
        <input
          className="input w-full"
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <p className={`text-sm ${value ? 'text-base-content' : 'text-base-content/40'}`}>
          {value || '—'}
        </p>
      )}
    </FieldShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-base-300/50 py-1.5 last:border-b-0">
      <span className="text-xs text-base-content/55">{label}</span>
      <span className="text-right text-xs text-base-content">{value}</span>
    </div>
  );
}

function ModalCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="card bg-base-300">
      <div className="card-body">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-base-content">{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InteractionTypeButton({
  type,
  active,
  onClick,
}: {
  type: {
    value: string;
    label: string;
    icon: ReactNode;
    accentClass: string;
    badgeClass: string;
    borderClass: string;
  };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs',
        active ? type.badgeClass : 'border-base-300 text-base-content/55',
      ].join(' ')}
    >
      {type.icon} {type.label}
    </button>
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
    <div className="flex items-center justify-between border-b border-base-300/50 py-1.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="text-[0.7rem] text-base-content/55">
          {cfv.field_name}
          {cfv.is_local && <span className="ml-1 text-[0.6rem] text-warning">local</span>}
        </span>
        {editing ? (
          <div className="mt-0.5 flex gap-1">
            {cfv.field_type === 'select' && options.length > 0 ? (
              <select
                className="select select-xs h-6 flex-1 px-1.5 text-[0.75rem]"
                value={val}
                onChange={e => setVal(e.target.value)}
              >
                <option value="">— Selecione —</option>
                {options.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : cfv.field_type === 'checkbox' ? (
              <label className="flex items-center gap-1.5 text-xs text-base-content">
                <input
                  type="checkbox"
                  className="checkbox checkbox-xs"
                  checked={val === 'true'}
                  onChange={e => setVal(e.target.checked ? 'true' : 'false')}
                />
                {val === 'true' ? 'Sim' : 'Não'}
              </label>
            ) : (
              <input
                className="input input-xs h-6 flex-1 px-1.5 text-[0.75rem]"
                value={val}
                onChange={e => setVal(e.target.value)}
                type={
                  cfv.field_type === 'number'
                    ? 'number'
                    : cfv.field_type === 'date'
                      ? 'date'
                      : 'text'
                }
                autoFocus
              />
            )}
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => {
                onSave(val);
                setEditing(false);
              }}
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
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
            className={`mt-0.5 cursor-pointer text-xs ${
              cfv.value ? 'text-base-content' : 'text-base-content/40'
            }`}
            onClick={() => setEditing(true)}
            title="Clique para editar"
          >
            {cfv.field_type === 'checkbox' ? (
              cfv.value === 'true' ? (
                <>
                  <Check size={12} className="inline" /> Sim
                </>
              ) : (
                <>
                  <X size={12} className="inline" /> Não
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
          type="button"
          className="btn btn-ghost btn-xs text-error"
          onClick={() => {
            if (confirm(`Remover campo "${cfv.field_name}"?`)) onDelete();
          }}
          title="Remover"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
