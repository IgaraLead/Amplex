import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiDownload } from '../../shared/api';
import { useToast } from '../../shared/ui/Toast';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';

interface ContactsResponse {
  items: Array<{
    id: number;
    name: string;
    email: string;
    phone: string;
    mobile: string;
    is_company: boolean;
    city: string;
    state: string;
    customer_rank: number;
    opportunity_count: number;
  }>;
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function Contacts() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = parseInt(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const type = searchParams.get('type') || '';

  const [searchInput, setSearchInput] = useState(search);
  const [showModal, setShowModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [newContact, setNewContact] = useState({
    name: '',
    email: '',
    phone: '',
    is_company: false,
    city: '',
    cnpj: '',
  });

  const { data, isLoading } = useQuery<ContactsResponse>({
    queryKey: ['contacts', page, search, type],
    queryFn: () => {
      let url = `/crm/contacts?page=${page}&limit=20`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (type) url += `&type=${type}`;
      return apiGet(url);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof newContact) => apiPost('/crm/contacts', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setShowModal(false);
      setNewContact({ name: '', email: '', phone: '', is_company: false, city: '', cnpj: '' });
      addToast('Contato criado', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams({ search: searchInput, page: '1', type });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Contatos</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            className="select"
            value={exportFormat}
            onChange={e => setExportFormat(e.target.value)}
            style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            className="btn btn-ghost"
            style={{
              border: '1px solid var(--border)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            onClick={() =>
              apiDownload(
                `/crm/export/contacts?format=${exportFormat}${type ? `&type=${type}` : ''}`,
                `contatos_amplex.${exportFormat}`
              )
            }
          >
            <Download size={14} /> Exportar
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Novo Contato
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <form
          onSubmit={handleSearch}
          style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: 200, maxWidth: 400 }}
        >
          <input
            className="input"
            placeholder="Buscar nome, email ou telefone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button
            className="btn btn-ghost"
            type="submit"
            style={{ border: '1px solid var(--border)' }}
          >
            Buscar
          </button>
        </form>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['', 'person', 'company'].map(t => (
            <button
              key={t}
              className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-ghost'}`}
              style={type !== t ? { border: '1px solid var(--border)' } : {}}
              onClick={() => setSearchParams({ search, page: '1', type: t })}
            >
              {t === '' ? 'Todos' : t === 'person' ? 'Pessoas' : 'Empresas'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          Carregando...
        </div>
      ) : (
        <>
          <div className="table-container glass">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Cidade</th>
                  <th>Tipo</th>
                  <th>Oportunidades</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map(contact => (
                  <tr key={contact.id}>
                    <td style={{ fontWeight: 500, color: '#fff' }}>{contact.name}</td>
                    <td>{contact.email || '—'}</td>
                    <td>{contact.phone || contact.mobile || '—'}</td>
                    <td>
                      {contact.city && contact.state
                        ? `${contact.city}, ${contact.state}`
                        : contact.city || '—'}
                    </td>
                    <td>
                      <span
                        className={`badge ${contact.is_company ? 'badge-warning' : 'badge-info'}`}
                      >
                        {contact.is_company ? 'Empresa' : 'Pessoa'}
                      </span>
                    </td>
                    <td>{contact.opportunity_count || '—'}</td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}
                    >
                      Nenhum contato encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data && data.pages > 1 && (
            <div className="pagination">
              <button
                disabled={page <= 1}
                onClick={() => setSearchParams({ search, page: String(page - 1), type })}
              >
                <ChevronLeft size={14} style={{ display: 'inline' }} /> Anterior
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Página {data.page} de {data.pages} ({data.total} contatos)
              </span>
              <button
                disabled={page >= data.pages}
                onClick={() => setSearchParams({ search, page: String(page + 1), type })}
              >
                Próxima <ChevronRight size={14} style={{ display: 'inline' }} />
              </button>
            </div>
          )}
        </>
      )}

      {/* New Contact Modal */}
      {showModal && (
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
          onClick={() => setShowModal(false)}
        >
          <div
            className="glass"
            style={{ width: '100%', maxWidth: 480, padding: '2rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h2
              style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '1.5rem' }}
            >
              Novo Contato
            </h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                createMutation.mutate(newContact);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.3rem',
                  }}
                >
                  Nome *
                </label>
                <input
                  className="input"
                  required
                  value={newContact.name}
                  onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                  placeholder="Nome do contato ou empresa"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.3rem',
                    }}
                  >
                    E-mail
                  </label>
                  <input
                    className="input"
                    type="email"
                    value={newContact.email}
                    onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                    placeholder="email@empresa.com"
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.3rem',
                    }}
                  >
                    Telefone
                  </label>
                  <input
                    className="input"
                    value={newContact.phone}
                    onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                    placeholder="+55 11 99999-9999"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.3rem',
                    }}
                  >
                    Cidade
                  </label>
                  <input
                    className="input"
                    value={newContact.city}
                    onChange={e => setNewContact({ ...newContact, city: e.target.value })}
                    placeholder="São Paulo"
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.3rem',
                    }}
                  >
                    CNPJ
                  </label>
                  <input
                    className="input"
                    value={newContact.cnpj}
                    onChange={e => setNewContact({ ...newContact, cnpj: e.target.value })}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.85rem',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={newContact.is_company}
                  onChange={e => setNewContact({ ...newContact, is_company: e.target.checked })}
                />
                É empresa
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  justifyContent: 'flex-end',
                  marginTop: '0.5rem',
                }}
              >
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Criando...' : 'Criar Contato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
