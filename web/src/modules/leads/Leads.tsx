import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Plus, Search } from 'lucide-react';

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

interface LeadItem {
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
}

interface LeadsResponse {
  items: LeadItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const emptyLead = {
  name: '',
  contact_name: '',
  email_from: '',
  phone: '',
  expected_revenue: 0,
  source_id: 0,
  function: '',
  partner_id: 0,
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export default function Leads() {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const orgBase = slug ? `/id/${slug}` : '';
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || '1');
  const search = searchParams.get('search') || '';
  const showNew = searchParams.get('new') === '1';
  const [searchInput, setSearchInput] = useState(search);
  const [showModal, setShowModal] = useState(showNew);
  const [exportFormat, setExportFormat] = useState('csv');
  const [newLead, setNewLead] = useState(emptyLead);

  useEffect(() => setShowModal(showNew), [showNew]);

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ['leads', page, search],
    queryFn: () =>
      apiGet(
        `/crm/leads?page=${page}&limit=20&type=opportunity${search ? `&search=${encodeURIComponent(search)}` : ''}`
      ),
  });

  const { data: sourcesData } = useQuery<{ items: Array<{ id: number; name: string }> }>({
    queryKey: ['sources'],
    queryFn: () => apiGet('/crm/sources'),
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
      setNewLead(emptyLead);
      addToast('Oportunidade criada', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchParams({ search: searchInput, page: '1' });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid gap-4 border-b border-border/70 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <PageHeader
          title="Oportunidades"
          description="Gerencie oportunidades comerciais, origem, estágio e receita esperada."
          tag="Negócios"
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
                `/crm/export/leads?format=${exportFormat}&type=opportunity`,
                `oportunidades_amplex.${exportFormat}`
              )
            }
          >
            <Download className="size-4" /> Exportar
          </Button>
          <Button type="button" onClick={() => setShowModal(true)}>
            <Plus className="size-4" /> Nova oportunidade
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder="Buscar oportunidades"
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>

          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Oportunidade</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Receita</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.items ?? []).map(lead => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`${orgBase}/leads/${lead.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {lead.priority || 'normal'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{lead.stage_name}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>{lead.contact_name || '-'}</div>
                      <div className="text-xs text-muted-foreground">
                        {lead.email_from || lead.phone}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-success">
                      {formatCurrency(lead.expected_revenue)}
                    </TableCell>
                    <TableCell>{lead.user_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.create_date
                        ? new Date(lead.create_date).toLocaleDateString('pt-BR')
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.items ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Nenhuma oportunidade encontrada
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
                onClick={() => setSearchParams({ search, page: String(page - 1) })}
              >
                <ChevronLeft className="size-4" />
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= (data?.pages ?? 1)}
                onClick={() => setSearchParams({ search, page: String(page + 1) })}
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
            <DialogTitle>Nova oportunidade</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault();
              createMutation.mutate(newLead);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="lead-name">Nome da oportunidade</Label>
                <Input
                  id="lead-name"
                  required
                  value={newLead.name}
                  onChange={event => setNewLead({ ...newLead, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-contact">Contato</Label>
                <Input
                  id="lead-contact"
                  value={newLead.contact_name}
                  onChange={event => setNewLead({ ...newLead, contact_name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={newLead.email_from}
                  onChange={event => setNewLead({ ...newLead, email_from: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-phone">Telefone</Label>
                <Input
                  id="lead-phone"
                  value={newLead.phone}
                  onChange={event => setNewLead({ ...newLead, phone: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-revenue">Receita esperada</Label>
                <Input
                  id="lead-revenue"
                  type="number"
                  value={newLead.expected_revenue}
                  onChange={event =>
                    setNewLead({ ...newLead, expected_revenue: Number(event.target.value) })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Origem</Label>
                <Select
                  value={String(newLead.source_id || 0)}
                  onValueChange={value => setNewLead({ ...newLead, source_id: Number(value) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sem origem</SelectItem>
                    {(sourcesData?.items ?? []).map(source => (
                      <SelectItem key={source.id} value={String(source.id)}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
