import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  ChevronLeft,
  Check,
  Contact,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  Settings,
  Shield,
  Sun,
  Target,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { apiDelete, apiGet, apiPost } from '@/shared/api';
import { AMPLEX_NAME } from '@/shared/branding';
import { useAuth } from '@/shared/store';
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  themeOptions,
  type ThemeMode,
} from '@/shared/theme';
import Logo from '@/shared/ui/Logo';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NotificationItem {
  id: string;
  summary: string;
  note: string;
  date_deadline: string | null;
  due_at: string | null;
  remind_at: string | null;
  offset_minutes: number | null;
  state: 'overdue' | 'today' | 'planned';
  activity_type: string;
  user_name: string;
  lead_id: number;
  lead_name: string;
}

const mainItems: NavItem[] = [
  { to: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: 'leads', label: 'Oportunidades', icon: Target },
  { to: 'contacts', label: 'Contatos', icon: Contact },
];

const notificationState: Record<
  NotificationItem['state'],
  { label: string; variant: 'destructive' | 'warning' | 'default' }
> = {
  overdue: { label: 'Atrasada', variant: 'destructive' },
  today: { label: 'Hoje', variant: 'warning' },
  planned: { label: 'Planejada', variant: 'default' },
};

const formatNotificationDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value))
    : null;

const formatReminderOffset = (minutes?: number | null) => {
  if (!minutes) return null;
  if (minutes === 10080) return '1 semana antes';
  if (minutes >= 1440) return `${minutes / 1440} dias antes`;
  if (minutes >= 60) return `${minutes / 60}h antes`;
  return `${minutes} min antes`;
};

