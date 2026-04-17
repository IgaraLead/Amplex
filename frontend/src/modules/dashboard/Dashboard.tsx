import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../shared/api';
import { useAuth } from '../../shared/store';
import { Check } from 'lucide-react';

interface DashboardData {
  pipeline: {
    total_leads: number;
    total_opportunities: number;
    won: number;
    lost: number;
    total_revenue: number;
    new_this_month: number;
    new_last_month: number;
  };
  stages: Array<{
    id: number;
    name: string;
    count: number;
    revenue: number;
    is_won: boolean;
  }>;
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin';

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => apiGet('/crm/dashboard'),
  });

  const { data: advancedData } = useQuery<AdvancedDashData>({
    queryKey: ['dashboard-advanced'],
    queryFn: () => apiGet('/crm/dashboard/advanced'),
    enabled: isManager,
  });

  const { data: nextContactsData } = useQuery<{ items: NextContactItem[] }>({
    queryKey: ['next-contacts'],
    queryFn: () => apiGet('/crm/leads/next-contacts?limit=10'),
  });

  if (isLoading) {
    return (
      <div className="page">
        <div className="text-center py-12 text-base-content/50">Carregando dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <div className="card bg-base-300">
          <div className="card-body text-center">
            <p className="text-error">Erro ao carregar dashboard</p>
          </div>
        </div>
      </div>
    );
  }

  const { pipeline, stages = [], total_contacts } = data;
  const monthChange =
    pipeline.new_last_month > 0
      ? Math.round(
          ((pipeline.new_this_month - pipeline.new_last_month) / pipeline.new_last_month) * 100
        )
      : 0;

  // Conversion rate
  const totalProcessed = pipeline.won + pipeline.lost;
  const conversionRate = totalProcessed > 0 ? Math.round((pipeline.won / totalProcessed) * 100) : 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">
          {isManager ? 'Dashboard - Visão Geral' : `Dashboard - ${user?.name || 'Vendedor'}`}
        </h1>
      </div>

      {/* Stats Grid */}
      <div className="stat-grid">
        <div className="card bg-base-300 stat-card">
          <div className="stat-card-label">Oportunidades Ativas</div>
          <div className="stat-card-value">{pipeline.total_opportunities}</div>
        </div>
        <div className="card bg-base-300 stat-card">
          <div className="stat-card-label">Leads</div>
          <div className="stat-card-value">{pipeline.total_leads}</div>
        </div>
        <div className="card bg-base-300 stat-card">
          <div className="stat-card-label">Ganhas</div>
          <div className="stat-card-value text-success">{pipeline.won}</div>
        </div>
        <div className="card bg-base-300 stat-card">
          <div className="stat-card-label">Receita Total</div>
          <div className="stat-card-value gradient-text">
            {formatCurrency(pipeline.total_revenue)}
          </div>
        </div>
        <div className="card bg-base-300 stat-card">
          <div className="stat-card-label">Novos Este Mês</div>
          <div className="stat-card-value">{pipeline.new_this_month}</div>
          {monthChange !== 0 && (
            <div className={`stat-card-change ${monthChange > 0 ? 'text-success' : 'text-error'}`}>
              {monthChange > 0 ? '+' : ''}
              {monthChange}% vs mês anterior
            </div>
          )}
        </div>
        <div className="card bg-base-300 stat-card">
          <div className="stat-card-label">Taxa de Conversão</div>
          <div
            className={`stat-card-value ${conversionRate >= 50 ? 'text-success' : 'text-warning'}`}
          >
            {conversionRate}%
          </div>
          <div className="stat-card-change text-base-content/50">
            {pipeline.won}W / {pipeline.lost}L
          </div>
        </div>
      </div>

      <div className={isManager ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}>
        {/* Pipeline Stages */}
        <div className="card bg-base-300">
          <div className="card-body">
            <h2 className="text-base font-semibold mb-4">Pipeline por Estágio</h2>
            <div className="flex flex-col gap-3">
              {stages.map(stage => {
                const maxCount = Math.max(...stages.map(s => s.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div key={stage.id}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm font-medium">
                        {stage.name}
                        {stage.is_won && (
                          <span className="text-success ml-2 inline-flex">
                            <Check size={14} />
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-base-content/50">
                        {stage.count} · {formatCurrency(stage.revenue)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06]">
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '3px',
                          width: `${pct}%`,
                          background: stage.is_won ? 'var(--success)' : 'var(--brand-gradient)',
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Conversion Funnel (Manager Only) */}
        {isManager && (
          <div className="card bg-base-300">
            <div className="card-body">
              <h2 className="text-base font-semibold mb-4">Funil de Conversão</h2>
              <div className="flex flex-col gap-2">
                {stages.map((stage, i) => {
                  const totalInPipeline = stages.reduce((s, st) => s + st.count, 0);
                  const width =
                    totalInPipeline > 0 ? Math.max((stage.count / totalInPipeline) * 100, 5) : 5;
                  return (
                    <div key={stage.id} className="flex items-center gap-3">
                      <div
                        style={{
                          height: '32px',
                          width: `${width}%`,
                          minWidth: '40px',
                          borderRadius: '4px',
                          background: stage.is_won
                            ? 'var(--success)'
                            : `rgba(0, 112, 255, ${0.3 + (1 - i / stages.length) * 0.5})`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#fff',
                          transition: 'width 0.5s ease',
                        }}
                      >
                        {stage.count}
                      </div>
                      <span className="text-xs text-base-content/50 whitespace-nowrap">
                        {stage.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-base-content/50">Total em pipeline</span>
                  <span className="font-semibold">{stages.reduce((s, st) => s + st.count, 0)}</span>
                </div>
                <div className="flex justify-between text-xs mt-1.5">
                  <span className="text-base-content/50">Contatos</span>
                  <span className="font-semibold">{total_contacts}</span>
                </div>
                <div className="flex justify-between text-xs mt-1.5">
                  <span className="text-base-content/50">Receita potencial</span>
                  <span className="text-success font-semibold">
                    {formatCurrency(stages.reduce((s, st) => s + st.revenue, 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Manager Panels */}
      {isManager && advancedData && (
        <>
          {/* Vendor Performance Table */}
          <div className="card bg-base-300 mt-6">
            <div className="card-body">
              <h2 className="text-base font-semibold mb-4">Performance por Vendedor</h2>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th>Total</th>
                      <th>Ganhas</th>
                      <th>Perdidas</th>
                      <th>Conversão</th>
                      <th>Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(advancedData.vendor_performance ?? []).map(v => (
                      <tr key={v.user_id}>
                        <td className="font-medium">{v.name}</td>
                        <td>{v.total}</td>
                        <td className="text-success">{v.won}</td>
                        <td className="text-error">{v.lost}</td>
                        <td>
                          <span
                            className={
                              v.conversion >= 50
                                ? 'text-success'
                                : v.conversion >= 25
                                  ? 'text-warning'
                                  : 'text-error'
                            }
                          >
                            {v.conversion}%
                          </span>
                        </td>
                        <td className="text-success font-mono">{formatCurrency(v.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Origin Breakdown */}
            <div className="card bg-base-300">
              <div className="card-body">
                <h2 className="text-base font-semibold mb-4">Origem dos Leads</h2>
                <div className="flex flex-col gap-2">
                  {(advancedData.origin_breakdown ?? []).map((o, i) => {
                    const maxCount = Math.max(
                      ...(advancedData.origin_breakdown ?? []).map(x => x.count),
                      1
                    );
                    const pct = (o.count / maxCount) * 100;
                    return (
                      <div key={o.source_id ?? 'none'}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">{o.name}</span>
                          <span className="text-xs text-base-content/50">{o.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.06]">
                          <div
                            style={{
                              height: '100%',
                              borderRadius: '3px',
                              width: `${pct}%`,
                              background: `hsl(${210 + i * 30}, 80%, 55%)`,
                              transition: 'width 0.5s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {(advancedData.origin_breakdown ?? []).length === 0 && (
                    <p className="text-sm text-base-content/50">Sem dados de origem</p>
                  )}
                </div>
              </div>
            </div>

            {/* Leads Over Time */}
            <div className="card bg-base-300">
              <div className="card-body">
                <h2 className="text-base font-semibold mb-4">Evolução de Leads (6 meses)</h2>
                <div className="flex items-end gap-2 h-[150px]">
                  {(advancedData.leads_over_time ?? []).map(m => {
                    const maxC = Math.max(
                      ...(advancedData.leads_over_time ?? []).map(x => x.count),
                      1
                    );
                    const hPct = (m.count / maxC) * 100;
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold">{m.count}</span>
                        <div
                          style={{
                            width: '100%',
                            borderRadius: '4px 4px 0 0',
                            height: `${Math.max(hPct, 5)}%`,
                            background: 'var(--brand-gradient)',
                            transition: 'height 0.5s ease',
                          }}
                        />
                        <span className="text-xs text-base-content/50 whitespace-nowrap">
                          {m.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Revenue Forecast */}
          {(advancedData.revenue_forecast ?? []).length > 0 && (
            <div className="card bg-base-300 mt-6">
              <div className="card-body">
                <h2 className="text-base font-semibold mb-4">Previsão de Receita</h2>
                <div className="flex gap-4 flex-wrap">
                  {(advancedData.revenue_forecast ?? []).map(f => (
                    <div
                      key={f.month}
                      className="flex-1 min-w-35 text-center rounded-xl bg-white/[0.03] border border-white/[0.06] p-4"
                    >
                      <div className="text-xs text-base-content/50 mb-1">{f.label}</div>
                      <div className="text-lg font-bold text-success font-mono">
                        {formatCurrency(f.revenue)}
                      </div>
                      <div className="text-xs text-base-content/50">{f.count} oportunidades</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Next Contacts (all users) */}
      {nextContactsData && nextContactsData.items.length > 0 && (
        <div className="card bg-base-300 mt-6">
          <div className="card-body">
            <h2 className="text-base font-semibold mb-4">
              {isManager ? 'Leads Sem Contato Recente' : 'Próximos Contatos'}
            </h2>
            <div className="flex flex-col gap-2">
              {nextContactsData.items.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer border ${
                    item.days_since_contact > 7
                      ? 'bg-error/[0.06] border-error/20'
                      : 'bg-white/[0.02] border-white/[0.06]'
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{item.name}</div>
                    <div className="text-xs text-base-content/50">
                      {item.contact_name} · {item.stage_name}
                      {item.expected_revenue > 0 && ` · ${formatCurrency(item.expected_revenue)}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-xs font-semibold ${
                        item.days_since_contact > 7
                          ? 'text-error'
                          : item.days_since_contact > 3
                            ? 'text-warning'
                            : 'text-success'
                      }`}
                    >
                      {item.days_since_contact}d atrás
                    </div>
                    <div className="text-xs text-base-content/50">
                      {item.phone || item.email_from}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
