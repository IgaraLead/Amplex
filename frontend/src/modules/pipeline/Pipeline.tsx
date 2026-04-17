import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { apiGet, apiPost } from '../../shared/api';
import { useToast } from '../../shared/ui/useToast';
import { useAuth } from '../../shared/store';
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
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isManager = user?.role === 'admin';
  const [lostDialog, setLostDialog] = useState<{ leadId: number; stageId: number } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
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

  function handleDragStart(e: React.DragEvent, cardId: number) {
    e.dataTransfer.setData('text/plain', String(cardId));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, stageId: number, stageName: string) {
    e.preventDefault();
    const cardId = parseInt(e.dataTransfer.getData('text/plain'));
    if (!cardId || !stageId) return;

    // If dropping on a stage named "Perdido" or similar, show lost reason dialog
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
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Carregando pipeline...
        </div>
      </div>
    );
  }

  const columns = data?.columns || [];

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Pipeline</h1>
        <button className="btn btn-primary" onClick={() => navigate('/leads?new=1')}>
          + Nova Oportunidade
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <input
            className="input"
            placeholder="Buscar..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') setAppliedFilters({ ...appliedFilters, search: searchText });
            }}
            style={{ width: 180, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          />
        </div>
        {isManager && (
          <div>
            <select
              className="select"
              value={filterUser}
              onChange={e => {
                setFilterUser(e.target.value);
                setAppliedFilters({ ...appliedFilters, user_id: e.target.value });
              }}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
            >
              <option value="">Todos vendedores</option>
              {(usersData?.users || []).map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <input
            className="input"
            type="number"
            placeholder="Valor min"
            value={minValue}
            onChange={e => setMinValue(e.target.value)}
            onBlur={() => setAppliedFilters({ ...appliedFilters, min_value: minValue })}
            style={{ width: 100, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          />
        </div>
        <div>
          <input
            className="input"
            type="number"
            placeholder="Valor max"
            value={maxValue}
            onChange={e => setMaxValue(e.target.value)}
            onBlur={() => setAppliedFilters({ ...appliedFilters, max_value: maxValue })}
            style={{ width: 100, padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          />
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ border: '1px solid var(--border)', fontSize: '0.8rem' }}
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
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.8rem', color: 'var(--danger)' }}
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
            className="kanban-column"
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, col.id, col.name)}
          >
            <div className="kanban-column-header">
              <span className="kanban-column-title">
                {col.name}
                {col.is_won && (
                  <span
                    style={{
                      color: 'var(--success)',
                      marginLeft: '0.4rem',
                      display: 'inline-flex',
                    }}
                  >
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
                  onDragStart={e => handleDragStart(e, card.id)}
                  onClick={() => navigate(`/leads/${card.id}`)}
                >
                  <div className="kanban-card-title">
                    {priorityStars(card.priority) !== null && (
                      <span
                        style={{
                          color: 'var(--warning)',
                          marginRight: '0.35rem',
                          display: 'inline-flex',
                          gap: '1px',
                        }}
                      >
                        {priorityStars(card.priority)}
                      </span>
                    )}
                    {card.name}
                  </div>
                  <div className="kanban-card-meta">
                    {card.contact_name || card.partner_name}
                    {card.expected_revenue > 0 && (
                      <span style={{ float: 'right', color: 'var(--success)', fontWeight: 500 }}>
                        {formatCurrency(card.expected_revenue)}
                      </span>
                    )}
                  </div>
                  {card.tag_ids?.length > 0 && (
                    <div
                      style={{
                        marginTop: '0.4rem',
                        display: 'flex',
                        gap: '0.3rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      {card.tag_ids.map(tag => (
                        <span
                          key={tag.id}
                          className="badge badge-info"
                          style={{ fontSize: '0.65rem' }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {card.user_name && (
                    <div
                      style={{
                        marginTop: '0.35rem',
                        fontSize: '0.7rem',
                        color: 'var(--text-light)',
                      }}
                    >
                      {card.user_name}
                    </div>
                  )}
                </div>
              ))}

              {col.cards.length === 0 && (
                <div
                  style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: 'var(--text-light)',
                    fontSize: '0.8rem',
                  }}
                >
                  Nenhuma oportunidade
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Lost Reason Dialog */}
      {lostDialog && (
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
          onClick={() => setLostDialog(null)}
        >
          <div className="card bg-base-300 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="card-body">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.25rem',
                }}
              >
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                  Motivo da Perda
                </h2>
                <button
                  className="btn btn-ghost"
                  onClick={() => setLostDialog(null)}
                  style={{ padding: '0.25rem 0.5rem' }}
                >
                  <X size={14} />
                </button>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Por que esta oportunidade foi perdida?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(lostReasonsData?.items || []).map(r => (
                  <button
                    key={r.id}
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', border: '1px solid var(--border)' }}
                    onClick={() =>
                      lostMutation.mutate({ leadId: lostDialog.leadId, reasonId: r.id })
                    }
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
