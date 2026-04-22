import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/shared/store';
import Logo from '@/shared/ui/Logo';
import { BRAND_NAME } from '@/shared/branding';

export default function Login() {
  const navigate = useNavigate();
  const { fetchUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/amplex/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Credenciais inválidas');
      }
      await fetchUser();
      navigate('/orgs');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pb-24 pt-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Logo size={56} className="mx-auto text-base-content" />
          <h1 className="mt-6 text-center">
            <span className="inline-block text-3xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">
              Amplex
            </span>
          </h1>
          <p className="mt-2 text-sm text-base-content/70">Acesse sua conta</p>
        </div>

        <div className="card mt-8 w-full border border-base-300 bg-base-200 shadow-xl">
          <div className="card-body p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <fieldset className="fieldset">
                <label className="label">E-mail</label>
                <input
                  className="input w-full"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  disabled={loading}
                />
              </fieldset>
              <fieldset className="fieldset">
                <label className="label">Senha</label>
                <input
                  className="input w-full"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                />
              </fieldset>

              {error && <p className="text-error text-xs text-center">{error}</p>}

              <button className="btn btn-primary w-full mt-2" type="submit" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>

        <footer className="fixed bottom-0 left-0 right-0 p-4 text-center text-base-content/50 text-xs">
          © {new Date().getFullYear()} {BRAND_NAME}. Todos os direitos reservados.
        </footer>
      </div>
    </div>
  );
}
