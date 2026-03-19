# Amplex — Ecossistema IgaraLead

## Papel

O Amplex é o **CRM do ecossistema**, construído sobre Odoo com customização CRM-only. Operacionaliza pipeline, oportunidades e rotina comercial.

## Referências

- [ECOSYSTEM_SDD.md](../Nexus/ECOSYSTEM_SDD.md) — Documento de design do ecossistema
- [DATA_OWNERSHIP_MATRIX.md](../Hub/DATA_OWNERSHIP_MATRIX.md) — Matriz de ownership de dados
- [INTEGRATION_CONTRACTS.md](../Hub/INTEGRATION_CONTRACTS.md) — Contratos de API entre produtos

## Domínio de dados (owner)

- Leads e oportunidades (CRM pipeline)
- Estágios do pipeline
- Equipes de vendas
- Receita esperada e ponderada

## Dados consumidos do Hub

- OAuth2 para login (IgaraHub provider)
- Settings e limites (`user_limit`)
- Verificação de assinatura ativa

## Dados sincronizados com Hub

- Contatos (bidirecional via `x_hub_id`)

## Stack

- Backend: Odoo (Python)
- Frontend: Odoo Web + React (separado)
- Database: PostgreSQL
- Deploy: Docker Compose

## Módulos IgaraLead

| Módulo | Propósito |
|--------|-----------|
| `amplex_hub` | OAuth, contact sync, subscription, metrics, integration API |
| `amplex_theme` | Branding IgaraLead (cores, logo, tipografia) |

## Endpoints de observabilidade

| Endpoint | Auth | Descrição |
|----------|------|-----------|
| `GET /amplex/health` | Nenhuma | Health check com DB |
| `GET /amplex/metrics` | X-Api-Key | Métricas para o Hub |

## Integração cross-product

| Endpoint | Consumido por | Descrição |
|----------|---------------|-----------|
| `POST /amplex/api/opportunities` | Nexus | Criar oportunidade a partir de conversa |
| `GET /amplex/api/opportunities/{id}` | Nexus | Consultar oportunidade |
| `PUT /amplex/api/opportunities/{id}/stage` | Nexus | Atualizar estágio |
| `GET /amplex/api/contacts/search` | Nexus, Entity | Buscar contatos |
| `POST /amplex/api/contacts/import` | Entity | Importar contatos enriquecidos |

## Política de API

**Sem APIs abertas.** O Amplex não expõe endpoints para consumo externo ou por terceiros. Os endpoints de integração (`/amplex/api/*`) são de uso exclusivamente interno entre as plataformas do ecossistema, protegidos por `X-Api-Key`. Clientes acessam o Amplex apenas via interface web.

## Notas de operação

- Login por senha bloqueado quando IgaraHub OAuth está ativo
- Limite de usuários enforced via Hub settings cache
- Assinatura verificada a cada login OAuth
