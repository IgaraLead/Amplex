import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { apiGet, apiPost } from '@/shared/api';
import { useToast } from '@/shared/ui/useToast';
import { useAuth } from '@/shared/store';
import { Modal } from '@/shared/ui/Modal';
import { Star, Check, X } from 'lucide-react';

interface PipelineData {
  columns: Array<{
    id: number;
    name: string;
    sequence: number;
    is_won: boolean;
    count: number;
    cards: Array<{
      id: number;
      name: string;
      contact_name: string;
      partner_name: string;
      email_from: string;
      phone: string;
      expected_revenue: number;
      probability: number;
      priority: string;
      create_date: string;
      tag_ids: Array<{ id: number; name: string; color: number }>;
      user_name: string;
    }>;
  }>;
}

interface LostReason {
  id: number;
  name: string;
}

function formatCurrency(value: number): string {
  if (value === 0) return '';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);
}

function priorityStars(p: string) {
  const n = parseInt(p) || 0;
  if (n <= 0) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} size={11} fill="currentColor" />
      ))}
    </>
  );
}

interface UserItem {
  id: number;
  name: string;
  email: string;
}

export default function Pipeline() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const orgBase = slug ? `/id/${slug}` : '';
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isManager = user?.role === 'admin';
  const [lostDialog, setLostDialog] = useState<{ leadId: number; stageId: number } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [draggingCardId, setDraggingCardId] = useState<number | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<number | null>(null);
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    user_id: '',
    min_value: '',
    max_value: '',
  });

  function buildFilterParams() {
    const p = new URLSearchParams();
    if (appliedFilters.search) p.set('search', appliedFilters.search);
    if (appliedFilters.user_id) p.set('user_id', appliedFilters.user_id);
    if (appliedFilters.min_value) p.set('min_value', appliedFilters.min_value);
    if (appliedFilters.max_value) p.set('max_value', appliedFilters.max_value);
    const qs = p.toString();
    return qs ? `&${qs}` : '';
  }

  const { data, isLoading } = useQuery<PipelineData>({
    queryKey: ['pipeline', appliedFilters],
    queryFn: () => apiGet(`/crm/pipeline?type=opportunity${buildFilterParams()}`),
  });

  const { data: usersData } = useQuery<{ users: UserItem[] }>({
    queryKey: ['users'],
    queryFn: () => apiGet('/crm/users'),
    enabled: isManager,
  });

  const { data: lostReasonsData } = useQuery<{ items: LostReason[] }>({
    queryKey: ['lost-reasons'],
    queryFn: () => apiGet('/crm/lost-reasons'),
    enabled: !!lostDialog,
  });

  const moveMutation = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: number; stageId: number }) =>
      apiPost(`/crm/leads/${leadId}/move`, { stage_id: stageId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
    onError: (err: Error) => {
      addToast(err.message, 'error');
    },
  });

  const lostMutation = useMutation({
    mutationFn: ({ leadId, reasonId }: { leadId: number; reasonId: number }) =>
      apiPost(`/crm/leads/${leadId}/lost`, { lost_reason_id: reasonId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setLostDialog(null);
      addToast('Oportunidade marcada como perdida', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  function handleDragStart(e: React.DragEvent, cardId: number, fromStageId: number) {
    e.dataTransfer.setData('text/plain', String(cardId));
    e.dataTransfer.setData('source-stage-id', String(fromStageId));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingCardId(cardId);
  }

  function handleDragEnd() {
    // Small delay avoids accidental click navigation right after dropping.
    setTimeout(() => setDraggingCardId(null), 80);
    setDragOverStageId(null);
  }

  function handleDrop(e: React.DragEvent, stageId: number, stageName: string) {
    e.preventDefault();
    setDragOverStageId(null);
    const cardId = parseInt(e.dataTransfer.getData('text/plain'));
    const sourceStageId = parseInt(e.dataTransfer.getData('source-stage-id'));
    if (!cardId || !stageId) return;
    if (sourceStageId === stageId) return;

    const lostNames = ['perdido', 'perdida', 'lost'];
    if (lostNames.some(n => stageName.toLowerCase().includes(n))) {
      setLostDialog({ leadId: cardId, stageId });
    } else {
      moveMutation.mutate({ leadId: cardId, stageId });
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="py-12 text-center text-base-content/50">Carregando pipeline...</div>
      </div>
    );
  }

  const columns = data?.columns || [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Pipeline</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate(`${orgBase}/leads?new=1`)}
        >
          + Nova Oportunidade
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          className="input input-sm h-9 w-44 text-xs"
          placeholder="Buscar..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') setAppliedFilters({ ...appliedFilters, search: searchText });
          }}
        />
        {isManager && (
          <select
            className="select select-sm h-9 max-w-xs text-xs"
            value={filterUser}
            onChange={e => {
              setFilterUser(e.target.value);
              setAppliedFilters({ ...appliedFilters, user_id: e.target.value });
            }}
          >
            <option value="">Todos vendedores</option>
            {(usersData?.users || []).map(u => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <input
          className="input input-sm h-9 w-24 text-xs"
          type="number"
          placeholder="Valor min"
          value={minValue}
          onChange={e => setMinValue(e.target.value)}
          onBlur={() => setAppliedFilters({ ...appliedFilters, min_value: minValue })}
        />
        <input
          className="input input-sm h-9 w-24 text-xs"
          type="number"
          placeholder="Valor max"
          value={maxValue}
          onChange={e => setMaxValue(e.target.value)}
          onBlur={() => setAppliedFilters({ ...appliedFilters, max_value: maxValue })}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm border border-base-300"
          onClick={() =>
            setAppliedFilters({
              search: searchText,
              user_id: filterUser,
              min_value: minValue,
              max_value: maxValue,
            })
          }
        >
          Filtrar
        </button>
        {(appliedFilters.search ||
          appliedFilters.user_id ||
          appliedFilters.min_value ||
          appliedFilters.max_value) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-error"
            onClick={() => {
              setSearchText('');
              setFilterUser('');
              setMinValue('');
              setMaxValue('');
              setAppliedFilters({ search: '', user_id: '', min_value: '', max_value: '' });
            }}
          >
            Limpar
          </button>
        )}
      </div>

      <div className="kanban-board">
        {columns.map(col => (
          <div
            key={col.id}
            className={`kanban-column ${dragOverStageId === col.id ? 'ring-2 ring-info/50' : ''}`}
            onDragOver={e => {
              handleDragOver(e);
              setDragOverStageId(col.id);
            }}
            onDragLeave={() => {
              if (dragOverStageId === col.id) setDragOverStageId(null);
            }}
            onDrop={e => handleDrop(e, col.id, col.name)}
          >
            <div className="kanban-column-header">
              <span className="kanban-column-title">
                {col.name}
                {col.is_won && (
                  <span className="ml-1.5 inline-flex text-success">
                    <Check size={14} />
                  </span>
                )}
              </span>
              <span className="kanban-column-count">{col.count}</span>
            </div>

            <div className="kanban-cards">
              {col.cards.map(card => (
                <div
                  key={card.id}
                  className="kanban-card"
                  draggable
                  onDragStart={e => handleDragStart(e, card.id, col.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => {
                    if (draggingCardId !== null) return;
                    navigate(`${orgBase}/leads/${card.id}`);
                  }}
                >
                  <div className="kanban-card-title">
                    {priorityStars(card.priority) !== null && (
                      <span className="mr-1.5 inline-flex gap-px text-warning">
                        {priorityStars(card.priority)}
                      </span>
                    )}
                    {card.name}
                  </div>
                  <div className="kanban-card-meta clearfix">
                    {card.contact_name || card.partner_name}
                    {card.expected_revenue > 0 && (
                      <span className="float-right font-medium text-success">
                        {formatCurrency(card.expected_revenue)}
                      </span>
                    )}
                  </div>
                  {card.tag_ids?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {card.tag_ids.map(tag => (
                        <span
                          key={tag.id}
                          className="badge badge-info badge-sm py-0 text-[0.65rem]"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {card.user_name && (
                    <div className="mt-1.5 text-[0.7rem] text-base-content/50">
                      {card.user_name}
                    </div>
                  )}
                </div>
              ))}

              {col.cards.length === 0 && (
                <div className="p-4 text-center text-sm text-base-content/45">
                  Nenhuma oportunidade
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!lostDialog} onClose={() => setLostDialog(null)} className="max-w-md px-4">
        <div className="card bg-base-300">
          <div className="card-body">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-base-content">Motivo da Perda</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => setLostDialog(null)}
              >
                <X size={14} />
              </button>
            </div>
            <p className="mb-4 text-sm text-base-content/55">
              Por que esta oportunidade foi perdida?
            </p>
            <div className="flex flex-col gap-2">
              {(lostReasonsData?.items || []).map(r => (
                <button
                  key={r.id}
                  type="button"
                  className="btn btn-ghost justify-start border border-base-300"
                  onClick={() =>
                    lostMutation.mutate({ leadId: lostDialog!.leadId, reasonId: r.id })
                  }
                  disabled={lostMutation.isPending}
                >
                  {r.name}
                </button>
              ))}
              {(lostReasonsData?.items || []).length === 0 && (
                <p className="text-sm text-base-content/50">
                  Nenhum motivo cadastrado. Cadastre em Configurações.
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
