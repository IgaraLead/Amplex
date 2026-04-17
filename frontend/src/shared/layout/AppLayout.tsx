import { useEffect, useState, useRef, type ReactNode } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store';
import { apiGet, apiPost, apiDelete } from '../api';
import Logo from '../ui/Logo';
import { BRAND_NAME, BRAND_URL, HUB_NAME, NEXUS_NAME, ENTITY_NAME, AMPLEX_NAME } from '../branding';
import { Home, BarChart3, MessageSquare, Search, Check, X, Menu } from 'lucide-react';

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
    fill: 'none',
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

const TOP_BAR_HEIGHT = 40;
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

  // Resolve org context from URL param
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

  // Fetch platform URLs from Amplex config
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
        className="sidebar-nav-btn"
        title={collapsed ? item.label : undefined}
        style={({ isActive }) => ({
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : '0.75rem',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '0.65rem' : '0.65rem 0.85rem',
          borderRadius: '10px',
          textDecoration: 'none',
          color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
          fontSize: '0.875rem',
          fontWeight: isActive ? 600 : 400,
          transition: 'all 0.3s ease',
          position: 'relative',
          overflow: 'hidden',
          background: isActive ? 'rgba(0,112,255,0.12)' : 'transparent',
          border: isActive ? '1px solid rgba(0,112,255,0.25)' : '1px solid transparent',
          boxShadow: isActive
            ? '0 0 15px rgba(0,112,255,0.1), inset 0 1px 0 rgba(255,255,255,0.06)'
            : 'none',
        })}
      >
        <NavIcon name={item.icon} />
        {!collapsed && item.label}
      </NavLink>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Universal Top Bar */}
      <div
        className="top-bar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: TOP_BAR_HEIGHT,
          background: 'rgba(14,17,28,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(45,56,71,0.3)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          zIndex: 60,
          gap: '0.25rem',
        }}
      >
        {platformItems.map(p => {
          const isCurrent = p.key === CURRENT_PLATFORM;
          return (
            <a
              key={p.key}
              href={isCurrent ? undefined : p.url || undefined}
              onClick={e => {
                if (isCurrent || !p.url) e.preventDefault();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.3rem 0.75rem',
                borderRadius: '8px',
                textDecoration: 'none',
                background: isCurrent ? 'rgba(0,112,255,0.12)' : 'transparent',
                border: isCurrent ? '1px solid rgba(0,112,255,0.25)' : '1px solid transparent',
                color: isCurrent ? '#fff' : 'rgba(255,255,255,0.55)',
                fontSize: '0.8rem',
                fontWeight: isCurrent ? 600 : 400,
                transition: 'all 0.2s',
                cursor: isCurrent ? 'default' : p.url ? 'pointer' : 'default',
                opacity: p.url || isCurrent ? 1 : 0.4,
              }}
              onMouseEnter={e => {
                if (!isCurrent && p.url) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = '#fff';
                }
              }}
              onMouseLeave={e => {
                if (!isCurrent) {
                  e.currentTarget.style.background = isCurrent
                    ? 'rgba(0,112,255,0.12)'
                    : 'transparent';
                  e.currentTarget.style.color = isCurrent ? '#fff' : 'rgba(255,255,255,0.55)';
                }
              }}
            >
              <span style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
                {p.icon}
              </span>
              <span>{p.name}</span>
            </a>
          );
        })}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Global Search + Notifications (Amplex-specific) */}
        <form
          onSubmit={handleGlobalSearch}
          style={{ maxWidth: 400, display: 'flex', gap: '0.5rem' }}
        >
          <div style={{ position: 'relative' }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="input"
              placeholder="Buscar oportunidades..."
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              style={{
                paddingLeft: '2.25rem',
                height: '30px',
                fontSize: '0.8rem',
                width: '240px',
                minWidth: '120px',
                flex: '1',
              }}
            />
          </div>
        </form>

        <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>
          {user.role === 'admin' ? 'Gestor' : 'Vendedor'}
        </span>

        {/* Notifications Bell */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            style={{
              position: 'relative',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.3rem 0.45rem',
              cursor: 'pointer',
              color: badgeCount > 0 ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
            title="Notificações"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {badgeCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: 'var(--danger)',
                  color: '#fff',
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 380,
                maxWidth: 'calc(100vw - 2rem)',
                maxHeight: 480,
                overflowY: 'auto',
                background: 'rgba(14, 17, 28, 0.97)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(45,56,71,0.5)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                zIndex: 100,
              }}
            >
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderBottom: '1px solid rgba(45,56,71,0.4)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                  Notificações
                </span>
                {notifData && notifData.overdue_count > 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--danger)', fontWeight: 600 }}>
                    {notifData.overdue_count} atrasada{notifData.overdue_count > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {!notifData || !notifData.items || notifData.items.length === 0 ? (
                <div
                  style={{
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                  }}
                >
                  Nenhuma notificação pendente
                </div>
              ) : (
                <div style={{ padding: '0.5rem' }}>
                  {notifData.items.map(notif => {
                    const stateColor =
                      notif.state === 'overdue'
                        ? 'var(--danger)'
                        : notif.state === 'today'
                          ? 'var(--warning)'
                          : 'var(--info)';
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
                    return (
                      <div
                        key={notif.id}
                        style={{
                          padding: '0.65rem 0.75rem',
                          borderRadius: '8px',
                          marginBottom: '0.35rem',
                          background:
                            notif.state === 'overdue'
                              ? 'rgba(255,59,48,0.08)'
                              : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${notif.state === 'overdue' ? 'rgba(255,59,48,0.2)' : 'rgba(45,56,71,0.3)'}`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '0.5rem',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: '#fff',
                                marginBottom: '0.15rem',
                              }}
                            >
                              {notif.summary || 'Retorno agendado'}
                            </div>
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                textDecorationColor: 'rgba(255,255,255,0.2)',
                              }}
                              onClick={() => {
                                navigate(`${orgBase}/leads/${notif.lead_id}`);
                                setNotificationsOpen(false);
                              }}
                            >
                              {notif.lead_name}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.5rem',
                                alignItems: 'center',
                                marginTop: '0.3rem',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '4px',
                                  background: `${stateColor}20`,
                                  color: stateColor,
                                  fontWeight: 600,
                                }}
                              >
                                {stateLabel}
                              </span>
                              {notif.activity_type && (
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                  {notif.activity_type}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                            <button
                              title="Concluir"
                              onClick={() => completeMutation.mutate(notif.id)}
                              style={{
                                background: 'rgba(52,199,89,0.1)',
                                border: '1px solid rgba(52,199,89,0.3)',
                                borderRadius: '6px',
                                padding: '0.25rem 0.4rem',
                                cursor: 'pointer',
                                color: 'var(--success)',
                                fontSize: '0.75rem',
                              }}
                            >
                              <Check size={13} />
                            </button>
                            <button
                              title="Dispensar"
                              onClick={() => dismissMutation.mutate(notif.id)}
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(45,56,71,0.4)',
                                borderRadius: '6px',
                                padding: '0.25rem 0.4rem',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                fontSize: '0.75rem',
                              }}
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

      {/* Sidebar – collapsed by default, expands on hover */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'fixed',
          top: TOP_BAR_HEIGHT,
          left: 0,
          bottom: 0,
          width: sidebarWidth,
          zIndex: 50,
          transition: 'width 0.25s ease',
        }}
      >
        <aside
          className={`sidebar ${sidebarOpen ? 'open' : ''}`}
          style={{
            width: '100%',
            height: '100%',
            padding: collapsed ? '1.5rem 0.5rem' : '1.5rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            borderRadius: 0,
            borderRight: '1px solid rgba(45,56,71,0.3)',
            background: 'rgba(14,17,28,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            overflowY: 'auto',
            transition: 'padding 0.25s ease',
            boxShadow: !collapsed ? '4px 0 20px rgba(0,0,0,0.3)' : 'none',
          }}
        >
          <div
            style={{
              padding: collapsed ? '0.5rem 0' : '0.5rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!collapsed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                <Logo size={36} style={{ flexShrink: 0, color: '#fff' }} />
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.2 }}>
                    <span className="brand-name">{AMPLEX_NAME}</span>
                  </h2>
                  <p
                    style={{
                      color: 'rgba(255,255,255,0.45)',
                      fontSize: '0.75rem',
                      marginTop: '0.15rem',
                    }}
                  >
                    CRM Inteligente
                  </p>
                </div>
              </div>
            ) : (
              <Logo size={28} style={{ color: '#fff' }} />
            )}
          </div>

          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {mainItems.map(renderNavItem)}
          </nav>

          <div
            style={{
              borderTop: '1px solid rgba(45,56,71,0.5)',
              paddingTop: '1rem',
              marginTop: '0.5rem',
            }}
          >
            {!collapsed ? (
              <>
                <div style={{ padding: '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
                  <p style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>
                    {user.name}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                    {user.email}
                  </p>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => logout().then(() => navigate('/login'))}
                >
                  Sair
                </button>
              </>
            ) : (
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'center', padding: '0.5rem' }}
                title={user.name}
                onClick={() => logout().then(() => navigate('/login'))}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Main content – fixed offset by collapsed sidebar width */}
      <main
        className="main-content"
        style={{
          flex: 1,
          marginLeft: SIDEBAR_COLLAPSED,
          marginTop: TOP_BAR_HEIGHT,
          minHeight: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
        <footer
          style={{
            padding: '1rem 2rem',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.35)',
            fontSize: '0.75rem',
            borderTop: '1px solid rgba(45,56,71,0.3)',
          }}
        >
          © {new Date().getFullYear()}{' '}
          <a
            href={BRAND_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontWeight: 500 }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
          >
            {BRAND_NAME}
          </a>
          . Todos os direitos reservados.
        </footer>
      </main>
    </div>
  );
}