export default function AppLayout() {
  const { user, loading, fetchUser, logout, currentOrg, setCurrentOrg } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountPanel, setAccountPanel] = useState<'main' | 'theme'>('main');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const topbarActionsRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    applyTheme(themeMode);
    if (themeMode !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => applyTheme('system');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  useEffect(() => {
    if (!user || !slug) return;
    if (currentOrg?.slug === slug) return;
    const org = user.organizations?.find(item => item.slug === slug);
    if (org) {
      setCurrentOrg(org);
      return;
    }
    navigate('/orgs', { replace: true });
  }, [user, slug, currentOrg?.slug, setCurrentOrg, navigate]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (topbarActionsRef.current && !topbarActionsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
        setAccountOpen(false);
        setAccountPanel('main');
      }
    };
    if (notificationsOpen || accountOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notificationsOpen, accountOpen]);

  const orgBase = slug ? `/id/${slug}` : '';

  const { data: notifData } = useQuery<{
    items: NotificationItem[];
    badge_count: number;
    overdue_count: number;
    today_count: number;
  }>({
    queryKey: ['notifications', slug],
    queryFn: () => apiGet('/crm/notifications'),
    refetchInterval: 60000,
    enabled: Boolean(user && slug),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/crm/notifications/${id}/done`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/crm/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const badgeCount = notifData?.badge_count ?? 0;
  const isExpanded = sidebarExpanded;
  const organizations = user?.organizations ?? [];
  const canSwitchOrg = organizations.length > 1;
  const currentOrgPath = slug
    ? location.pathname.replace(`/id/${slug}`, '') || '/dashboard'
    : '/dashboard';

  const handleSwitchOrg = (org: (typeof organizations)[number]) => {
    setCurrentOrg(org);
    setAccountOpen(false);
    setAccountPanel('main');
    queryClient.clear();
    navigate(`/id/${org.slug}${currentOrgPath}`);
  };

  const handleSetTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
  };

  const ThemeIcon =
    resolveTheme(themeMode) === 'light' ? Sun : themeMode === 'system' ? Monitor : Moon;
  const isPasswordChangeRoute = location.pathname.endsWith('/password/change');

  if (loading) {
    return (
      <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
        <div className="fixed left-0 top-0 z-50 flex h-14 w-14 items-center justify-center bg-card">
          <Logo size={30} />
        </div>
        <header className="fixed left-14 right-0 top-0 z-40 flex h-14 items-center gap-3 bg-card px-4 py-2.5">
          <div className="min-w-0 shrink-0">
            <p className="font-sans text-sm font-semibold leading-none text-foreground">
              {AMPLEX_NAME}
            </p>
            <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:block">
              O CRM da IgaraLead
            </p>
          </div>
        </header>
        <main className="ml-14 flex min-h-screen w-[calc(100%_-_3.5rem)] items-center justify-center px-4 pt-14">
          <Card className="w-full max-w-sm">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Carregando...
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.force_password_change && !location.pathname.endsWith('/password/change')) {
    return <Navigate to={`/id/${slug}/password/change`} replace />;
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      <div className="fixed left-0 top-0 z-50 flex h-14 w-14 items-center justify-center bg-card">
        <Logo size={30} />
      </div>

      <header className="fixed left-14 right-0 top-0 z-40 flex h-14 items-center gap-3 bg-card px-4 py-2.5">
        <div className="min-w-0 shrink-0">
          <p className="font-sans text-sm font-semibold leading-none text-foreground">
            {AMPLEX_NAME}
          </p>
          <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:block">
            O CRM da IgaraLead
          </p>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2" ref={topbarActionsRef}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label="Abrir notificações"
            onClick={() => {
              setNotificationsOpen(value => !value);
              setAccountOpen(false);
              setAccountPanel('main');
            }}
          >
            <Bell className="size-4" />
            {badgeCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-[0.55rem] font-bold leading-none text-destructive-foreground">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </Button>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-[11px] font-bold text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Abrir menu da conta"
            aria-expanded={accountOpen}
            onClick={() => {
              setAccountOpen(value => {
                const next = !value;
                if (!next) setAccountPanel('main');
                return next;
              });
              setNotificationsOpen(false);
            }}
          >
            {user.name.slice(0, 2).toUpperCase()}
          </button>
          {accountOpen && (
            <Card className="absolute right-2 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-2rem))] gap-0 overflow-hidden border-border/80 bg-popover py-0 shadow-2xl">
              <div
                className={cn(
                  'flex w-[200%] transition-transform duration-300 ease-in-out',
                  accountPanel === 'theme' ? '-translate-x-1/2' : 'translate-x-0'
                )}
              >
                <div className="w-1/2 shrink-0">
                  <div className="border-b border-border/70 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-xs font-bold text-primary">
                        {user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-popover-foreground">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge
                            variant="outline"
                            className="border-primary/30 bg-primary/10 text-primary"
                          >
                            {user.role === 'admin' ? 'Gestor' : 'Vendedor'}
                          </Badge>
                          {user.is_super_admin && <Badge variant="secondary">Super admin</Badge>}
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 truncate text-xs text-muted-foreground">
                      {currentOrg?.name ?? 'Sem organização selecionada'}
                    </p>
                  </div>
                  {canSwitchOrg && (
                    <div className="border-b border-border/70 px-2 py-2">
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Trocar organização
                      </p>
                      <div className="space-y-1">
                        {organizations.map(org => (
                          <Button
                            key={org.id}
                            type="button"
                            variant={org.slug === currentOrg?.slug ? 'secondary' : 'ghost'}
                            className="h-auto w-full justify-start px-2 py-2 text-left"
                            onClick={() => handleSwitchOrg(org)}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium">{org.name}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {org.role === 'admin' ? 'Administrador' : 'Membro'}
                              </span>
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => setAccountPanel('theme')}
                    >
                      <Palette className="size-4" />
                      Tema
                      <ThemeIcon className="ml-auto size-4 text-muted-foreground" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        setAccountOpen(false);
                        setAccountPanel('main');
                        navigate(`${orgBase}/settings`);
                      }}
                    >
                      <Settings className="size-4" />
                      Configurações
                    </Button>
                    {user.is_super_admin && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setAccountOpen(false);
                          setAccountPanel('main');
                          navigate(`${orgBase}/admin`);
                        }}
                      >
                        <Shield className="size-4" />
                        Admin global
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => logout().then(() => navigate('/login'))}
                    >
                      <LogOut className="size-4" />
                      Sair
                    </Button>
                  </div>
                </div>

                <div className="w-1/2 shrink-0">
                  <div className="flex items-center gap-2 border-b border-border/70 px-2 py-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setAccountPanel('main')}
                      aria-label="Voltar"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <div>
                      <p className="text-sm font-semibold text-popover-foreground">Tema</p>
                      <p className="text-xs text-muted-foreground">
                        Escolha a aparência da interface
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 p-2">
                    {themeOptions.map(option => {
                      const Icon =
                        option.value === 'light' ? Sun : option.value === 'dark' ? Moon : Monitor;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          variant={themeMode === option.value ? 'secondary' : 'ghost'}
                          className="h-auto w-full justify-start px-2 py-2 text-left"
                          onClick={() => handleSetTheme(option.value)}
                        >
                          <Icon className="size-4" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">
                              {option.label}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {option.description}
                            </span>
                          </span>
                          {themeMode === option.value && <Check className="size-4 text-primary" />}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {notificationsOpen && (
            <Card className="absolute right-2 top-[calc(100%+8px)] z-50 max-h-[480px] w-[min(380px,calc(100vw-2rem))] overflow-hidden border-border/80 bg-popover/95 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-popover-foreground">Notificações</p>
                  <p className="text-xs text-muted-foreground">Follow-ups e atividades pendentes</p>
                </div>
                <Badge variant="outline">{badgeCount}</Badge>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-2">
                {!notifData?.items?.length ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma notificação pendente
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notifData.items.map(item => {
                      const state = notificationState[item.state];
                      const dueLabel = formatNotificationDate(item.due_at ?? item.date_deadline);
                      const reminderLabel = formatReminderOffset(item.offset_minutes);
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border/70 bg-card/80 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {item.summary}
                              </p>
                              <button
                                type="button"
                                className="mt-0.5 text-left text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                                onClick={() => {
                                  setNotificationsOpen(false);
                                  navigate(`${orgBase}/leads/${item.lead_id}`);
                                }}
                              >
                                {item.lead_name}
                              </button>
                            </div>
                            <Badge variant={state.variant} size="sm">
                              {state.label}
                            </Badge>
                          </div>
                          {item.note && (
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                              {item.note}
                            </p>
                          )}
                          {(dueLabel || reminderLabel) && (
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {dueLabel && <p>Prazo: {dueLabel}</p>}
                              {reminderLabel && <p>Aviso: {reminderLabel}</p>}
                            </div>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 border-success/30 bg-success/10 text-success hover:bg-success/15 hover:text-success"
                              onClick={() => completeMutation.mutate(item.id)}
                            >
                              <Check className="size-3.5" />
                              Concluir
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7"
                              onClick={() => dismissMutation.mutate(item.id)}
                            >
                              <X className="size-3.5" />
                              Dispensar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </header>

      <aside
        className={cn(
          'fixed bottom-0 left-0 top-14 z-30 bg-card transition-[width] duration-300 ease-in-out',
          isExpanded ? 'w-[220px]' : 'w-14 lg:w-14'
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <nav className="flex flex-1 flex-col gap-0.5 px-2 pb-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'mb-2 h-10 w-full justify-start overflow-hidden rounded-lg p-0 text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                isExpanded ? 'pr-2.5' : 'pr-0'
              )}
              onClick={() => setSidebarExpanded(value => !value)}
              aria-label={isExpanded ? 'Recolher menu' : 'Expandir menu'}
            >
              <span className="flex size-10 shrink-0 items-center justify-center">
                <Menu className="size-4" />
              </span>
              <span
                className={cn(
                  'text-xs font-semibold tracking-[0.16em] transition-all',
                  isExpanded ? 'max-w-32 opacity-100' : 'max-w-0 opacity-0'
                )}
              >
                MENU
              </span>
            </Button>

            {mainItems.map(item => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={`${orgBase}/${item.to}`}>
                  {({ isActive }) => (
                    <span
                      className={cn(
                        'flex h-10 items-center overflow-hidden rounded-lg p-0 text-sm transition-colors',
                        isExpanded ? 'pr-2.5' : 'pr-0',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
                      )}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center">
                        <Icon className="size-4" />
                      </span>
                      <span
                        className={cn(
                          'whitespace-nowrap transition-all',
                          isExpanded ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'
                        )}
                      >
                        {item.label}
                      </span>
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      <main
        className={cn(
          'min-h-screen transition-[margin,width] duration-300 ease-in-out',
          isExpanded ? 'ml-[220px] w-[calc(100%_-_13.75rem)]' : 'ml-14 w-[calc(100%_-_3.5rem)]'
        )}
      >
        <div
          className={cn(
            'flex min-h-screen w-full flex-col bg-background',
            isPasswordChangeRoute ? 'pt-14' : 'px-4 py-20 sm:px-6 lg:px-10'
          )}
        >
          <div className="flex-1 bg-background">
            <Outlet />
          </div>
          {!isPasswordChangeRoute && (
            <footer className="mt-10 border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">© 2026 IgaraLead.</span>{' '}
              <span>Todos os direitos reservados.</span>
            </footer>
          )}
        </div>
      </main>
    </div>
  );
}
