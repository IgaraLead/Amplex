import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiDownload } from '@/shared/api';
import { useToast } from '@/shared/ui/useToast';
import { Modal } from '@/shared/ui/Modal';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';

interface ContactSuggestion {
  id: number;
  name: string;
  email: string;
  phone: string;
}

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
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function Leads() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const orgBase = slug ? `/id/${slug}` : '';
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const showNew = searchParams.get('new') === '1';

  const [searchInput, setSearchInput] = useState(search);
  const [showModal, setShowModal] = useState(showNew);
  const [exportFormat, setExportFormat] = useState('csv');
  const [newLead, setNewLead] = useState({
    name: '',
    contact_name: '',
    email_from: '',
    phone: '',
    expected_revenue: 0,
    source_id: 0,
    function: '',
    partner_id: 0,
  });
  const [contactQuery, setContactQuery] = useState('');
  const [debouncedContactQuery, setDebouncedContactQuery] = useState('');
  const [showContactSuggestions, setShowContactSuggestions] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedContactQuery(contactQuery), 200);
    return () => clearTimeout(handle);
  }, [contactQuery]);

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ['leads', page, search],
    queryFn: () =>
      apiGet(
        `/crm/leads?page=${page}&limit=20&type=opportunity${search ? `&search=${encodeURIComponent(search)}` : ''}`
      ),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newLead) =>
      apiPost('/crm/leads', {
        ...body,
        type: 'opportunity',
        source_id: body.source_id || undefined,
        partner_id: body.partner_id || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setShowModal(false);
      setNewLead({
        name: '',
        contact_name: '',
        email_from: '',
        phone: '',
        expected_revenue: 0,
        source_id: 0,
        function: '',
        partner_id: 0,
      });
      setContactQuery('');
      setShowContactSuggestions(false);
      addToast('Oportunidade criada', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const { data: sourcesData } = useQuery<{ items: Array<{ id: number; name: string }> }>({
    queryKey: ['sources'],
    queryFn: () => apiGet('/crm/sources'),
  });

  const { data: contactSuggestions } = useQuery<{ items: ContactSuggestion[] }>({
    queryKey: ['contact-suggestions', debouncedContactQuery],
    queryFn: () =>
      apiGet(`/crm/contacts?search=${encodeURIComponent(debouncedContactQuery)}&limit=8`),
    enabled: showContactSuggestions && debouncedContactQuery.trim().length >= 2,
  });

  function handleSelectContact(contact: ContactSuggestion) {
    setNewLead(prev => ({
      ...prev,
      contact_name: contact.name,
      email_from: prev.email_from || contact.email,
      phone: prev.phone || contact.phone,
      partner_id: contact.id,
    }));
    setContactQuery(contact.name);
    setShowContactSuggestions(false);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams({ search: searchInput, page: '1' });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Oportunidades</h1>
        <div className="flex items-center gap-2">
          <select
            className="select select-sm"
            value={exportFormat}
            onChange={e => setExportFormat(e.target.value)}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              apiDownload(
                `/crm/export/leads?type=opportunity&format=${exportFormat}`,
                `leads_amplex.${exportFormat}`
              )
            }
          >
            <Download size={14} /> Exportar
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Nova Oportunidade
          </button>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2 max-w-100">
        <input
          className="input"
          placeholder="Buscar por nome, contato ou email..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" type="submit">
          Buscar
        </button>
      </form>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-8 text-base-content/50">Carregando...</div>
      ) : (
        <>
          <div className="table-container">
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
                {data?.items.map(lead => (
                  <tr
                    key={lead.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`${orgBase}/leads/${lead.id}`)}
                  >
                    <td className="font-medium">{lead.name}</td>
                    <td>{lead.contact_name || lead.partner_name}</td>
                    <td>
                      <span className="badge badge-info">{lead.stage_name}</span>
                    </td>
                    <td
                      className={
                        lead.expected_revenue > 0
                          ? 'text-success font-mono'
                          : 'text-base-content/50'
                      }
                    >
                      {lead.expected_revenue > 0 ? formatCurrency(lead.expected_revenue) : '—'}
                    </td>
                    <td>{lead.user_name || '—'}</td>
                    <td className="text-xs text-base-content/50">
                      {new Date(lead.create_date).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
                {data?.items?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-base-content/50">
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
                <ChevronLeft size={14} className="inline" /> Anterior
              </button>
              <span className="text-xs text-base-content/50">
                Página {data.page} de {data.pages} ({data.total} resultados)
              </span>
              <button
                disabled={page >= data.pages}
                onClick={() => setSearchParams({ search, page: String(page + 1) })}
              >
                Próxima <ChevronRight size={14} className="inline" />
              </button>
            </div>
          )}
        </>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} className="max-w-md px-4">
        <div className="card bg-base-300">
          <div className="card-body">
            <h2 className="mb-4 text-lg font-bold">Nova Oportunidade</h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                createMutation.mutate(newLead);
              }}
              className="flex flex-col gap-4"
            >
              <fieldset className="fieldset">
                <label className="label">Nome da Oportunidade *</label>
                <input
                  className="input w-full"
                  required
                  value={newLead.name}
                  onChange={e => setNewLead({ ...newLead, name: e.target.value })}
                  placeholder="Ex: Proposta Empresa XYZ"
                />
              </fieldset>
              <fieldset className="fieldset">
                <label className="label">Nome do Contato</label>
                <div className="relative">
                  <input
                    className="input w-full"
                    value={newLead.contact_name}
                    onChange={e => {
                      const value = e.target.value;
                      setNewLead(prev => ({
                        ...prev,
                        contact_name: value,
                        partner_id: 0,
                      }));
                      setContactQuery(value);
                      setShowContactSuggestions(true);
                    }}
                    onFocus={() => setShowContactSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowContactSuggestions(false), 150)}
                    placeholder="João Silva"
                    autoComplete="off"
                  />
                  {showContactSuggestions &&
                    debouncedContactQuery.trim().length >= 2 &&
                    (contactSuggestions?.items?.length ?? 0) > 0 && (
                      <ul className="menu absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-box bg-base-100 shadow-lg">
                        {contactSuggestions!.items.map(contact => (
                          <li key={contact.id}>
                            <button
                              type="button"
                              className="flex flex-col items-start gap-0.5 py-2"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => handleSelectContact(contact)}
                            >
                              <span className="text-sm font-medium">{contact.name}</span>
                              {(contact.email || contact.phone) && (
                                <span className="text-xs text-base-content/60">
                                  {[contact.email, contact.phone].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <fieldset className="fieldset">
                  <label className="label">E-mail</label>
                  <input
                    className="input w-full"
                    type="email"
                    value={newLead.email_from}
                    onChange={e => setNewLead({ ...newLead, email_from: e.target.value })}
                    placeholder="email@empresa.com"
                  />
                </fieldset>
                <fieldset className="fieldset">
                  <label className="label">Telefone</label>
                  <input
                    className="input w-full"
                    value={newLead.phone}
                    onChange={e => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="+55 11 99999-9999"
                  />
                </fieldset>
              </div>
              <fieldset className="fieldset">
                <label className="label">Receita Esperada (R$)</label>
                <input
                  className="input w-full"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newLead.expected_revenue || ''}
                  onChange={e =>
                    setNewLead({ ...newLead, expected_revenue: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0.00"
                />
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <fieldset className="fieldset">
                  <label className="label">Origem</label>
                  <select
                    className="select w-full"
                    value={newLead.source_id || ''}
                    onChange={e =>
                      setNewLead({ ...newLead, source_id: parseInt(e.target.value) || 0 })
                    }
                  >
                    <option value="">Selecione...</option>
                    {(sourcesData?.items || []).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </fieldset>
                <fieldset className="fieldset">
                  <label className="label">Cargo</label>
                  <input
                    className="input w-full"
                    value={newLead.function}
                    onChange={e => setNewLead({ ...newLead, function: e.target.value })}
                    placeholder="Ex: Diretor Comercial"
                  />
                </fieldset>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Criando...' : 'Criar Oportunidade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}
