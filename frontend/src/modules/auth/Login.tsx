import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/store";
import Logo from "../../shared/ui/Logo";

const HUB_URL = import.meta.env.VITE_HUB_URL || "http://localhost:8001";

export default function Login() {
  const navigate = useNavigate();
  const { fetchUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/amplex/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Credenciais inválidas");
      }
      localStorage.setItem("hub_token", data.access_token);
      await fetchUser();
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  }

  function handleHubLogin() {
    window.location.href = `${HUB_URL}/oauth/authorize?` + new URLSearchParams({
      response_type: "code",
      client_id: "amplex",
      redirect_uri: `${window.location.origin}/auth_oauth/signin`,
      scope: "openid profile email",
      state: crypto.randomUUID(),
    });
  }

  function handleGoogleLogin() {
    const params = new URLSearchParams({
      redirect_uri: `${window.location.origin}/auth_oauth/signin`,
      client_id: "amplex",
      state: crypto.randomUUID(),
    });
    window.location.href = `${HUB_URL}/api/v1/auth/social/google?${params}`;
  }

  function handleFacebookLogin() {
    const params = new URLSearchParams({
      redirect_uri: `${window.location.origin}/auth_oauth/signin`,
      client_id: "amplex",
      state: crypto.randomUUID(),
    });
    window.location.href = `${HUB_URL}/api/v1/auth/social/facebook?${params}`;
  }

  const socialBtnStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
    width: "100%", padding: "0.65rem", borderRadius: "10px",
    fontSize: "0.8rem", fontWeight: 500, cursor: "pointer",
    border: "1px solid rgba(45,56,71,0.5)", transition: "all 0.2s",
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--background)", padding: "1rem",
    }}>
      <div className="glass" style={{ width: "100%", maxWidth: 400, padding: "2.5rem 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <Logo size={56} style={{ margin: "0 auto 1rem", color: "#fff" }} />
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            <span className="brand-name">Amplex</span>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            CRM Inteligente IgaraLead
          </p>
        </div>

        {/* Social login buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <button type="button" onClick={handleGoogleLogin}
            style={{ ...socialBtnStyle, background: "rgba(255,255,255,0.06)", color: "#e2e8f0" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar com Google
          </button>
          <button type="button" onClick={handleFacebookLogin}
            style={{ ...socialBtnStyle, background: "rgba(24,119,242,0.12)", color: "#e2e8f0" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(24,119,242,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(24,119,242,0.12)"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continuar com Facebook
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.25rem 0" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(45,56,71,0.5)" }} />
            <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>ou</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(45,56,71,0.5)" }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
              E-mail
            </label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              disabled={loading}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
              Senha
            </label>
            <input
              className="input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && (
            <p style={{ color: "var(--danger)", fontSize: "0.8rem", textAlign: "center" }}>{error}</p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", marginTop: "0.5rem" }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {/* Hub SSO link */}
        <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
          <button type="button" onClick={handleHubLogin}
            style={{ background: "none", border: "none", color: "var(--primary)", fontSize: "0.8rem", cursor: "pointer", fontWeight: 500 }}>
            Entrar via IgaraHub SSO
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.75rem", color: "var(--text-light)" }}>
          © {new Date().getFullYear()} IgaraLead
        </p>
      </div>
    </div>
  );
}
