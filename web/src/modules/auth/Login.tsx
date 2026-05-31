import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/shared/store';
import Logo from '@/shared/ui/Logo';

export default function Login() {
  const navigate = useNavigate();
  const { fetchUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const csrf = document.cookie.match(/(?:^|;\s*)amplex_csrf=([^;]*)/)?.[1] ?? '';
      const response = await fetch('/amplex/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Credenciais inválidas');
      await fetchUser();
      navigate('/orgs');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hero-gradient flex min-h-screen items-center justify-center px-4 pb-24 pt-6 text-foreground">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center">
          <Logo size={56} className="mx-auto text-primary" />
          <h1 className="brand-text mt-6 text-3xl font-semibold">Amplex</h1>
          <p className="mt-2 text-sm text-muted-foreground">O CRM da IgaraLead</p>
        </div>

        <Card className="mt-8 border-primary/20 bg-card/90 shadow-2xl backdrop-blur">
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <footer className="fixed inset-x-0 bottom-0 p-4 text-center text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">© 2026 IgaraLead.</span>{' '}
          <span>Todos os direitos reservados.</span>
        </footer>
      </div>
    </div>
  );
}
