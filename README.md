# Amplex

CRM do ecossistema IgaraLead. Operacionaliza pipeline de vendas, oportunidades, contatos e rotina comercial.

## Stack

- **Backend:** Django 5.1 + Gunicorn + PostgreSQL 16 + Redis 7
- **Frontend:** React 18 + Vite 5 + TypeScript 5.3 + DaisyUI 4
- **Storage:** S3/MinIO (boto3)

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
pip install -r requirements.txt
python manage.py runserver

# Frontend
cd frontend
npm install
npm run dev
```

## Licença

Proprietário — IgaraLead.
