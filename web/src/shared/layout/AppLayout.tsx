import { useEffect, useState, useRef, type ReactNode } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/store';
import { apiGet, apiPost, apiDelete } from '@/shared/api';
import Logo from '@/shared/ui/Logo';
import {
  BRAND_NAME,
  BRAND_URL,
  HUB_NAME,
  NEXUS_NAME,
  ENTITY_NAME,
  AMPLEX_NAME,
} from '@/shared/branding';
import { Home, BarChart3, MessageSquare, Search, Check, X, Menu, Bell, LogOut } from 'lucide-react';

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

function NavIcon({ name }: { name: string }) {
  const props = {
    width: 18,
    height: 18,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
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

const TOP_PX = 40;
const SIDEBAR_COLLAPSED = 68;
const SIDEBAR_EXPANDED = 260;
const CURRENT_PLATFORM = 'amplex';

interface PlatformItem {
  key: string;
  name: string;
  url: string;
  icon: ReactNode;
}

const STATIC_PLATFORMS: PlatformItem[] = [
  { key: 'hub', name: HUB_NAME, url: '', icon: <Home size={14} /> },
  { key: 'entity', name: ENTITY_NAME, url: '', icon: <Search size={14} /> },
  { key: 'amplex', name: AMPLEX_NAME, url: '', icon: <BarChart3 size={14} /> },
  { key: 'nexus', name: NEXUS_NAME, url: '', icon: <MessageSquare size={14} /> },
];

export default function AppLayout() {
  const { user, loading, fetchUser, logout, currentOrg, setCurrentOrg } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams<{ slug: string }>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [platformItems, setPlatformItems] = useState<PlatformItem[]>(STATIC_PLATFORMS);

  const collapsed = !hovered;
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

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

  const [globalSearch, setGlobalSearch] = useState('');
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

  function handleGlobalSearch(e: React.FormEvent) {
    e.preventDefault();
    if (globalSearch.trim()) {
      navigate(`${orgBase}/leads?search=${encodeURIComponent(globalSearch.trim())}&page=1`);
      setGlobalSearch('');
    }
  }

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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

  function renderNavItem(item: NavItem) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          [
            'flex items-center rounded-[10px] text-sm transition-all duration-300 no-underline border',
            collapsed
              ? 'justify-center p-[0.65rem] gap-0'
              : 'justify-start px-[0.85rem] py-[0.65rem] gap-3',
            isActive
              ? 'bg-primary/10 border-primary/25 text-base-content font-semibold shadow-[0_0_15px_rgba(0,112,255,0.1),inset_0_1px_0_rgba(255,255,255,0.06)]'
              : 'border-transparent text-base-content/55 font-normal hover:bg-base-content/[0.05] hover:text-base-content',
          ].join(' ')
        }
      >
        <NavIcon name={item.icon} />
        {!collapsed && item.label}
      </NavLink>
    );
  }

  return (
    <div className="flex min-h-screen">
      <button
        type="button"
        className="mobile-menu-btn btn btn-square btn-ghost rounded-none border-r border-base-300 bg-base-200/95 text-base-content lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
      >
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      {/* Top bar */}
      <header className="top-bar fixed top-0 left-0 right-0 z-[60] flex h-10 items-center gap-1 border-b border-base-300/50 bg-base-200/95 px-4 backdrop-blur-xl">
        {platformItems.map(p => {
          const isCurrent = p.key === CURRENT_PLATFORM;
          const canNavigate = !isCurrent && !!p.url;
          return (
            <a
              key={p.key}
              href={isCurrent ? undefined : p.url || undefined}
              onClick={e => {
                if (isCurrent || !p.url) e.preventDefault();
              }}
              className={[
                'flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs no-underline transition-colors border',
                isCurrent
                  ? 'cursor-default border-primary/25 bg-primary/10 font-semibold text-base-content'
                  : 'border-transparent font-normal text-base-content/55',
                canNavigate &&
                  'hover:bg-base-content/[0.06] hover:text-base-content cursor-pointer',
                !canNavigate && !isCurrent && 'cursor-default opacity-40',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="flex items-center text-[0.85rem]">{p.icon}</span>
              <span>{p.name}</span>
            </a>
          );
        })}

        <div className="flex-1" />

        <form
          onSubmit={handleGlobalSearch}
          className="flex max-w-[400px] flex-1 gap-2 sm:flex-none"
        >
          <div className="relative min-w-0 flex-1 sm:w-60">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
              strokeWidth={2}
            />
            <input
              className="input input-sm h-8 w-full rounded-lg border-base-300 pl-9 text-xs"
              placeholder="Buscar oportunidades..."
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
            />
          </div>
        </form>

        <span className="badge badge-info badge-sm shrink-0 text-[0.65rem]">
          {user.role === 'admin' ? 'Gestor' : 'Vendedor'}
        </span>

        <div className="relative shrink-0" ref={notifRef}>
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
      </header>

      {/* Sidebar */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="fixed bottom-0 left-0 z-50 transition-[width] duration-200 ease-out"
        style={{ top: TOP_PX, width: sidebarWidth }}
      >
        <aside
          className={[
            'sidebar flex h-full flex-col gap-1 overflow-y-auto border-r border-base-300/50 bg-base-200/90 backdrop-blur-xl transition-[padding,box-shadow] duration-200',
            sidebarOpen ? 'open' : '',
            collapsed ? 'px-2 py-6 shadow-none' : 'px-4 py-6 shadow-[4px_0_20px_rgba(0,0,0,0.3)]',
          ].join(' ')}
        >
          <div
            className={[
              'mb-6 flex items-center justify-center',
              collapsed ? 'py-2' : 'px-2 py-2',
            ].join(' ')}
          >
            {!collapsed ? (
              <div className="flex min-w-0 items-center gap-2.5">
                <Logo size={36} className="shrink-0 text-base-content" />
                <div className="min-w-0">
                  <h2 className="text-[1.05rem] font-bold leading-tight">
                    <span className="brand-name">{AMPLEX_NAME}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-base-content/45">CRM Inteligente</p>
                </div>
              </div>
            ) : (
              <Logo size={28} className="text-base-content" />
            )}
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">{mainItems.map(renderNavItem)}</nav>

          <div className="mt-2 border-t border-base-300/50 pt-4">
            {!collapsed ? (
              <>
                <div className="mb-2 px-3 py-2">
                  <p className="text-sm font-medium text-base-content">{user.name}</p>
                  <p className="text-xs text-base-content/50">{user.email}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost w-full justify-center"
                  onClick={() => logout().then(() => navigate('/login'))}
                >
                  Sair
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-square w-full"
                title={user.name}
                onClick={() => logout().then(() => navigate('/login'))}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </aside>
      </div>

      <main
        className="main-content flex min-h-[calc(100vh-40px)] flex-1 flex-col overflow-y-auto"
        style={{ marginLeft: SIDEBAR_COLLAPSED, marginTop: TOP_PX }}
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
