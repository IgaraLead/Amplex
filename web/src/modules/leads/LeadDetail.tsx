import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Paperclip, Plus, Trash2, UserRound, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { apiDelete, apiGet, apiPost, apiPut, apiUpload, crmUrl } from '@/shared/api';
import { useAuth } from '@/shared/store';
import { useToast } from '@/shared/ui/useToast';

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
  city: string;
  state_name: string;
  user_id: number | null;
  user_name: string;
  source_id: number | null;
  source_name: string;
  function: string;
  tag_ids: Array<{ id: number; name: string; color: number }>;
  create_date: string;
  write_date: string;
  date_deadline: string | null;
  lost_reason: string;
  won_reason: string;
}

interface Stage {
  id: number;
  name: string;
  sequence: number;
  is_won: boolean;
}
interface Interaction {
  id: number;
  type: string;
  body: string;
  preview: string;
  date: string;
  author_name: string;
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
  options?: string;
  required: boolean;
}
interface CustomFieldValue {
  id: number;
  field_id: number | null;
  field_name: string;
  field_type: string;
  value: string;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : '-';
const REMINDER_OPTIONS = [
  { value: 60, label: '1h antes' },
  { value: 120, label: '2h antes' },
  { value: 360, label: '6h antes' },
  { value: 1440, label: '24h antes' },
  { value: 2880, label: '48h antes' },
  { value: 10080, label: '1 semana antes' },
];

export default function LeadDetail() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const orgBase = slug ? `/id/${slug}` : '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isManager = user?.role === 'admin';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<LeadData>>({});
  const [showTransfer, setShowTransfer] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [newInteraction, setNewInteraction] = useState({
    type: 'note',
    description: '',
    followupDate: '',
    followupTime: '',
    reminderOffsets: [60],
  });
  const [interactionFiles, setInteractionFiles] = useState<FileList | null>(null);
  const [attachFiles, setAttachFiles] = useState<FileList | null>(null);
  const [attachDescription, setAttachDescription] = useState('');
  const [newField, setNewField] = useState({ field_id: '', value: '' });
  const [customValueDrafts, setCustomValueDrafts] = useState<Record<number, string>>({});

  const { data: lead, isLoading } = useQuery<LeadData>({
    queryKey: ['lead', id],
    queryFn: () => apiGet(`/crm/leads/${id}`),
    enabled: Boolean(id),
  });
  const { data: stagesData } = useQuery<{ stages?: Stage[]; items?: Stage[] }>({
    queryKey: ['stages'],
    queryFn: () => apiGet('/crm/stages'),
  });
  const { data: interactionsData } = useQuery<{ items: Interaction[] }>({
    queryKey: ['lead-interactions', id],
    queryFn: () => apiGet(`/crm/leads/${id}/interactions`),
    enabled: Boolean(id),
  });
  const { data: attachmentsData } = useQuery<{ items: LeadAttachment[] }>({
    queryKey: ['lead-attachments', id],
    queryFn: () => apiGet(`/crm/leads/${id}/attachments`),
    enabled: Boolean(id),
  });
  const { data: customValuesData } = useQuery<{ items: CustomFieldValue[] }>({
    queryKey: ['lead-custom-values', id],
    queryFn: () => apiGet(`/crm/leads/${id}/custom-fields`),
    enabled: Boolean(id),
  });
  const { data: customFieldsData } = useQuery<{ items: CustomFieldDef[] }>({
    queryKey: ['custom-fields'],
    queryFn: () => apiGet('/crm/custom-fields'),
  });
  const { data: usersData } = useQuery<{ users: UserItem[] }>({
    queryKey: ['crm-users'],
    queryFn: () => apiGet('/crm/users'),
    enabled: isManager,
  });
  const { data: lostReasonsData } = useQuery<{ items: LostReason[] }>({
    queryKey: ['lost-reasons'],
    queryFn: () => apiGet('/crm/lost-reasons'),
    enabled: isManager,
  });
  const { data: sourcesData } = useQuery<{ items: SourceItem[] }>({
    queryKey: ['sources'],
    queryFn: () => apiGet('/crm/sources'),
  });

  useEffect(() => {
    if (lead) setForm(lead);
  }, [lead]);

  useEffect(() => {
    const drafts: Record<number, string> = {};
    for (const value of customValuesData?.items ?? []) {
      drafts[value.id] = value.value;
    }
    setCustomValueDrafts(drafts);
  }, [customValuesData?.items]);

