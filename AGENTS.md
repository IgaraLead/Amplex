# Amplex Development Guidelines

Amplex is the **CRM pipeline platform** — sales pipelines, deals, and lead lifecycle.

## Planejamento de produto

Prioridades de produto (MVP IgaraLead): `IgaraDocs/ECOSYSTEM.md`. Este repositório é **CRM standalone** — sem Hub, shared DB nem integrações obrigatórias com outros produtos.

## Tech Stack

- **Backend**: Django 5.1 + Gunicorn + PostgreSQL 16 (BD dedicada `amplex` ou nome configurável) + Redis 7 + S3/MinIO
- **Frontend**: React 19 + Vite 8 + TypeScript 5.3 (strict) + TanStack Query 5 + Zustand 5 + Tailwind CSS 4 + DaisyUI 5 (`igara` theme)
- **Storage**: S3 (boto3) for exports and attachments
- **Formatting/Lint**: Black (88 cols) + Ruff (py312) + ESLint 9 flat config + Prettier
- **Deployment**: Single full-stack Docker image (`ghcr.io/igaralead/amplex:latest`, port 8002), Python 3.12-slim + node:20-alpine build stage

## Build / Test / Lint

```bash
# Backend (run from repo root)
python manage.py runserver                       # Dev server
black --check api/ amplex/                       # Format check
ruff check api/ amplex/ --config ruff.toml       # Lint
python -m pytest tests/ --tb=short -v            # Tests

# Frontend
cd web
npm install && npm run dev                       # Dev server (port 3003)
npx eslint .                                     # Lint
npx tsc --noEmit                                 # Typecheck
```

## Architecture

- **Backend** (`api/`): Django app
  - `tokens.py` — JWT HS256 (`iss`/`aud` `amplex`): `create_access_token`, `decode_access_token`, refresh helpers
  - `auth_utils.py` — Cookies (`amplex_access` / `amplex_refresh` / `amplex_csrf`), `get_current_user()`, `@login_required`, `@org_required`, `@org_admin_required`
  - `models.py` — Modelos `amplex_*`: organização, utilizadores locais (`password_hash`), memberships, CRM (Contact, Lead, Stage, …)
  - `db_router.py` — não migra `auth`/`contenttypes` Django (utilitário apenas)
  - `middleware.py` — SecurityHeaders, BodyLimit, RateLimit, AmplexCsrf, RequestLogging
  - `storage.py` — S3/MinIO (boto3)
  - `management/commands/amplex_bootstrap.py` — opcional: admin + org inicial via env (`AMPLEX_ADMIN_*`, `AMPLEX_DEFAULT_ORG_*`)
  - `views/` — auth, health, CRM, orgs, permissions, export, integrations (stubs MVP), etc.
  - `urls.py` — Rotas sob `/amplex/api/`
- **Settings** (`amplex/`): `settings.py`, `settings_test.py`, `urls.py`, `views.py` (SPA), `wsgi.py`
- **Frontend** (`web/src/`): React + Vite + Tailwind + DaisyUI — alias `@/` → `src/`
  - Rotas: `/login`, `/orgs`, `/id/:slug/{dashboard,pipeline,leads,contacts,settings}`
  - `shared/api.ts` — prefixo org `/id/{slug}/crm/...` e `/org/...`
- **Cache**: Redis (rate limit)
- **Estático**: WhiteNoise + build Vite em `static/`

## Middleware Stack

1. CORS — configurable origins (django-cors-headers)
2. Security headers — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS (prod)
3. CSRF — token validation via cookie (`amplex_csrf`)
4. Request body limit — 2 MB default
5. Rate limiting — 120 RPM global, 10 RPM auth (cache-backed)
6. Request logging — structured JSON

## Django / Python Principles

