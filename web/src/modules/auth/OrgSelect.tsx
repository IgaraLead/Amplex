import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/store';

export default function OrgSelect() {
  const { user, loading, fetchUser, setCurrentOrg } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) fetchUser();
  }, [user, fetchUser]);

  const orgs = useMemo(() => user?.organizations ?? [], [user?.organizations]);

  // Auto-select when user belongs to a single org
  useEffect(() => {
    if (orgs.length === 1) {
      setCurrentOrg(orgs[0]);
      navigate(`/id/${orgs[0].slug}/dashboard`, { replace: true });
    }
  }, [orgs, setCurrentOrg, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-base-content/50">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  if (orgs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card bg-base-300 max-w-sm w-full">
          <div className="card-body text-center">
            <h2 className="text-lg font-semibold mb-2">Sem organização</h2>
            <p className="text-sm text-base-content/50">
              Você ainda não pertence a nenhuma organização. Entre em contato com um administrador.
            </p>
          </div>
        </div>
      </div>
    );
  }

  function handleSelect(org: (typeof orgs)[number]) {
    setCurrentOrg(org);
    navigate(`/id/${org.slug}/dashboard`, { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card bg-base-300 w-full max-w-sm">
        <div className="card-body">
          <h2 className="text-xl font-semibold mb-4 text-center">Selecionar organização</h2>
          <div className="flex flex-col gap-3">
            {orgs.map(org => (
              <button
                key={org.id}
                onClick={() => handleSelect(org)}
                className="btn btn-ghost w-full flex justify-between items-center"
              >
                <div className="text-left">
                  <div className="font-medium">{org.name}</div>
                  <div className="text-xs text-base-content/50 mt-0.5">
                    {org.role === 'admin' ? 'Administrador' : 'Membro'}
                  </div>
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-base-content/40"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
