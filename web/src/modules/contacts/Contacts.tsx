import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiDownload } from '@/shared/api';
import { useToast } from '@/shared/ui/useToast';
import { Modal } from '@/shared/ui/Modal';
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
        <div className="flex items-center gap-2">
          <select
            className="select select-sm h-9 w-auto text-xs"
            value={exportFormat}
            onChange={e => setExportFormat(e.target.value)}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
            <option value="pdf">PDF</option>
          </select>
          <button
            type="button"
            className="btn btn-ghost btn-sm flex items-center gap-1.5 border border-base-300"
            onClick={() =>
              apiDownload(
                `/crm/export/contacts?format=${exportFormat}${type ? `&type=${type}` : ''}`,
                `contatos_amplex.${exportFormat}`
              )
            }
          >
            <Download size={14} /> Exportar
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Novo Contato
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex min-w-[200px] max-w-md flex-1 gap-2">
          <input
            className="input input-sm flex-1"
            placeholder="Buscar nome, email ou telefone..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost btn-sm border border-base-300">
            Buscar
          </button>
        </form>
        <div className="flex gap-1">
          {['', 'person', 'company'].map(t => (
            <button
              key={t}
              type="button"
              className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
              onClick={() => setSearchParams({ search, page: '1', type: t })}
            >
              {t === '' ? 'Todos' : t === 'person' ? 'Pessoas' : 'Empresas'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-base-content/50">Carregando...</div>
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
                    <td className="font-medium text-base-content">{contact.name}</td>
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
                {data?.items?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-base-content/50">
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
                type="button"
                disabled={page <= 1}
                onClick={() => setSearchParams({ search, page: String(page - 1), type })}
              >
                <ChevronLeft size={14} className="inline" /> Anterior
              </button>
              <span className="text-xs text-base-content/50">
                Página {data.page} de {data.pages} ({data.total} contatos)
              </span>
              <button
                type="button"
                disabled={page >= data.pages}
                onClick={() => setSearchParams({ search, page: String(page + 1), type })}
              >
                Próxima <ChevronRight size={14} className="inline" />
              </button>
            </div>
          )}
        </>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} className="max-w-lg px-4">
        <div className="card bg-base-300">
          <div className="card-body">
            <h2 className="mb-6 text-lg font-bold">Novo Contato</h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                createMutation.mutate(newContact);
              }}
              className="flex flex-col gap-4"
            >
              <fieldset className="fieldset">
                <label className="label text-xs text-base-content/55">Nome *</label>
                <input
                  className="input w-full"
                  required
                  value={newContact.name}
                  onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                  placeholder="Nome do contato ou empresa"
                />
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <fieldset className="fieldset">
                  <label className="label text-xs text-base-content/55">E-mail</label>
                  <input
                    className="input w-full"
                    type="email"
                    value={newContact.email}
                    onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                    placeholder="email@empresa.com"
                  />
                </fieldset>
                <fieldset className="fieldset">
                  <label className="label text-xs text-base-content/55">Telefone</label>
                  <input
                    className="input w-full"
                    value={newContact.phone}
                    onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                    placeholder="+55 11 99999-9999"
                  />
                </fieldset>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <fieldset className="fieldset">
                  <label className="label text-xs text-base-content/55">Cidade</label>
                  <input
                    className="input w-full"
                    value={newContact.city}
                    onChange={e => setNewContact({ ...newContact, city: e.target.value })}
                    placeholder="São Paulo"
                  />
                </fieldset>
                <fieldset className="fieldset">
                  <label className="label text-xs text-base-content/55">CNPJ</label>
                  <input
                    className="input w-full"
                    value={newContact.cnpj}
                    onChange={e => setNewContact({ ...newContact, cnpj: e.target.value })}
                    placeholder="00.000.000/0001-00"
                  />
                </fieldset>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-base-content">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={newContact.is_company}
                  onChange={e => setNewContact({ ...newContact, is_company: e.target.checked })}
                />
                É empresa
              </label>
              <div className="mt-2 flex justify-end gap-3">
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
      </Modal>
    </div>
  );
}
