import { useEffect, useState, useRef } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/store';
import { apiGet, apiPost, apiDelete } from '@/shared/api';
import Logo from '@/shared/ui/Logo';
import { BRAND_NAME, BRAND_URL, NEXUS_NAME, ENTITY_NAME, AMPLEX_NAME } from '@/shared/branding';
import { Check, X, Bell, Menu } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const mainItems: NavItem[] = [
  { to: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: 'pipeline', label: 'Pipeline', icon: 'pipeline' },
  { to: 'leads', label: 'Oportunidades', icon: 'leads' },
  { to: 'contacts', label: 'Contatos', icon: 'contacts' },
  { to: 'settings', label: 'Configurações', icon: 'settings' },
];

function NavIcon({
  name,
  size = 18,
  strokeWidth = 1.8,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
}) {
  const props = {
    width: size,
    height: size,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'dashboard':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'pipeline':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <rect x="2" y="3" width="5" height="18" rx="1" />
          <rect x="9.5" y="6" width="5" height="15" rx="1" />
          <rect x="17" y="9" width="5" height="12" rx="1" />
        </svg>
      );
    case 'leads':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case 'contacts':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    default:
      return null;
  }
}

const CURRENT_PLATFORM = 'amplex';

interface PlatformItem {
  key: string;
  name: string;
  url: string;
}

const STATIC_PLATFORMS: PlatformItem[] = [
  { key: 'entity', name: ENTITY_NAME, url: '' },
  { key: 'amplex', name: AMPLEX_NAME, url: '' },
  { key: 'nexus', name: NEXUS_NAME, url: '' },
];

