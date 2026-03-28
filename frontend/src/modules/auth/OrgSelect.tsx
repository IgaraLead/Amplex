import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/store';

export default function OrgSelect() {
  const { user, loading, fetchUser, setCurrentOrg } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && !loading) fetchUser();
  }, []);

  const orgs = user?.organizations ?? [];

  // Auto-select when user belongs to a single org
  useEffect(() => {
    if (orgs.length === 1) {
      setCurrentOrg(orgs[0]);
      navigate(`/o/${orgs[0].id}/dashboard`, { replace: true });
    }
  }, [orgs.length]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  if (orgs.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div className="glass" style={{ padding: '2rem 3rem', textAlign: 'center', maxWidth: 400 }}>
          <h2 style={{ color: '#fff', marginBottom: '0.5rem' }}>Sem organização</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
            Você ainda não pertence a nenhuma organização. Entre em contato com um administrador.
          </p>
        </div>
      </div>
    );
  }

  function handleSelect(org: (typeof orgs)[number]) {
    setCurrentOrg(org);
    navigate(`/o/${org.id}/dashboard`, { replace: true });
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="glass" style={{ padding: '2rem', width: '100%', maxWidth: 420 }}>
        <h2
          style={{
            color: '#fff',
            fontSize: '1.25rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
            textAlign: 'center',
          }}
        >
          Selecionar organização
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {orgs.map(org => (
            <button
              key={org.id}
              onClick={() => handleSelect(org)}
              className="btn"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 1.25rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(45,56,71,0.5)',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0,112,255,0.1)';
                e.currentTarget.style.borderColor = 'rgba(0,112,255,0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = 'rgba(45,56,71,0.5)';
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ color: '#fff', fontWeight: 500, fontSize: '0.95rem' }}>
                  {org.name}
                </div>
                <div
                  style={{
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: '0.8rem',
                    marginTop: '0.15rem',
                  }}
                >
                  {org.role === 'admin' ? 'Administrador' : 'Membro'}
                </div>
              </div>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
