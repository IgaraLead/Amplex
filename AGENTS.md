# Amplex Development Guidelines

Amplex is the **CRM pipeline platform** — sales pipelines, deals, and lead lifecycle.

## Planejamento de produto

Roadmap MVP: `IgaraDocs/ECOSYSTEM.md`. Ecossistema diferido: `IgaraDocs/internal/deferred-ecosystem-hub-and-integrations.md`. Este ficheiro cobre execução técnica do Amplex.

## Tech Stack

- **Backend**: Django 5.1 + Gunicorn + PostgreSQL 16 (DB do produto no MVP) + Redis 7 + S3/MinIO
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
  - `hub_auth.py` — HS256 JWT token management (local signing via `SECRET_KEY`), `create_access_token`, `decode_access_token`, `validate_client_slug`
  - `auth_utils.py` — Cookie auth (`amplex_access`/`amplex_refresh`/`amplex_csrf`), `get_current_user()`, decorators: `@login_required`, `@org_required`, `@org_admin_required`, `@require_api_key`
  - `models.py` — 20 Django ORM models: Shared (managed=False: SharedOrganization, SharedUser, SharedMembership, SharedSubscription) + Amplex-owned (amplex_* prefix: AmplexOrganization, AmplexUser, AmplexOrgMember, Contact, Lead, Stage, Tag, Source, LostReason, Interaction, InteractionFile, Activity, LeadAttachment, CustomField, CustomFieldValue)
  - `db_router.py` — `AmplexRouter` — blocks auth/contenttypes migration
  - `ecosystem.py` — Product URL derivation from `IGARALEAD_DOMAIN`
  - `middleware.py` — SecurityHeaders, BodyLimit, RateLimit, AmplexCsrf, RequestLogging
  - `storage.py` — S3/MinIO file operations (boto3)
  - `views/` — 22 view modules: `__init__` (health), `auth`, `leads`, `pipeline`, `dashboard`, `contacts`, `interactions`, `stages`, `custom_fields`, `tags`, `sources`, `lost_reasons`, `users`, `attachments`, `export`, `config`, `permissions`, `notifications`, `orgs`, `hub_users`, `integrations`, `s2s`
  - `urls.py` — RESTful URL routing with dispatch helpers
  - `routing.py` + `consumers.py` — WebSocket org channel (`/amplex/ws/org/<slug>/`); `realtime.py` — Redis group broadcast after CRM writes
- **Settings** (`amplex/`): Django project config — `settings.py`, `settings_test.py`, `urls.py`, `views.py` (SPA catch-all), `wsgi.py`, `asgi.py` (HTTP + WS via Channels)
- **Frontend** (`web/src/`): React 19 + Vite 8 + Tailwind 4 + DaisyUI 5 — path alias `@/` → `src/`
  - `app/` — `App.tsx` (shell), `routes.tsx` (rotas e lazy loading)
  - `modules/` — `auth/` (Login, OrgSelect), `dashboard/`, `pipeline/` (Kanban), `leads/` (list + detail), `contacts/`, `settings/`
  - `shared/` — `api.ts`, `store.ts` (Zustand), `queryClient.ts`, `useOrgRealtime.ts`, `branding.ts`, `layout/` (AppLayout), `ui/` (ErrorBoundary, Logo, ProductSwitcher, Toast)
- **Cache**: Redis 7 (KEY_PREFIX="amplex") for rate limiting; separate Redis DB for Channels (`REDIS_CHANNEL_URL` optional)
- **Static serving**: Production serves `static/` via Django/WhiteNoise (gunicorn ASGI + `UvicornWorker`, no nginx)

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
- Use function-based views (FBVs) as default — all Amplex views use FBVs with decorators (`@login_required`, `@org_required`, `@org_admin_required`, `@require_api_key`). Use CBVs only when a view genuinely benefits from inheritance.
- Leverage Django ORM for all database interactions; avoid raw SQL unless necessary for proven performance.
- Use Django's migration system for schema changes. Use Django's cache framework (Redis-backed) for rate limiting.
- FastAPI may be used only when async high-throughput is a proven requirement — never by preference.
- Use `JsonResponse` for API responses — no DRF serializers.
- All models must use the `amplex_*` table prefix. Hub shared tables use `managed=False`.
- Happy-path first — ship the minimal working solution, no unnecessary defensive programming.
- No over-engineering — don't create abstractions for one-time operations.
- Remove dead code — no backups, no commented-out alternatives, no unused imports.

## Code Style

- **Python**: Black (88 cols, double quotes) + Ruff (B, BLE, C4, DJ, E, F, I, N, PIE, RET, RUF, S, SIM, T20, TID, UP, W). KISS — minimal abstraction
- **React/TS**: ESLint flat config + Prettier, functional components, hooks only
- **Styling**: Tailwind CSS 4 + DaisyUI 5 (`igara` theme). Layout shell (`AppLayout`), modals e filtros usam classes utilitárias; `src/index.css` concentra tema Daisy, fontes, Kanban, tabelas e utilitários de página (`.page`, `.stat-grid`, …). Formulários longos (`LeadDetail`, `Settings`) podem usar cores hex explícitas alinhadas ao tema onde o estilo é dinâmico.
- **State**: TanStack Query for server state, Zustand for client state

## Conventions

- **Auth**: HS256 JWT cookies (`amplex_access`/`amplex_refresh`/`amplex_csrf`); MVP login em **`AmplexUser`**.
- **X-Api-Key**: integrações internas via `s2s.py` (métricas, oportunidades Nexus, import Entity) — contratos em IgaraDocs `internal/deferred-ecosystem-hub-and-integrations.md`
- **Health check**: `GET /amplex/api/health` — checks api, database
- **Database**: tabelas `amplex_*` no banco do produto (MVP standalone); shared DB fica para pós-MVP
- API endpoints: all under `/amplex/api/` prefix (dev proxy in Vite config)
- Frontend routes: `/login`, `/orgs`, `/id/:slug/{dashboard,pipeline,leads,contacts,settings}`
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
- **Authentication**: unauthenticated access rejection on all protected endpoints (pipeline, leads, contacts, dashboard, stages, tags, sources, settings)
- **CSRF protection**: token validation with `hmac.compare_digest`, safe method exemption, missing token rejection
- **Injection prevention**: SQL injection in URL parameters, XSS in request bodies, header injection (CRLF)
- **S2S API key auth**: metrics endpoint protection, wrong key rejection, timing-safe comparison
- **Request body limits**: oversized payload rejection (413)
- **Tenant isolation**: cross-org data visibility prevention, lead isolation between organizations

### Security Principles

- All endpoints must validate authentication before processing
- Tenant isolation: every org-scoped query must validate membership from JWT
- Hub JWT validation: malformed tokens must return 401, never 500 (see `hub_auth.py`)
- Use `hmac.compare_digest` for all secret comparisons (CSRF, API keys)
- Security headers must be present on ALL responses (middleware enforced)
- Error responses must not leak stack traces, internal paths, or config values
- Rate limiting must be active on auth endpoints (10 RPM) and globally (120 RPM)
