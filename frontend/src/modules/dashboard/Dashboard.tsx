import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../shared/api";
import { useAuth } from "../../shared/store";
import { Check } from "lucide-react";

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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin';

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet("/crm/dashboard"),
  });

  const { data: advancedData } = useQuery<AdvancedDashData>({
    queryKey: ["dashboard-advanced"],
    queryFn: () => apiGet("/crm/dashboard/advanced"),
    enabled: isManager,
  });

  const { data: nextContactsData } = useQuery<{ items: NextContactItem[] }>({
    queryKey: ["next-contacts"],
    queryFn: () => apiGet("/crm/leads/next-contacts?limit=10"),
  });

  if (isLoading) {
    return (
      <div className="page">
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          Carregando dashboard...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <div className="glass" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--danger)" }}>Erro ao carregar dashboard</p>
        </div>
      </div>
    );
  }

  const { pipeline, stages, total_contacts } = data;
  const monthChange = pipeline.new_last_month > 0
    ? Math.round(((pipeline.new_this_month - pipeline.new_last_month) / pipeline.new_last_month) * 100)
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
        <div className="glass stat-card">
          <div className="stat-card-label">Oportunidades Ativas</div>
          <div className="stat-card-value">{pipeline.total_opportunities}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-card-label">Leads</div>
          <div className="stat-card-value">{pipeline.total_leads}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-card-label">Ganhas</div>
          <div className="stat-card-value" style={{ color: "var(--success)" }}>{pipeline.won}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-card-label">Receita Total</div>
          <div className="stat-card-value gradient-text">{formatCurrency(pipeline.total_revenue)}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-card-label">Novos Este Mês</div>
          <div className="stat-card-value">{pipeline.new_this_month}</div>
          {monthChange !== 0 && (
            <div className="stat-card-change" style={{ color: monthChange > 0 ? "var(--success)" : "var(--danger)" }}>
              {monthChange > 0 ? "+" : ""}{monthChange}% vs mês anterior
            </div>
          )}
        </div>
        <div className="glass stat-card">
          <div className="stat-card-label">Taxa de Conversão</div>
          <div className="stat-card-value" style={{ color: conversionRate >= 50 ? "var(--success)" : "var(--warning)" }}>{conversionRate}%</div>
          <div className="stat-card-change" style={{ color: "var(--text-muted)" }}>
            {pipeline.won}W / {pipeline.lost}L
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isManager ? "1fr 1fr" : "1fr", gap: "1.5rem" }}>
        {/* Pipeline Stages */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
            Pipeline por Estágio
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {stages.map((stage) => {
              const maxCount = Math.max(...stages.map(s => s.count), 1);
              const pct = (stage.count / maxCount) * 100;
              return (
                <div key={stage.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                    <span style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 500 }}>
                      {stage.name}
                      {stage.is_won && <span style={{ color: "var(--success)", marginLeft: "0.5rem", display: "inline-flex" }}><Check size={14} /></span>}
                    </span>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {stage.count} · {formatCurrency(stage.revenue)}
                    </span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: "3px",
                      width: `${pct}%`,
                      background: stage.is_won ? "var(--success)" : "var(--brand-gradient)",
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversion Funnel (Manager Only) */}
        {isManager && (
          <div className="glass" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
              Funil de Conversão
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stages.map((stage, i) => {
                const totalInPipeline = stages.reduce((s, st) => s + st.count, 0);
                const width = totalInPipeline > 0 ? Math.max((stage.count / totalInPipeline) * 100, 5) : 5;
                return (
                  <div key={stage.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{
                      height: "32px",
                      width: `${width}%`,
                      minWidth: "40px",
                      borderRadius: "4px",
                      background: stage.is_won
                        ? "var(--success)"
                        : `rgba(0, 112, 255, ${0.3 + (1 - i / stages.length) * 0.5})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.75rem", fontWeight: 600, color: "#fff",
                      transition: "width 0.5s ease",
                    }}>
                      {stage.count}
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-light)", whiteSpace: "nowrap" }}>{stage.name}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "1.25rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Total em pipeline</span>
                <span style={{ color: "#fff", fontWeight: 600 }}>{stages.reduce((s, st) => s + st.count, 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginTop: "0.4rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Contatos</span>
                <span style={{ color: "#fff", fontWeight: 600 }}>{total_contacts}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginTop: "0.4rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Receita potencial</span>
                <span style={{ color: "var(--success)", fontWeight: 600 }}>{formatCurrency(stages.reduce((s, st) => s + st.revenue, 0))}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Manager Panels */}
      {isManager && advancedData && (
        <>
          {/* Vendor Performance Table */}
          <div className="glass" style={{ padding: "1.5rem", marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
              Performance por Vendedor
            </h2>
            <div className="table-container" style={{ background: "transparent" }}>
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
                  {advancedData.vendor_performance.map((v) => (
                    <tr key={v.user_id}>
                      <td style={{ fontWeight: 500, color: "#fff" }}>{v.name}</td>
                      <td>{v.total}</td>
                      <td style={{ color: "var(--success)" }}>{v.won}</td>
                      <td style={{ color: "var(--danger)" }}>{v.lost}</td>
                      <td>
                        <span style={{
                          color: v.conversion >= 50 ? "var(--success)" : v.conversion >= 25 ? "var(--warning)" : "var(--danger)"
                        }}>
                          {v.conversion}%
                        </span>
                      </td>
                      <td style={{ color: "var(--success)" }}>{formatCurrency(v.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "1.5rem" }}>
            {/* Origin Breakdown */}
            <div className="glass" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
                Origem dos Leads
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {advancedData.origin_breakdown.map((o, i) => {
                  const maxCount = Math.max(...advancedData.origin_breakdown.map(x => x.count), 1);
                  const pct = (o.count / maxCount) * 100;
                  return (
                    <div key={o.source_id ?? 'none'}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                        <span style={{ fontSize: "0.85rem", color: "#fff" }}>{o.name}</span>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{o.count}</span>
                      </div>
                      <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)" }}>
                        <div style={{
                          height: "100%", borderRadius: "3px", width: `${pct}%`,
                          background: `hsl(${210 + i * 30}, 80%, 55%)`, transition: "width 0.5s ease",
                        }} />
                      </div>
                    </div>
                  );
                })}
                {advancedData.origin_breakdown.length === 0 && (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Sem dados de origem</p>
                )}
              </div>
            </div>

            {/* Leads Over Time */}
            <div className="glass" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
                Evolução de Leads (6 meses)
              </h2>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", height: 150 }}>
                {advancedData.leads_over_time.map((m) => {
                  const maxC = Math.max(...advancedData.leads_over_time.map(x => x.count), 1);
                  const hPct = (m.count / maxC) * 100;
                  return (
                    <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
                      <span style={{ fontSize: "0.7rem", color: "#fff", fontWeight: 600 }}>{m.count}</span>
                      <div style={{
                        width: "100%", borderRadius: "4px 4px 0 0",
                        height: `${Math.max(hPct, 5)}%`,
                        background: "var(--brand-gradient)", transition: "height 0.5s ease",
                      }} />
                      <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Revenue Forecast */}
          {advancedData.revenue_forecast.length > 0 && (
            <div className="glass" style={{ padding: "1.5rem", marginTop: "1.5rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
                Previsão de Receita
              </h2>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {advancedData.revenue_forecast.map((f) => (
                  <div key={f.month} className="glass" style={{ padding: "1rem", flex: "1 1 140px", textAlign: "center" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>{f.label}</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--success)" }}>{formatCurrency(f.revenue)}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{f.count} oportunidades</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Next Contacts (all users) */}
      {nextContactsData && nextContactsData.items.length > 0 && (
        <div className="glass" style={{ padding: "1.5rem", marginTop: "1.5rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
            {isManager ? 'Leads Sem Contato Recente' : 'Próximos Contatos'}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {nextContactsData.items.map((item) => (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.6rem 0.75rem", borderRadius: "8px",
                background: item.days_since_contact > 7 ? "rgba(255,59,48,0.06)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${item.days_since_contact > 7 ? "rgba(255,59,48,0.2)" : "var(--border)"}`,
                cursor: "pointer",
              }}>
                <div>
                  <div style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 500 }}>{item.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {item.contact_name} · {item.stage_name}
                    {item.expected_revenue > 0 && ` · ${formatCurrency(item.expected_revenue)}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{
                    fontSize: "0.8rem", fontWeight: 600,
                    color: item.days_since_contact > 7 ? "var(--danger)" : item.days_since_contact > 3 ? "var(--warning)" : "var(--success)"
                  }}>
                    {item.days_since_contact}d atrás
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                    {item.phone || item.email_from}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