- Write clear, technical code. Use Django's built-in features wherever possible.
- Prioritize readability and maintainability; follow PEP 8 (enforced by Black 88 cols + Ruff).
- Use descriptive variable and function names (lowercase with underscores).
- Use function-based views (FBVs) as default — decorators `@login_required`, `@org_required`, `@org_admin_required`.
- Leverage Django ORM for all database interactions; avoid raw SQL unless necessary for proven performance.
- Use Django's migration system for schema changes. Use Django's cache framework (Redis-backed) for rate limiting.
- FastAPI may be used only when async high-throughput is a proven requirement — never by preference.
- Use `JsonResponse` for API responses — no DRF serializers.
- Todas as tabelas de produto usam prefixo `amplex_*`.
- Happy-path first — ship the minimal working solution, no unnecessary defensive programming.
- No over-engineering — don't create abstractions for one-time operations.
- Remove dead code — no backups, no commented-out alternatives, no unused imports.

## Code Style

- **Python**: Black (88 cols, double quotes) + Ruff (B, BLE, C4, DJ, E, F, I, N, PIE, RET, RUF, S, SIM, T20, TID, UP, W). KISS — minimal abstraction
- **React/TS**: ESLint flat config + Prettier, functional components, hooks only
- **Styling**: Tailwind CSS 4 + DaisyUI 5 (`igara` theme). Layout shell (`AppLayout`), modals e filtros usam classes utilitárias; `src/index.css` concentra tema Daisy, fontes, Kanban, tabelas e utilitários de página (`.page`, `.stat-grid`, …). Formulários longos (`LeadDetail`, `Settings`) podem usar cores hex explícitas alinhadas ao tema onde o estilo é dinâmico.
- **State**: TanStack Query for server state, Zustand for client state

## Conventions

- **Auth**: Login em **`AmplexUser`** (hash Django); sessão JWT em cookies + CSRF em `amplex_csrf`. Papel global opcional: `is_super_admin`.
- **Health check**: `GET /amplex/api/health`
- **Database**: PostgreSQL dedicado ao Amplex (`POSTGRES_DATABASE`, default `amplex`). Não usar a mesma instância/tabelas que outros produtos.
- API endpoints: all under `/amplex/api/` prefix (dev proxy in Vite config)
- Frontend routes: `/login`, `/orgs`, `/admin`, `/id/:slug/{dashboard,pipeline,leads,contacts,settings}`
- **Tests**: pytest-django with `DJANGO_SETTINGS_MODULE=amplex.settings_test` (SQLite)

## Post-Change Verification (MANDATORY)

After ANY code modification, run the full verification pipeline before considering the task done. Do not skip steps.

### Backend Verification

```bash
# Format check
black --check api/ amplex/

# Lint
ruff check api/ amplex/ --config ruff.toml

# Security tests (MANDATORY — covers OWASP Top 10)
python -m pytest tests/test_auth_security.py --tb=short -v

# Full test suite
python -m pytest tests/ --tb=short -v
```

### Frontend Verification

```bash
cd web
npx eslint .                                     # Lint
npx tsc --noEmit                                 # Typecheck
```

### Security Test Coverage (`tests/test_auth_security.py`)

The security test suite covers:
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- **Health endpoint**: public access, no auth required, no data leakage
- **Authentication**: unauthenticated access rejection on protected CRM endpoints
- **CSRF protection**: token validation with `hmac.compare_digest`, safe method exemption, missing token rejection
- **Injection prevention**: SQL injection in URL parameters, XSS in request bodies, header injection (CRLF)
- **Request body limits**: oversized payload rejection (413)
- **Tenant isolation**: cross-org data visibility prevention, lead isolation between organizations

### Security Principles

- All endpoints must validate authentication before processing
- Tenant isolation: every org-scoped query must validate membership (`AmplexOrgMember`)
- JWT access tokens: malformed or invalid tokens must return **401**, never 500 (`tokens.decode_access_token`)
- Use `hmac.compare_digest` for CSRF validation
- Security headers must be present on ALL responses (middleware enforced)
- Error responses must not leak stack traces, internal paths, or config values
- Rate limiting must be active on auth endpoints (10 RPM) and globally (120 RPM)
