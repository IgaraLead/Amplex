import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/store';
import Logo from '../../shared/ui/Logo';
import { BRAND_NAME, AMPLEX_NAME } from '../../shared/branding';

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
    <div className="min-h-screen flex items-center justify-center bg-base-100 p-4">
      <div className="card bg-base-300 w-full max-w-sm">
        <div className="card-body">
          <div className="text-center mb-6">
            <Logo size={56} className="mx-auto mb-4 text-base-content" />
            <h1 className="text-2xl font-bold mb-1">
              <span className="brand-name">{AMPLEX_NAME}</span>
            </h1>
            <p className="text-sm text-base-content/50">CRM Inteligente {BRAND_NAME}</p>
          </div>

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

          <p className="text-center mt-4 text-xs text-base-content/30">
            © {new Date().getFullYear()} {BRAND_NAME}
          </p>
        </div>
      </div>
    </div>
  );
}