  const invalidateLead = () => {
    queryClient.invalidateQueries({ queryKey: ['lead', id] });
    queryClient.invalidateQueries({ queryKey: ['lead-interactions', id] });
    queryClient.invalidateQueries({ queryKey: ['lead-attachments', id] });
    queryClient.invalidateQueries({ queryKey: ['lead-custom-values', id] });
    queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };

  const buildFollowupAt = () => {
    if (!newInteraction.followupDate || !newInteraction.followupTime) return null;
    const followupAt = new Date(`${newInteraction.followupDate}T${newInteraction.followupTime}`);
    if (Number.isNaN(followupAt.getTime())) return null;
    return followupAt.toISOString();
  };

  const handleToggleReminderOffset = (offset: number, checked: boolean) => {
    setNewInteraction(current => ({
      ...current,
      reminderOffsets: checked
        ? Array.from(new Set([...current.reminderOffsets, offset]))
        : current.reminderOffsets.filter(item => item !== offset),
    }));
  };

  const updateMutation = useMutation({
    mutationFn: (body: Partial<LeadData>) => apiPut(`/crm/leads/${id}`, body),
    onSuccess: () => {
      invalidateLead();
      setEditing(false);
      addToast('Oportunidade atualizada', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/crm/leads/${id}`),
    onSuccess: () => {
      addToast('Oportunidade removida', 'success');
      navigate(`${orgBase}/leads`);
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const interactionMutation = useMutation({
    mutationFn: async () => {
      const followupAt = buildFollowupAt();
      if (interactionFiles?.length) {
        const fd = new FormData();
        fd.append('type', newInteraction.type);
        fd.append('description', newInteraction.description);
        if (followupAt) {
          fd.append('followup_at', followupAt);
          newInteraction.reminderOffsets.forEach(offset =>
            fd.append('reminder_offsets', String(offset))
          );
        }
        Array.from(interactionFiles).forEach(file => fd.append('files', file));
        return apiUpload(`/crm/leads/${id}/interactions`, fd);
      }
      return apiPost(`/crm/leads/${id}/interactions`, {
        type: newInteraction.type,
        description: newInteraction.description,
        followup_at: followupAt,
        reminder_offsets: followupAt ? newInteraction.reminderOffsets : [],
      });
    },
    onSuccess: () => {
      invalidateLead();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setNewInteraction({
        type: 'note',
        description: '',
        followupDate: '',
        followupTime: '',
        reminderOffsets: [60],
      });
      setInteractionFiles(null);
      addToast('Interação registrada', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const attachMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('description', attachDescription);
      Array.from(attachFiles ?? []).forEach(file => fd.append('files', file));
      return apiUpload(`/crm/leads/${id}/attachments`, fd);
    },
    onSuccess: () => {
      invalidateLead();
      setAttachFiles(null);
      setAttachDescription('');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const deleteAttachment = useMutation({
    mutationFn: (attId: number) => apiDelete(`/crm/leads/${id}/attachments/${attId}`),
    onSuccess: invalidateLead,
  });
  const transferMutation = useMutation({
    mutationFn: (userId: number) => apiPost(`/crm/leads/${id}/transfer`, { user_id: userId }),
    onSuccess: () => {
      invalidateLead();
      setShowTransfer(false);
      addToast('Responsável atualizado', 'success');
    },
  });
  const lostMutation = useMutation({
    mutationFn: (reasonId: number) =>
      apiPost(`/crm/leads/${id}/lost`, { lost_reason_id: reasonId }),
    onSuccess: () => {
      invalidateLead();
      setShowLost(false);
      addToast('Oportunidade marcada como perdida', 'success');
    },
  });
  const createCustomValue = useMutation({
    mutationFn: () =>
      apiPost(`/crm/leads/${id}/custom-fields`, {
        field_id: Number(newField.field_id),
        value: newField.value,
      }),
    onSuccess: () => {
      invalidateLead();
      setNewField({ field_id: '', value: '' });
    },
  });
  const updateCustomValue = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: number; value: string }) =>
      apiPost(`/crm/leads/${id}/custom-fields`, {
        field_id: fieldId,
        value,
      }),
    onSuccess: () => {
      invalidateLead();
      addToast('Campo personalizado atualizado', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });
  const deleteCustomValue = useMutation({
    mutationFn: (valueId: number) => apiDelete(`/crm/leads/${id}/custom-fields/${valueId}`),
    onSuccess: invalidateLead,
  });

  if (isLoading)
    return <p className="py-12 text-center text-muted-foreground">Carregando oportunidade...</p>;
  if (!lead)
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Oportunidade não encontrada.
        </CardContent>
      </Card>
    );

  const stages = stagesData?.stages ?? stagesData?.items ?? [];
  const customValues = customValuesData?.items ?? [];
  const availableFields = (customFieldsData?.items ?? []).filter(
    field => !customValues.some(value => value.field_id === field.id)
  );
  const customFieldDefs = customFieldsData?.items ?? [];
  const renderCustomInput = (
    fieldType: string,
    options: string | undefined,
    value: string,
    onChange: (value: string) => void
  ) => {
    if (fieldType === 'checkbox') {
      return (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value === 'true'}
            onCheckedChange={checked => onChange(String(checked === true))}
          />
          Marcado
        </label>
      );
    }
    if (fieldType === 'select') {
      const optionItems = (options ?? '')
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);
      return (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {optionItems.map(item => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-4"
            onClick={() => navigate(`${orgBase}/leads`)}
          >
            <ArrowLeft className="size-4" />
            Voltar
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{lead.name}</h1>
            <Badge variant="outline">{lead.stage_name}</Badge>
            {lead.lost_reason && <Badge variant="destructive">Perdida</Badge>}
            {lead.won_reason && <Badge variant="success">Ganha</Badge>}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {lead.contact_name || lead.email_from || lead.phone || 'Sem contato principal'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowTransfer(true)}
            disabled={!isManager}
          >
            <UserRound className="size-4" />
            Transferir
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowLost(true)}
            disabled={!isManager}
          >
            <XCircle className="size-4" />
            Perdida
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={!isManager}
          >
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dados comerciais</CardTitle>
            <CardDescription>Informações principais da oportunidade.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="lead-name">Nome</Label>
                <Input
                  id="lead-name"
                  value={form.name ?? ''}
                  disabled={!editing}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estágio</Label>
                <Select
                  value={String(form.stage_id ?? '')}
                  disabled={!editing}
                  onValueChange={value => setForm({ ...form, stage_id: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map(stage => (
                      <SelectItem key={stage.id} value={String(stage.id)}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-revenue">Receita esperada</Label>
                <Input
                  id="lead-revenue"
                  type="number"
                  value={form.expected_revenue ?? 0}
                  disabled={!editing}
                  onChange={event =>
                    setForm({ ...form, expected_revenue: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-contact">Contato</Label>
                <Input
                  id="lead-contact"
                  value={form.contact_name ?? ''}
                  disabled={!editing}
                  onChange={event => setForm({ ...form, contact_name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input
                  id="lead-email"
                  value={form.email_from ?? ''}
                  disabled={!editing}
                  onChange={event => setForm({ ...form, email_from: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-phone">Telefone</Label>
                <Input
                  id="lead-phone"
                  value={form.phone ?? ''}
                  disabled={!editing}
                  onChange={event => setForm({ ...form, phone: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select
                  value={String(form.source_id ?? 0)}
                  disabled={!editing}
                  onValueChange={value => setForm({ ...form, source_id: Number(value) || null })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sem origem</SelectItem>
                    {(sourcesData?.items ?? []).map(source => (
                      <SelectItem key={source.id} value={String(source.id)}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="lead-description">Descrição</Label>
                <Textarea
                  id="lead-description"
                  value={form.description ?? ''}
                  disabled={!editing}
                  onChange={event => setForm({ ...form, description: event.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              {editing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setForm(lead);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" onClick={() => updateMutation.mutate(form)}>
                    Salvar
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => setEditing(true)}>
                  Editar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receita</span>
                <span className="font-mono text-success">
                  {formatCurrency(lead.expected_revenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Responsável</span>
                <span>{lead.user_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Origem</span>
                <span>{lead.source_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Criado em</span>
                <span>{formatDate(lead.create_date)}</span>
              </div>
              {(lead.won_reason || lead.lost_reason) && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Motivo</span>
                  <span className="text-right">{lead.won_reason || lead.lost_reason}</span>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Campos personalizados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customValues.map(value => {
                const definition = customFieldDefs.find(field => field.id === value.field_id);
                const draft = customValueDrafts[value.id] ?? value.value;
                return (
                  <div key={value.id} className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{value.field_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {definition?.required ? 'Obrigatório' : 'Opcional'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteCustomValue.mutate(value.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      {renderCustomInput(
                        definition?.field_type ?? value.field_type,
                        definition?.options,
                        draft,
                        nextValue =>
                          setCustomValueDrafts(current => ({ ...current, [value.id]: nextValue }))
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          value.field_id &&
                          updateCustomValue.mutate({ fieldId: value.field_id, value: draft })
                        }
                        disabled={!value.field_id || updateCustomValue.isPending}
                      >
                        Salvar
                      </Button>
                    </div>
                  </div>
                );
              })}
              {availableFields.length > 0 && (
                <div className="grid gap-2">
                  <Select
                    value={newField.field_id}
                    onValueChange={field_id => setNewField({ ...newField, field_id })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFields.map(field => (
                        <SelectItem key={field.id} value={String(field.id)}>
                          {field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {renderCustomInput(
                    customFieldDefs.find(field => String(field.id) === newField.field_id)
                      ?.field_type ?? 'text',
                    customFieldDefs.find(field => String(field.id) === newField.field_id)?.options,
                    newField.value,
                    value => setNewField({ ...newField, value })
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => createCustomValue.mutate()}
                    disabled={!newField.field_id}
                  >
                    Adicionar campo
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>Registre notas, e-mails, reuniões e interações.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="space-y-3"
              onSubmit={event => {
                event.preventDefault();
                interactionMutation.mutate();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <Select
                  value={newInteraction.type}
                  onValueChange={type => setNewInteraction({ ...newInteraction, type })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Nota</SelectItem>
                    <SelectItem value="phone">Ligação</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="file"
                  multiple
                  onChange={event => setInteractionFiles(event.target.files)}
                />
              </div>
              <Textarea
                placeholder="Descrição da interação"
                value={newInteraction.description}
                onChange={event =>
                  setNewInteraction({ ...newInteraction, description: event.target.value })
                }
              />
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="followup-date">Data do follow-up</Label>
                    <Input
                      id="followup-date"
                      type="date"
                      value={newInteraction.followupDate}
                      onChange={event =>
                        setNewInteraction({
                          ...newInteraction,
                          followupDate: event.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="followup-time">Hora</Label>
                    <Input
                      id="followup-time"
                      type="time"
                      value={newInteraction.followupTime}
                      onChange={event =>
                        setNewInteraction({
                          ...newInteraction,
                          followupTime: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Avisar antes do follow-up
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {REMINDER_OPTIONS.map(option => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={newInteraction.reminderOffsets.includes(option.value)}
                          onCheckedChange={checked =>
                            handleToggleReminderOffset(option.value, checked === true)
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                type="submit"
                disabled={!newInteraction.description.trim() || interactionMutation.isPending}
              >
                <Plus className="size-4" />
                Registrar interação
              </Button>
            </form>
            <Separator />
            <div className="space-y-3">
              {(interactionsData?.items ?? []).map(item => (
                <div key={item.id} className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">{item.type}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                    {item.body || item.preview}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{item.author_name}</p>
                </div>
              ))}
              {(interactionsData?.items ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma interação registrada.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anexos</CardTitle>
            <CardDescription>Arquivos associados à oportunidade.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="space-y-3"
              onSubmit={event => {
                event.preventDefault();
                if (attachFiles?.length) attachMutation.mutate();
              }}
            >
              <Input type="file" multiple onChange={event => setAttachFiles(event.target.files)} />
              <Input
                placeholder="Descrição"
                value={attachDescription}
                onChange={event => setAttachDescription(event.target.value)}
              />
              <Button type="submit" disabled={!attachFiles?.length}>
                <Paperclip className="size-4" />
                Enviar anexo
              </Button>
            </form>
            <Separator />
            <div className="space-y-3">
              {(attachmentsData?.items ?? []).map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.description || item.mimetype}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        window.open(
                          crmUrl(`/crm/leads/${id}/attachments/${item.attachment_id}/download`),
                          '_blank'
                        )
                      }
                    >
                      <Download className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => deleteAttachment.mutate(item.attachment_id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {(attachmentsData?.items ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum anexo enviado.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir oportunidade</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {(usersData?.users ?? []).map(item => (
              <Button
                key={item.id}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => transferMutation.mutate(item.id)}
              >
                {item.name}
                <span className="text-xs text-muted-foreground">{item.email}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setShowTransfer(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showLost} onOpenChange={setShowLost}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como perdida</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {(lostReasonsData?.items ?? []).map(reason => (
              <Button
                key={reason.id}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() => lostMutation.mutate(reason.id)}
              >
                <XCircle className="size-4" />
                {reason.name}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setShowLost(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
