# Incident runbook — Amplex

1. **Health** — `GET /amplex/api/health`; se `database` falhar, verificar Postgres e credenciais.
2. **Auth** — 401 massivo: `SECRET_KEY_BASE` não pode mudar sem invalidar sessões; cookies `COOKIE_DOMAIN` / HTTPS em produção.
3. **Migrations** — falhas no deploy: logs do container na fase `migrate`; corrigir schema antes de repetir deploy.
