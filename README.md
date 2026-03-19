# Amplex

CRM do ecossistema IgaraLead. Operacionaliza pipeline de vendas, oportunidades, contatos e rotina comercial.

## Stack

- **Backend:** Python + FastAPI
- **Frontend:** React + Vite + TypeScript
- **Database:** PostgreSQL
- **State:** TanStack Query + Zustand

## Funcionalidades

- Pipeline Kanban com drag-and-drop
- Gestão de leads e oportunidades
- Contatos com sincronização ao Hub
- Timeline de interações (chamadas, emails, notas, WhatsApp, reuniões)
- Campos personalizados por lead
- Dashboard com KPIs e tendências
- Exportação Excel/PDF
- Activities e follow-ups
- Permissões por papel (RBAC)
- Autenticação via IgaraHub (OAuth2)

## Desenvolvimento

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Licença

Proprietário — IgaraLead.
