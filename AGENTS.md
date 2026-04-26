# Amplex Development Guidelines

Amplex is the **CRM pipeline platform** in the IgaraLead ecosystem. It manages sales pipelines, deals, and cross-product conversations through Nexus.

## Tech Stack

- **Backend**: Django 5.1 + Gunicorn + PostgreSQL 16 (unified `igaralead` DB) + Redis 7 + S3/MinIO
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
- **Settings** (`amplex/`): Django project config — `settings.py`, `settings_test.py`, `urls.py`, `views.py` (SPA catch-all), `wsgi.py`
- **Frontend** (`web/src/`): React 19 + Vite 8 + Tailwind 4 + DaisyUI 5 — path alias `@/` → `src/`
  - `app/` — `App.tsx` (shell), `routes.tsx` (rotas e lazy loading)
  - `modules/` — `auth/` (Login, OrgSelect), `dashboard/`, `pipeline/` (Kanban), `leads/` (list + detail), `contacts/`, `settings/`
  - `shared/` — `api.ts`, `store.ts` (Zustand), `branding.ts`, `layout/` (AppLayout), `ui/` (ErrorBoundary, Logo, ProductSwitcher, Toast)
- **Cache**: Redis 7 (KEY_PREFIX="amplex") for rate limiting
- **Static serving**: Production serves `static/` via Django/WhiteNoise (gunicorn, no nginx)

## Middleware Stack (same pattern as Hub)

1. CORS — configurable origins (django-cors-headers)
2. Security headers — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS (prod)
3. CSRF — token validation via cookie (`amplex_csrf`)
4. Request body limit — 2 MB default
5. Rate limiting — 120 RPM global, 10 RPM auth (cache-backed)
6. Request logging — structured JSON

## Ecosystem Alignment

Amplex is the CRM pipeline platform in the IgaraLead ecosystem. These principles govern all code:

1. **Hub owns organizations and users** — Amplex syncs from Hub via JWT, never creates orgs. Hub is the single source of truth for identity.
2. **Amplex owns leads, pipeline, and revenue data** — no other product manages sales pipeline. Contacts may be enriched by Entity or imported from Nexus, but lead lifecycle is Amplex-only.
3. **Tenant isolation via `client_slug`** — every protected route scoped to `/id/{slug}/` (maps to `client_slug` from JWT). Path validation required. See ECOSYSTEM.md isolation spec.
4. **No public APIs** — all inter-platform communication via `X-Api-Key` (Hub metrics, Nexus opportunities, Entity enrichment). User auth via JWT only.
5. **Data ownership** — Hub: users, orgs, subscriptions. Amplex: leads, stages, revenue, activities. Products integrate via well-defined contracts in ECOSYSTEM.md.
6. **Integration contracts** — Amplex provides: `POST /amplex/api/opportunities` (Nexus), `GET /amplex/api/opportunities/{id}` (Nexus), `PUT /amplex/api/opportunities/{id}/stage` (Nexus), `GET /amplex/api/contacts/search` (Nexus, Entity), `POST /amplex/api/contacts/import` (Entity), `GET /amplex/api/metrics` (Hub). Changes need contract review.
7. **When evaluating changes**: check ECOSYSTEM.md data ownership matrix, flag if touching shared tables, verify all tenant isolation, confirm no reinvention of Hub auth patterns.

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

- **Auth**: HS256 JWT cookies (`amplex_access`/`amplex_refresh`/`amplex_csrf`), direct login against Hub's shared PostgreSQL DB. Auto-provisions users via shared DB.
- **X-Api-Key**: for internal integrations via `s2s.py` (Hub metrics, Nexus opportunity integration, Entity contact import)
- **Health check**: `GET /amplex/api/health` — checks api, database
- **Unified database**: Single `igaralead` DB. Amplex tables use `amplex_*` prefix. Hub shared tables accessed via `managed=False` models
- API endpoints: all under `/amplex/api/` prefix (dev proxy in Vite config)
- Frontend routes: `/login`, `/orgs`, `/id/:slug/{dashboard,pipeline,leads,contacts,settings}`
- **Tests**: pytest-django with `DJANGO_SETTINGS_MODULE=amplex.settings_test` (SQLite)

## Ecosystem Integration

- **Hub**: shared DB for org/user/subscription data, metrics pull via `X-Api-Key`
- **Nexus**: `POST /id/{slug}/igaralead/api/conversations/find_or_create` and `POST /id/{slug}/igaralead/api/messages` for cross-product messaging
- **Entity**: enriched company data lookup for pipeline contacts
- **Hub → Amplex**: `GET /amplex/metrics` — metrics for Hub dashboard

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
