# Incident runbook — integrações ecossistema

## 1. Falha Hub
- Sintomas: `/crm/integrations` sem dados de configuração.
- Ação imediata:
  - Confirmar conectividade `HUB_URL`.
  - Validar `HUB_API_KEY`.
  - Conferir logs por `request_id` e `status_code`.
- Mitigação:
  - Operar Amplex em modo degradado (sem ações cross-product).
  - Reprocessar sincronizações pendentes após restabelecimento.

## 2. Falha Nexus
- Sintomas: erro em `/crm/integrations/open-conversation`.
- Ação imediata:
  - Validar `NEXUS_URL` e `NEXUS_API_KEY`.
  - Checar status de `POST /igaralead/api/conversations/find_or_create`.
- Mitigação:
  - Continuar gestão de oportunidades no Amplex.
  - Exibir orientação de retry no frontend.

## 3. Falha Entity
- Sintomas: erro em `/crm/integrations/enrich-cnpj`.
- Ação imediata:
  - Validar `ENTITY_URL` e `ENTITY_API_KEY`.
  - Confirmar timeout/rede para endpoint de busca.
- Mitigação:
  - Manter fluxo comercial ativo sem enriquecimento.
  - Registrar falhas para retentativa manual/automática.

## 4. 5xx recorrente
- Critério: taxa de 5xx acima da linha de base por janela operacional.
- Ação imediata:
  - Correlacionar por `request_id`, `client_slug`, `path`.
  - Isolar endpoint afetado e ativar rollback, se necessário.
- Pós-incidente:
  - Registrar causa raiz.
  - Adicionar teste de regressão cobrindo o cenário.
