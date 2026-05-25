import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, TrendingUp, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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
import PageHeader from '@/shared/page/PageHeader';
import { apiGet } from '@/shared/api';
import { useAuth } from '@/shared/store';

interface DashboardData {
  pipeline: {
    total_leads: number;
    total_opportunities: number;
    won: number;
    lost: number;
    total_revenue: number;
    new_this_month: number;
    new_last_month: number;
    current_period_count?: number;
    previous_period_count?: number;
  };
  stages: Array<{ id: number; name: string; count: number; revenue: number; is_won: boolean }>;
  total_contacts: number;
}

interface AdvancedDashData {
  vendor_performance: Array<{
    user_id: number;
    name: string;
    total: number;
    won: number;
    lost: number;
    revenue: number;
    conversion: number;
  }>;
  origin_breakdown: Array<{ source_id: number | null; name: string; count: number }>;
  leads_over_time: Array<{ month: string; label: string; count: number }>;
  revenue_forecast: Array<{ month: string; label: string; revenue: number; count: number }>;
}

interface NextContactItem {
  id: number;
  name: string;
  contact_name: string;
  phone: string;
  email_from: string;
  stage_name: string;
  expected_revenue: number;
  last_contact: string;
  days_since_contact: number;
}

type PeriodKey = 'day' | 'week' | 'month' | 'custom';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  return (
    <Card className="py-4">
      <CardContent className="space-y-2 px-5">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p
          className={
            tone === 'success'
              ? 'text-2xl font-bold text-success'
              : tone === 'warning'
                ? 'text-2xl font-bold text-warning'
                : 'text-2xl font-bold text-foreground'
          }
        >
          {value}
        </p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin';
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const periodQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set('period', period);
    if (period === 'custom') {
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
    }
    return params.toString();
  }, [period, startDate, endDate]);

  const {
    data,
    isLoading,
    isFetching: isDashboardFetching,
    error,
  } = useQuery<DashboardData>({
    queryKey: ['dashboard', period, startDate, endDate],
    queryFn: () => apiGet(`/crm/dashboard?${periodQuery}`),
    placeholderData: keepPreviousData,
  });

  const { data: advancedData, isFetching: isAdvancedFetching } = useQuery<AdvancedDashData>({
    queryKey: ['dashboard-advanced', period, startDate, endDate],
    queryFn: () => apiGet(`/crm/dashboard/advanced?${periodQuery}`),
    enabled: isManager,
    placeholderData: keepPreviousData,
  });

  const { data: nextContactsData, isFetching: isNextContactsFetching } = useQuery<{
    items: NextContactItem[];
  }>({
    queryKey: ['next-contacts', period, startDate, endDate],
    queryFn: () => apiGet(`/crm/leads/next-contacts?limit=10&${periodQuery}`),
    placeholderData: keepPreviousData,
  });

  if (isLoading)
    return <div className="py-12 text-center text-muted-foreground">Carregando dashboard...</div>;

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          Erro ao carregar dashboard
        </CardContent>
      </Card>
    );
  }

  const { pipeline, stages = [], total_contacts } = data;
  const currentPeriodCount = pipeline.current_period_count ?? pipeline.new_this_month;
  const previousPeriodCount = pipeline.previous_period_count ?? pipeline.new_last_month;
  const monthChange =
    previousPeriodCount > 0
      ? Math.round(((currentPeriodCount - previousPeriodCount) / previousPeriodCount) * 100)
      : 0;
  const conversionRate =
    pipeline.total_opportunities > 0
      ? Math.round((pipeline.won / pipeline.total_opportunities) * 100)
      : 0;
  const maxStageCount = Math.max(...stages.map(stage => stage.count), 1);
  const isRefreshing = isDashboardFetching || isAdvancedFetching || isNextContactsFetching;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid gap-4 border-b border-border/70 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <PageHeader
          title={isManager ? 'Dashboard - Visão Geral' : `Dashboard - ${user?.name || 'Vendedor'}`}
          description="Acompanhe oportunidades, receita, conversão e próximos contatos do pipeline."
          tag="Dados"
          className="mb-0 min-w-0 self-end border-b-0 pb-0"
        />
        <div className="flex flex-wrap items-end justify-end gap-3 justify-self-end">
          {isRefreshing && (
            <Badge
              variant="outline"
              className="mb-0.5 border-primary/30 bg-primary/10 text-primary"
            >
              Atualizando métricas
            </Badge>
          )}
          <div className="w-[145px] space-y-2">
            <Label>Período</Label>
            <Select value={period} onValueChange={value => setPeriod(value as PeriodKey)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="day">Hoje</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === 'custom' && (
            <>
              <div className="w-[145px] space-y-2">
                <Label htmlFor="start-date">Início</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={event => setStartDate(event.target.value)}
                />
              </div>
              <div className="w-[145px] space-y-2">
                <Label htmlFor="end-date">Fim</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={event => setEndDate(event.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className={`grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-6 ${
          isDashboardFetching ? 'opacity-70' : 'opacity-100'
        }`}
      >
        <MetricCard label="Oportunidades" value={pipeline.total_opportunities} />
        <MetricCard label="Leads" value={pipeline.total_leads} />
        <MetricCard label="Ganhas" value={pipeline.won} tone="success" />
        <MetricCard
          label="Receita total"
          value={formatCurrency(pipeline.total_revenue)}
          tone="success"
        />
        <MetricCard
          label="Novos"
          value={currentPeriodCount}
          detail={`${monthChange >= 0 ? '+' : ''}${monthChange}% vs período anterior`}
        />
        <MetricCard
          label="Conversão"
          value={`${conversionRate}%`}
          tone={conversionRate >= 50 ? 'success' : 'warning'}
        />
      </div>

      <div
        className={`grid gap-6 transition-opacity lg:grid-cols-[1.4fr_1fr] ${
          isDashboardFetching ? 'opacity-70' : 'opacity-100'
        }`}
      >
        <Card>
          <CardHeader>
            <CardTitle>Pipeline por estágio</CardTitle>
            <CardDescription>Volume e receita em cada etapa comercial.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stages.map(stage => {
              const value = Math.round((stage.count / maxStageCount) * 100);
              return (
                <div key={stage.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {stage.name}
                      {stage.is_won && <Check className="size-4 text-success" />}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {stage.count} · {formatCurrency(stage.revenue)}
                    </span>
                  </div>
                  <Progress
                    value={value}
                    indicatorClassName={stage.is_won ? 'accent-success' : undefined}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo do funil</CardTitle>
            <CardDescription>Totais agregados para operação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total em pipeline</span>
              <span className="font-semibold">
                {stages.reduce((sum, stage) => sum + stage.count, 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contatos</span>
              <span className="font-semibold">{total_contacts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Perdidas</span>
              <span className="font-semibold text-destructive">{pipeline.lost}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receita potencial</span>
              <span className="font-semibold text-success">
                {formatCurrency(stages.reduce((sum, stage) => sum + stage.revenue, 0))}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {isManager && advancedData && (
        <div
          className={`space-y-6 transition-opacity ${isAdvancedFetching ? 'opacity-70' : 'opacity-100'}`}
        >
          <Card>
            <CardHeader>
              <CardTitle>Performance por vendedor</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Ganhas</TableHead>
                    <TableHead>Perdidas</TableHead>
                    <TableHead>Conversão</TableHead>
                    <TableHead>Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(advancedData.vendor_performance ?? []).map(vendor => (
                    <TableRow key={vendor.user_id}>
                      <TableCell className="font-medium">{vendor.name}</TableCell>
                      <TableCell>{vendor.total}</TableCell>
                      <TableCell className="text-success">{vendor.won}</TableCell>
                      <TableCell className="text-destructive">{vendor.lost}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            vendor.conversion >= 50
                              ? 'success'
                              : vendor.conversion >= 25
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {vendor.conversion}%
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-success">
                        {formatCurrency(vendor.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Origem dos leads</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(advancedData.origin_breakdown ?? []).map(origin => {
                  const max = Math.max(
                    ...(advancedData.origin_breakdown ?? []).map(item => item.count),
                    1
                  );
                  return (
                    <div key={origin.source_id ?? 'none'} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{origin.name}</span>
                        <span className="text-muted-foreground">{origin.count}</span>
                      </div>
                      <Progress value={Math.round((origin.count / max) * 100)} />
                    </div>
                  );
                })}
                {(advancedData.origin_breakdown ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Sem dados de origem</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evolução de leads</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(advancedData.leads_over_time ?? []).map(month => (
                  <div
                    key={month.month}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span>{month.label}</span>
                    <Badge variant="outline">{month.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card
        className={`transition-opacity ${isNextContactsFetching ? 'opacity-70' : 'opacity-100'}`}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" /> Próximos contatos
          </CardTitle>
          <CardDescription>Leads que precisam de acompanhamento.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(nextContactsData?.items ?? []).map(item => (
              <div key={item.id} className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.contact_name || item.email_from || item.phone}
                    </p>
                  </div>
                  <Badge variant="outline">{item.stage_name}</Badge>
                </div>
                <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="size-3" /> {formatCurrency(item.expected_revenue)}
                </p>
              </div>
            ))}
            {(nextContactsData?.items ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum próximo contato no período.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
