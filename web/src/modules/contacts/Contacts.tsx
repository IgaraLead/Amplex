import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Plus, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import PageHeader from '@/shared/page/PageHeader';
import { apiDownload, apiGet, apiPost } from '@/shared/api';
import { useToast } from '@/shared/ui/useToast';

interface ContactItem {
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
}

interface ContactsResponse {
  items: ContactItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const emptyContact = { name: '', email: '', phone: '', is_company: false, city: '', cnpj: '' };

export default function Contacts() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const type = searchParams.get('type') || '';
  const [searchInput, setSearchInput] = useState(search);
  const [showModal, setShowModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [newContact, setNewContact] = useState(emptyContact);

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
      setNewContact(emptyContact);
      addToast('Contato criado', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchParams({ search: searchInput, page: '1', type });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid gap-4 border-b border-border/70 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <PageHeader
          title="Contatos"
          description="Centralize pessoas e empresas associadas ao pipeline comercial."
          tag="Pessoas e Empresas"
          className="mb-0 min-w-0 self-end border-b-0 pb-0"
        />
        <div className="flex flex-wrap items-end justify-end gap-2 justify-self-end">
          <Select value={exportFormat} onValueChange={setExportFormat}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="xlsx">Excel</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              apiDownload(
                `/crm/export/contacts?format=${exportFormat}${type ? `&type=${type}` : ''}`,
                `contatos_amplex.${exportFormat}`
              )
            }
          >
            <Download className="size-4" /> Exportar
          </Button>
          <Button type="button" onClick={() => setShowModal(true)}>
            <Plus className="size-4" /> Novo contato
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder="Buscar contatos"
              />
            </div>
            <Select
              value={type || 'all'}
              onValueChange={value =>
                setSearchParams({ search, page: '1', type: value === 'all' ? '' : value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="person">Pessoas</SelectItem>
                <SelectItem value="company">Empresas</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
          </form>

          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Oportunidades</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).map(contact => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">{contact.name}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {contact.email || contact.phone || contact.mobile || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[contact.city, contact.state].filter(Boolean).join(' / ') || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={contact.is_company ? 'default' : 'outline'}>
                        {contact.is_company ? 'Empresa' : 'Pessoa'}
                      </Badge>
                    </TableCell>
                    <TableCell>{contact.opportunity_count}</TableCell>
                  </TableRow>
                ))}
                {(data?.items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nenhum contato encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {data?.page ?? page} de {data?.pages ?? 1}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setSearchParams({ search, type, page: String(page - 1) })}
              >
                <ChevronLeft className="size-4" />
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= (data?.pages ?? 1)}
                onClick={() => setSearchParams({ search, type, page: String(page + 1) })}
              >
                Próxima
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo contato</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault();
              createMutation.mutate(newContact);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="contact-name">Nome</Label>
                <Input
                  id="contact-name"
                  required
                  value={newContact.name}
                  onChange={event => setNewContact({ ...newContact, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">E-mail</Label>
                <Input
                  id="contact-email"
                  type="email"
                  value={newContact.email}
                  onChange={event => setNewContact({ ...newContact, email: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Telefone</Label>
                <Input
                  id="contact-phone"
                  value={newContact.phone}
                  onChange={event => setNewContact({ ...newContact, phone: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-city">Cidade</Label>
                <Input
                  id="contact-city"
                  value={newContact.city}
                  onChange={event => setNewContact({ ...newContact, city: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-cnpj">CNPJ</Label>
                <Input
                  id="contact-cnpj"
                  value={newContact.cnpj}
                  onChange={event => setNewContact({ ...newContact, cnpj: event.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={newContact.is_company}
                  onCheckedChange={checked =>
                    setNewContact({ ...newContact, is_company: checked === true })
                  }
                />
                Empresa
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
