import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Search, Star, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import PageHeader from '@/shared/page/PageHeader';
import { apiGet, apiPost } from '@/shared/api';
import { useAuth } from '@/shared/store';
import { useToast } from '@/shared/ui/useToast';

interface PipelineCard {
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
}

interface PipelineData {
  columns: Array<{
    id: number;
    name: string;
    sequence: number;
    is_won: boolean;
    is_lost: boolean;
    count: number;
    cards: PipelineCard[];
  }>;
}

interface LostReason {
  id: number;
  name: string;
}
interface WonReason {
  id: number;
  name: string;
}
interface UserItem {
  id: number;
  name: string;
  email: string;
}

const formatCurrency = (value: number) =>
  value
    ? new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }).format(value)
    : '';

function PriorityStars({ value }: { value: string }) {
  const count = Number.parseInt(value) || 0;
  if (count <= 0) return null;
  return (
    <span className="flex text-warning">
      {Array.from({ length: count }, (_, index) => (
        <Star key={index} className="size-3 fill-current" />
      ))}
    </span>
  );
}

export default function Pipeline() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const orgBase = slug ? `/id/${slug}` : '';
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { user } = useAuth();
  const isManager = user?.role === 'admin';
  const [reasonDialog, setReasonDialog] = useState<{
    type: 'won' | 'lost';
    leadId: number;
    stageId: number;
  } | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterUser, setFilterUser] = useState('all');
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

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (appliedFilters.search) params.set('search', appliedFilters.search);
    if (appliedFilters.user_id) params.set('user_id', appliedFilters.user_id);
    if (appliedFilters.min_value) params.set('min_value', appliedFilters.min_value);
    if (appliedFilters.max_value) params.set('max_value', appliedFilters.max_value);
    const qs = params.toString();
    return qs ? `&${qs}` : '';
  };

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
  });
  const { data: wonReasonsData } = useQuery<{ items: WonReason[] }>({
    queryKey: ['won-reasons'],
    queryFn: () => apiGet('/crm/won-reasons'),
  });

  const moveMutation = useMutation({
    mutationFn: ({
      leadId,
      stageId,
      wonReasonId,
      lostReasonId,
    }: {
      leadId: number;
      stageId: number;
      wonReasonId?: number;
      lostReasonId?: number;
    }) =>
      apiPost(`/crm/leads/${leadId}/move`, {
        stage_id: stageId,
        won_reason_id: wonReasonId,
        lost_reason_id: lostReasonId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setReasonDialog(null);
      addToast('Oportunidade movida', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const handleDrop = (event: React.DragEvent, column: PipelineData['columns'][number]) => {
    event.preventDefault();
    setDragOverStageId(null);
    const cardId = Number.parseInt(event.dataTransfer.getData('text/plain'));
    const sourceStageId = Number.parseInt(event.dataTransfer.getData('source-stage-id'));
    if (!cardId || !column.id || sourceStageId === column.id) return;
    if (column.is_won || column.is_lost) {
      const reasons = column.is_won
        ? (wonReasonsData?.items ?? [])
        : (lostReasonsData?.items ?? []);
      if (reasons.length === 0) {
        moveMutation.mutate({ leadId: cardId, stageId: column.id });
        return;
      }
      setReasonDialog({
        type: column.is_won ? 'won' : 'lost',
        leadId: cardId,
        stageId: column.id,
      });
      return;
    }
    moveMutation.mutate({ leadId: cardId, stageId: column.id });
  };

  const columns = data?.columns ?? [];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border/70 pb-6">
        <PageHeader
          title="Pipeline"
          description="Arraste oportunidades entre estágios e acompanhe o fluxo comercial."
          tag="Etapas"
          className="mb-0 border-b-0 pb-0"
        />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px_120px_120px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar oportunidade"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
            />
          </div>
          {isManager && (
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(usersData?.users ?? []).map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            placeholder="Valor mín."
            type="number"
            value={minValue}
            onChange={event => setMinValue(event.target.value)}
          />
          <Input
            placeholder="Valor máx."
            type="number"
            value={maxValue}
            onChange={event => setMaxValue(event.target.value)}
          />
          <Button
            type="button"
            onClick={() =>
              setAppliedFilters({
                search: searchText,
                user_id: filterUser === 'all' ? '' : filterUser,
                min_value: minValue,
                max_value: maxValue,
              })
            }
          >
            Aplicar
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="py-12 text-center text-muted-foreground">Carregando pipeline...</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(column => (
            <section
              key={column.id}
              className={cn(
                'min-w-[280px] flex-1 rounded-2xl border bg-card transition-colors',
                dragOverStageId === column.id ? 'border-primary bg-primary/10' : 'border-border'
              )}
              onDragOver={event => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDragEnter={() => setDragOverStageId(column.id)}
              onDragLeave={() => setDragOverStageId(null)}
              onDrop={event => handleDrop(event, column)}
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">{column.name}</h2>
                  {column.is_won && <Check className="size-4 text-success" />}
                  {column.is_lost && <X className="size-4 text-destructive" />}
                </div>
                <Badge variant="outline">{column.count}</Badge>
              </div>
              <div className="space-y-3 p-3">
                {column.cards.map(card => (
                  <button
                    key={card.id}
                    type="button"
                    draggable
                    onDragStart={event => {
                      event.dataTransfer.setData('text/plain', String(card.id));
                      event.dataTransfer.setData('source-stage-id', String(column.id));
                      event.dataTransfer.effectAllowed = 'move';
                      setDraggingCardId(card.id);
                    }}
                    onDragEnd={() => setTimeout(() => setDraggingCardId(null), 80)}
                    onClick={() => {
                      if (!draggingCardId) navigate(`${orgBase}/leads/${card.id}`);
                    }}
                    className="w-full rounded-xl border border-border bg-muted/30 p-4 text-left transition hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground">{card.name}</p>
                      <PriorityStars value={card.priority} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {card.contact_name || card.email_from || card.phone || 'Sem contato'}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-success">
                        {formatCurrency(card.expected_revenue)}
                      </span>
                      {card.user_name && (
                        <Badge variant="outline" size="sm">
                          {card.user_name}
                        </Badge>
                      )}
                    </div>
                    {card.tag_ids?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {card.tag_ids.map(tag => (
                          <Badge key={tag.id} variant="secondary" size="sm">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
                {column.cards.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Sem oportunidades
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={Boolean(reasonDialog)} onOpenChange={open => !open && setReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reasonDialog?.type === 'won' ? 'Motivo do ganho' : 'Motivo da perda'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{reasonDialog?.type === 'won' ? 'Motivo do ganho' : 'Motivo da perda'}</Label>
            <div className="grid gap-2">
              {(reasonDialog?.type === 'won'
                ? (wonReasonsData?.items ?? [])
                : (lostReasonsData?.items ?? [])
              ).map(reason => (
                <Button
                  key={reason.id}
                  type="button"
                  variant="outline"
                  className="justify-start"
                  onClick={() =>
                    reasonDialog &&
                    moveMutation.mutate({
                      leadId: reasonDialog.leadId,
                      stageId: reasonDialog.stageId,
                      wonReasonId: reasonDialog.type === 'won' ? reason.id : undefined,
                      lostReasonId: reasonDialog.type === 'lost' ? reason.id : undefined,
                    })
                  }
                >
                  {reasonDialog?.type === 'won' ? (
                    <Check className="size-4" />
                  ) : (
                    <X className="size-4" />
                  )}
                  {reason.name}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setReasonDialog(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