export default function AppLayout() {
  const { user, loading, fetchUser, logout, currentOrg, setCurrentOrg } = useAuth();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [platformItems, setPlatformItems] = useState<PlatformItem[]>(STATIC_PLATFORMS);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const sidebarWidth = sidebarExpanded ? 260 : 60;

  useEffect(() => {
    if (!user || !slug) return;
    if (currentOrg?.slug === slug) return;
    const org = user.organizations?.find(o => o.slug === slug);
    if (org) {
      setCurrentOrg(org);
    } else {
      navigate('/orgs', { replace: true });
    }
  }, [user, slug, currentOrg?.slug, setCurrentOrg, navigate]);

  const orgBase = slug ? `/id/${slug}` : '';

  useEffect(() => {
    if (!currentOrg) return;
    apiGet('/crm/config')
      .then((raw: unknown) => {
        const data = raw as Record<string, string> | null;
        if (!data) return;
        const urls: Record<string, string> = {
          hub: data.hub_url || '',
          nexus: data.nexus_url || '',
          entity: data.entity_url || '',
          amplex: window.location.origin,
        };
        setPlatformItems(STATIC_PLATFORMS.map(p => ({ ...p, url: urls[p.key] || p.url })));
      })
      .catch(() => {});
  }, [currentOrg]);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  interface NotificationItem {
    id: number;
    summary: string;
    note: string;
    date_deadline: string | null;
    state: 'overdue' | 'today' | 'planned';
    activity_type: string;
    user_name: string;
    lead_id: number;
    lead_name: string;
  }

  const { data: notifData } = useQuery<{
    items: NotificationItem[];
    badge_count: number;
    overdue_count: number;
    today_count: number;
  }>({
    queryKey: ['notifications'],
    queryFn: () => apiGet('/crm/notifications'),
    refetchInterval: 60000,
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/crm/notifications/${id}/done`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/crm/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    if (notificationsOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notificationsOpen]);

  const badgeCount = notifData?.badge_count || 0;
  const visiblePlatforms = platformItems.filter(p => p.key === CURRENT_PLATFORM || Boolean(p.url));

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card bg-base-300">
          <div className="card-body">
            <p>Carregando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-base-100">
      <header className="fixed inset-x-0 top-0 z-40 h-[60px] border-b border-white/[0.05] bg-base-100/95 px-6 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Logo size={28} />
            </div>
            <div className="flex items-center gap-1">
              {visiblePlatforms.map(p => {
                const isCurrent = p.key === CURRENT_PLATFORM;
                const canNavigate = !isCurrent && !!p.url;
                return (
                  <a
                    key={p.key}
                    href={canNavigate ? p.url : undefined}
                    onClick={e => {
                      if (!canNavigate) e.preventDefault();
                    }}
                    className={[
                      'rounded-xl px-3 py-1.5 text-sm font-medium no-underline transition-colors',
                      isCurrent
                        ? 'border border-white/[0.12] bg-white/[0.1] text-base-content'
                        : 'text-base-content/45 hover:bg-white/[0.05] hover:text-base-content',
                      !canNavigate && !isCurrent && 'cursor-default opacity-40',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span>{p.name}</span>
                  </a>
                );
              })}
            </div>
          </div>

          <div className="relative flex items-center gap-2" ref={notifRef}>
            <span className="badge badge-info badge-sm shrink-0 text-[0.65rem]">
              {user.role === 'admin' ? 'Gestor' : 'Vendedor'}
            </span>
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="btn btn-ghost btn-sm relative h-8 min-h-0 rounded-lg border border-base-300 px-2 text-base-content/60 hover:text-base-content"
              title="Notificações"
            >
              <Bell size={16} strokeWidth={1.8} />
              {badgeCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-error px-0.5 text-[0.55rem] font-bold leading-none text-error-content">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </button>
            <div className="hidden text-right md:block">
              <p className="text-xs font-medium text-base-content/70">{user.name}</p>
              <p className="text-[11px] text-base-content/45">{currentOrg?.name || ''}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-[11px] font-bold text-primary">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => logout().then(() => navigate('/login'))}
            >
              Sair
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-[100] max-h-[480px] w-[min(380px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-base-300/80 bg-base-200/95 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-base-300/50 px-4 py-3">
                  <span className="text-sm font-semibold text-base-content">Notificações</span>
                  {notifData && notifData.overdue_count > 0 && (
                    <span className="text-xs font-semibold text-error">
                      {notifData.overdue_count} atrasada{notifData.overdue_count > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {!notifData || !notifData.items || notifData.items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-base-content/50">
                    Nenhuma notificação pendente
                  </div>
                ) : (
                  <div className="p-2">
                    {notifData.items.map(notif => {
                      const stateLabel =
                        notif.state === 'overdue'
                          ? 'Atrasada'
                          : notif.state === 'today'
                            ? 'Hoje'
                            : notif.date_deadline
                              ? new Date(notif.date_deadline + 'T12:00:00').toLocaleDateString(
                                  'pt-BR'
                                )
                              : '';
                      const badgeClass =
                        notif.state === 'overdue'
                          ? 'badge-error'
                          : notif.state === 'today'
                            ? 'badge-warning'
                            : 'badge-info';
                      return (
                        <div
                          key={notif.id}
                          className={[
                            'mb-1.5 rounded-lg border px-3 py-2.5',
                            notif.state === 'overdue'
                              ? 'border-error/20 bg-error/10'
                              : 'border-base-300/50 bg-base-100/30',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="mb-0.5 text-sm font-semibold text-base-content">
                                {notif.summary || 'Retorno agendado'}
                              </div>
                              <button
                                type="button"
                                className="text-left text-xs text-base-content/50 underline decoration-base-content/20 hover:text-primary"
                                onClick={() => {
                                  navigate(`${orgBase}/leads/${notif.lead_id}`);
                                  setNotificationsOpen(false);
                                }}
                              >
                                {notif.lead_name}
                              </button>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className={`badge badge-sm ${badgeClass}`}>{stateLabel}</span>
                                {notif.activity_type && (
                                  <span className="text-[0.65rem] text-base-content/45">
                                    {notif.activity_type}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <button
                                type="button"
                                title="Concluir"
                                onClick={() => completeMutation.mutate(notif.id)}
                                className="btn btn-ghost btn-xs h-7 min-h-0 rounded-md border border-success/30 bg-success/10 text-success"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                type="button"
                                title="Dispensar"
                                onClick={() => dismissMutation.mutate(notif.id)}
                                className="btn btn-ghost btn-xs h-7 min-h-0 rounded-md border border-base-300 text-base-content/50"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <aside
        className="fixed bottom-0 left-0 top-[60px] z-30 border-r border-white/[0.05] bg-base-200 transition-[width] duration-300 ease-in-out"
        style={{ width: sidebarWidth }}
      >
        <div className="flex h-full flex-col px-2 py-3">
          <button
            type="button"
            onClick={() => setSidebarExpanded(prev => !prev)}
            className="mb-2 flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 text-base-content/40 transition-colors hover:bg-white/[0.06] hover:text-base-content"
          >
            <Menu size={17} strokeWidth={1.8} className="shrink-0" />
            <span
              className={`overflow-hidden text-xs font-medium uppercase tracking-widest transition-[max-width,opacity] duration-200 ease-in-out ${
                sidebarExpanded ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              Menu
            </span>
          </button>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {mainItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                title={sidebarExpanded ? undefined : item.label}
                className={({ isActive }) =>
                  [
                    'flex w-full items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-base-content/55 hover:bg-white/[0.05] hover:text-base-content',
                  ].join(' ')
                }
              >
                <NavIcon
                  name={item.icon}
                  size={sidebarExpanded ? 18 : 22}
                  strokeWidth={sidebarExpanded ? 1.8 : 2}
                />
                <span
                  className={`flex-1 overflow-hidden text-left transition-[max-width,opacity] duration-200 ease-in-out ${
                    sidebarExpanded ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0'
                  }`}
                >
                  {item.label}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-2 border-t border-white/[0.05] px-2 py-3 text-[11px] text-base-content/35">
            <span
              className={`block overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ${
                sidebarExpanded ? 'max-w-[220px] opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              {currentOrg?.name || ''}
            </span>
          </div>
        </div>
      </aside>

      <main
        className="main-content mt-[60px] flex min-h-[calc(100vh-60px)] flex-1 flex-col overflow-y-auto animate-fade-in transition-[margin-left] duration-300 ease-in-out"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="border-t border-base-300/50 px-8 py-4 text-center text-xs text-base-content/35">
          © {new Date().getFullYear()}{' '}
          <a
            href={BRAND_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-base-content/55 no-underline hover:text-base-content"
          >
            {BRAND_NAME}
          </a>
          . Todos os direitos reservados.
        </footer>
      </main>
    </div>
  );
}
