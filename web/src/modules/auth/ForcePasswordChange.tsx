import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost } from '@/shared/api';
import { useAuth } from '@/shared/store';
import Logo from '@/shared/ui/Logo';

export default function ForcePasswordChange() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading, fetchUser, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/auth/change-password', {
        senha_atual: currentPassword,
        nova_senha: newPassword,
      });
      await fetchUser();
      navigate(`/id/${slug}/dashboard`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Carregando...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || !slug) return <Navigate to="/login" replace />;
  if (!user.force_password_change) return <Navigate to={`/id/${slug}/dashboard`} replace />;

  return (
    <div className="hero-gradient flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8 text-foreground">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center">
          <Logo size={56} className="mx-auto text-primary" />
          <h1 className="brand-text mt-6 text-3xl font-semibold">Defina uma nova senha</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua senha foi redefinida por um superadmin. Crie uma senha definitiva para continuar.
          </p>
        </div>

        <Card className="mt-8 border-primary/20 bg-card/90 shadow-2xl backdrop-blur">
          <CardHeader>
            <CardTitle>Troca obrigatória</CardTitle>
            <CardDescription>
              Use a senha temporária recebida e escolha uma nova senha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="temporary-password">Senha temporária</Label>
                <Input
                  id="temporary-password"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={event => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={saving}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button className="w-full" type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
              <Button
                className="w-full"
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => logout().then(() => navigate('/login', { replace: true }))}
              >
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
