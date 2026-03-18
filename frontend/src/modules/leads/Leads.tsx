import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiGet, apiPost, apiDownload } from "../../shared/api";
import { useToast } from "../../shared/ui/Toast";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

interface LeadsResponse {
  items: Array<{
    id: number;
    name: string;
    type: string;
    stage_id: number;
    stage_name: string;
    contact_name: string;
    partner_name: string;
    email_from: string;
    phone: string;
    expected_revenue: number;
    probability: number;
    priority: string;
    user_name: string;
    create_date: string;
  }>;
  total: number;
  page: number;
  limit: number;
  pages: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Leads() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const showNew = searchParams.get("new") === "1";

  const [searchInput, setSearchInput] = useState(search);
  const [showModal, setShowModal] = useState(showNew);
  const [exportFormat, setExportFormat] = useState('csv');
  const [newLead, setNewLead] = useState({ name: "", contact_name: "", email_from: "", phone: "", expected_revenue: 0, source_id: 0, function: "" });

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ["leads", page, search],
    queryFn: () => apiGet(`/crm/leads?page=${page}&limit=20&type=opportunity${search ? `&search=${encodeURIComponent(search)}` : ""}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newLead) => apiPost("/crm/leads", { ...body, type: "opportunity", source_id: body.source_id || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      setShowModal(false);
      setNewLead({ name: "", contact_name: "", email_from: "", phone: "", expected_revenue: 0, source_id: 0, function: "" });
      addToast("Oportunidade criada", "success");
    },
    onError: (err: Error) => addToast(err.message, "error"),
  });

  const { data: sourcesData } = useQuery<{ items: Array<{ id: number; name: string }> }>({
    queryKey: ["sources"],
    queryFn: () => apiGet("/crm/sources"),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams({ search: searchInput, page: "1" });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Oportunidades</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            className="select"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            style={{ padding: "0.4rem 0.5rem", fontSize: "0.8rem", width: "auto" }}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            className="btn btn-ghost"
            style={{ border: "1px solid var(--border)", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
            onClick={() => apiDownload(`/crm/export/leads?type=opportunity&format=${exportFormat}`, `leads_amplex.${exportFormat}`)}
          >
            <Download size={14} /> Exportar
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Nova Oportunidade
          </button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", maxWidth: 400 }}>
        <input
          className="input"
          placeholder="Buscar por nome, contato ou email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button className="btn btn-ghost" type="submit" style={{ border: "1px solid var(--border)" }}>
          Buscar
        </button>
      </form>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Carregando...</div>
      ) : (
        <>
          <div className="table-container glass">
            <table>
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Contato</th>
                  <th>Estágio</th>
                  <th>Receita Esperada</th>
                  <th>Responsável</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((lead) => (
                  <tr key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} style={{ cursor: "pointer" }}>
                    <td style={{ fontWeight: 500, color: "#fff" }}>{lead.name}</td>
                    <td>{lead.contact_name || lead.partner_name}</td>
                    <td><span className="badge badge-info">{lead.stage_name}</span></td>
                    <td style={{ color: lead.expected_revenue > 0 ? "var(--success)" : "var(--text-muted)" }}>
                      {lead.expected_revenue > 0 ? formatCurrency(lead.expected_revenue) : "—"}
                    </td>
                    <td>{lead.user_name || "—"}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {new Date(lead.create_date).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                      Nenhuma oportunidade encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="pagination">
              <button
                disabled={page <= 1}
                onClick={() => setSearchParams({ search, page: String(page - 1) })}
              >
                <ChevronLeft size={14} style={{ display: "inline" }} /> Anterior
              </button>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Página {data.page} de {data.pages} ({data.total} resultados)
              </span>
              <button
                disabled={page >= data.pages}
                onClick={() => setSearchParams({ search, page: String(page + 1) })}
              >
                Próxima <ChevronRight size={14} style={{ display: "inline" }} />
              </button>
            </div>
          )}
        </>
      )}

      {/* New Lead Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }} onClick={() => setShowModal(false)}>
          <div className="glass" style={{ width: "100%", maxWidth: 480, padding: "2rem" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#fff", marginBottom: "1.5rem" }}>
              Nova Oportunidade
            </h2>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newLead); }}
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                  Nome da Oportunidade *
                </label>
                <input className="input" required value={newLead.name} onChange={(e) => setNewLead({ ...newLead, name: e.target.value })} placeholder="Ex: Proposta Empresa XYZ" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                  Nome do Contato
                </label>
                <input className="input" value={newLead.contact_name} onChange={(e) => setNewLead({ ...newLead, contact_name: e.target.value })} placeholder="João Silva" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>E-mail</label>
                  <input className="input" type="email" value={newLead.email_from} onChange={(e) => setNewLead({ ...newLead, email_from: e.target.value })} placeholder="email@empresa.com" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Telefone</label>
                  <input className="input" value={newLead.phone} onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })} placeholder="+55 11 99999-9999" />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
                  Receita Esperada (R$)
                </label>
                <input className="input" type="number" min="0" step="0.01" value={newLead.expected_revenue || ""} onChange={(e) => setNewLead({ ...newLead, expected_revenue: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Origem</label>
                  <select className="select" value={newLead.source_id || ""} onChange={(e) => setNewLead({ ...newLead, source_id: parseInt(e.target.value) || 0 })}>
                    <option value="">Selecione...</option>
                    {(sourcesData?.items || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Cargo</label>
                  <input className="input" value={newLead.function} onChange={(e) => setNewLead({ ...newLead, function: e.target.value })} placeholder="Ex: Diretor Comercial" />
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Criando..." : "Criar Oportunidade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
