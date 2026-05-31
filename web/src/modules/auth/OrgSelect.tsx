import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getLastOrgSlug, useAuth } from '@/shared/store';

export default function OrgSelect() {
  const { user, loading, fetchUser, setCurrentOrg } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) fetchUser();
  }, [user, fetchUser]);

  const orgs = useMemo(() => user?.organizations ?? [], [user?.organizations]);

  useEffect(() => {
    if (orgs.length === 0) return;
    const lastOrg = orgs.find(org => org.slug === getLastOrgSlug());
    const selectedOrg = lastOrg ?? (orgs.length === 1 ? orgs[0] : null);
    if (selectedOrg) {
      setCurrentOrg(selectedOrg);
      navigate(
        `/id/${selectedOrg.slug}/${user?.force_password_change ? 'password/change' : 'dashboard'}`,
        {
          replace: true,
        }
      );
    }
  }, [orgs, user?.force_password_change, setCurrentOrg, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  if (orgs.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Sem organização</CardTitle>
            <CardDescription>
              Você ainda não pertence a nenhuma organização. Entre em contato com um administrador.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSelect = (org: (typeof orgs)[number]) => {
    setCurrentOrg(org);
    navigate(`/id/${org.slug}/${user?.force_password_change ? 'password/change' : 'dashboard'}`, {
      replace: true,
    });
  };

  return (
    <div className="hero-gradient flex min-h-screen items-center justify-center p-4 text-foreground">
      <Card className="w-full max-w-md bg-card/90 shadow-2xl backdrop-blur">
        <CardHeader>
          <CardTitle>Selecionar organização</CardTitle>
          <CardDescription>Escolha o workspace comercial que deseja acessar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {orgs.map(org => (
            <Button
              key={org.id}
              type="button"
              variant="outline"
              className="h-auto w-full justify-between p-4"
              onClick={() => handleSelect(org)}
            >
              <span className="text-left">
                <span className="block font-medium">{org.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {org.role === 'admin' ? 'Administrador' : 'Membro'}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
