# Release checklist — Amplex (standalone MVP)

- [ ] `pytest tests/ -q` sem falhas
- [ ] `cd web && npm run build` sem falhas
- [ ] `black --check api/ amplex/` e `ruff check api/ amplex/ --config ruff.toml`
- [ ] Smoke com Docker (`docker compose`) — `GET /amplex/api/health` estável
- [ ] Variáveis em `.env`: `ENVIRONMENT`, `SECRET_KEY_BASE`, Postgres, Redis, MinIO, `FRONTEND_URL`, seed de development `AMPLEX_ADMIN_*` / `AMPLEX_DEFAULT_ORG_*`
- [ ] Rollback: imagem anterior disponível e procedimento ensaiado
