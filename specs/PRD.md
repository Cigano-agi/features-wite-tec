# PRD — WiteTec Payment Platform

**Tipo:** Product Requirements Document  
**Versão:** 1.0  
**Status:** Em desenvolvimento  
**Última revisão:** 2026-04-17

---

## Resumo Executivo

WiteTec é uma plataforma de pagamentos brasileira — análoga ao Stripe ou Pagar.me — que permite a sellers processar transações PIX, gerenciar links de cobrança e operar múltiplas sub-contas (subcontas multi-seller).

A plataforma é composta por três camadas principais:

- **API NestJS** (Node.js): superfície HTTP, autenticação, idempotência, rate limiting
- **Serviço .NET Core**: motor de transações, state machine, domain contracts
- **Frontend React**: painel do seller e checkout público

O conjunto de epics descrito neste PRD representa a evolução da plataforma de um MVP funcional para um produto production-ready, com contratos de domínio padronizados, abstração de provedores de pagamento, webhooks assíncronos confiáveis, feature de billing links, suporte a múltiplos sellers por usuário e correção do dashboard.

---

## Declaração do Problema

O sistema atual apresenta os seguintes problemas estruturais:

| Problema | Impacto |
|----------|---------|
| Sem contratos de domínio padronizados no .NET | Cada serviço define seus próprios tipos — inconsistências e retrabalho |
| Acoplamento direto ao PSP único | Impossível trocar ou adicionar provedor sem reescrever lógica de negócio |
| Sem processamento assíncrono de webhooks PIX | Risco de perda de confirmações de pagamento em falhas de rede |
| Billing Links inexistentes | Sellers não conseguem criar links de pagamento avulsos ou reutilizáveis |
| Modelo 1:1 User↔Seller | Um usuário não pode operar múltiplos sellers — bloqueia grupos/operadores |
| Dashboard quebrado | Sellers não têm visibilidade sobre vendas e status de transações |

---

## Objetivos

1. **Padronizar contratos de domínio** em todos os serviços .NET (WIA-204)
2. **Habilitar suporte a múltiplos PSPs** via abstração — sem reescrever lógica de negócio (WIA-215)
3. **Garantir confirmação confiável de pagamentos PIX** via webhooks assíncronos e idempotentes (WIA-261)
4. **Entregar Billing Links** como produto de pagamento self-service para sellers (WIA-272)
5. **Suportar múltiplos sellers por usuário** para operadores e grupos (WIA-297)
6. **Restaurar visibilidade do dashboard** de vendas do seller (WIA-296)

---

## Usuários

| Perfil | Descrição | Principais ações |
|--------|-----------|-----------------|
| **Seller** | Empresa ou pessoa física que aceita pagamentos | Criar billing links, visualizar métricas, gerenciar API keys |
| **Pagador** | Cliente final do seller | Acessar checkout público, pagar via PIX |
| **Operador / Grupo** | Usuário com acesso a múltiplos sellers | Alternar entre contas, gerenciar configurações de cada seller |
| **Admin de plataforma** | Time WiteTec | Gerenciar acquirers, configurações globais, acesso a todos os sellers |

---

## Arquitetura do Sistema

```
Browser (React)
    │
    │  HTTPS
    ▼
NestJS API (Node.js)
    ├── Auth (JWT / Passport)
    ├── Rate Limiting (Redis)
    ├── Idempotency Guard (Redis SETNX)
    ├── CorrelationId Middleware
    └── PiiSanitizer
         │
         │  HTTP interno
         ▼
    .NET Core Service
         ├── Domain Contracts (WIA-204)
         ├── IPaymentProvider / ProviderFactory (WIA-215)
         ├── TransactionStatusMachine (WIA-261)
         └── CreateTransactionService
              │
              ├──► PSP via IPaymentProvider (PIX, cartão)
              │
              └──► PostgreSQL 15
                    ├── transactions
                    ├── billing_links
                    ├── webhook_payment_logs
                    └── seller_users (WIA-297)

SQS Queue ◄──── Webhook Endpoint (WIA-262)
    │
    ▼
SQS Worker (WIA-264)
    └──► TransactionStatusMachine → PostgreSQL

Redis 7
    ├── Idempotency keys (TTL 24h)
    ├── Rate limit counters (TTL 60s)
    └── Metrics cache (opcional, WIA-275)
```

---

## Requisitos de Feature por Epic

### WIA-204 — Domain Contracts

Criar biblioteca .NET `Wite.Core.Domain.Contracts` com contratos imutáveis para entidades (`TransactionContract`, `CustomerContract`, `ItemContract`), enums de domínio (`TransactionStatus`, `PaymentMethodType`) e contratos de infraestrutura (`IdempotencyContract`, `ApiResponseContract`, `ErrorResponseContract`).

Spec: [WIA-204-domain-contracts.md](./WIA-204-domain-contracts.md)

### WIA-215 — Provider Strategy

Implementar padrão Strategy para provedores de pagamento PIX. A interface `IPaymentProvider` desacopla o motor de transações de qualquer PSP específico. `ProviderFactory` resolve o provedor correto em runtime. Polly garante resiliência (retry + circuit breaker). Secrets nunca expostos em logs.

Spec: [WIA-215-payment-provider-strategy.md](./WIA-215-payment-provider-strategy.md)

### WIA-261 — PIX Webhook

Pipeline assíncrono para receber e processar confirmações de pagamento PIX. Endpoint recebe o webhook, persiste `WebhookPaymentLog` e enfileira no SQS antes de responder 202. Worker consome a fila, valida idempotência por `end2endId` e aciona `TransactionStatusMachine`. DLQ captura falhas após N retentativas.

Spec: [WIA-261-pix-webhook.md](./WIA-261-pix-webhook.md)

### WIA-272 — Billing Links

Feature completa de links de pagamento: CRUD autenticado para sellers, endpoint público de charge (sem auth), idempotência por `Idempotency-Key`, rate limiting por IP e IP+link, rastreabilidade via `billingLinkId` na transação, métricas no painel do seller.

Specs: [WIA-272-billing-links-epic.md](./WIA-272-billing-links-epic.md), [WIA-276](./WIA-276-billing-link-crud.md), [WIA-273](./WIA-273-public-charge-endpoint.md), [WIA-274](./WIA-274-security-rate-limiting.md), [WIA-275](./WIA-275-metrics-dashboard.md)

### WIA-297 — Multi-Seller

Evolução do modelo de auth: de 1:1 User↔Seller para N:N via tabela `seller_users`. JWT passa a carregar `sellerId` ativo e `sellerRole`. Endpoint `/auth/switch-seller` permite alternar contexto. `SellerContextGuard` e decorator `@SellerId()` padronizam extração de seller em todas as rotas. Todas as features existentes refatoradas para usar o novo modelo.

Spec: [WIA-297-multi-seller.md](./WIA-297-multi-seller.md)

### WIA-296 — Dashboard Bug

Investigar e corrigir a ausência de dados de vendas no dashboard do seller. Prováveis causas: query de métricas com escopo de sellerId errado (modelo legado) ou campos de agregação retornando zero (WIA-275 incompleto).

Spec: [WIA-296-dashboard-bug.md](./WIA-296-dashboard-bug.md)

---

## Requisitos Não-Funcionais

| Requisito | Regra |
|-----------|-------|
| **Idempotência** | Obrigatória em todos os endpoints que geram efeitos financeiros |
| **PII em logs** | `name`, `cpf`, `payerName`, `payerCpf`, `pan`, `cvv` nunca aparecem em logs |
| **Isolamento por seller** | Toda query com dados de seller deve filtrar por `sellerId` — sem exceções |
| **correlationId** | Presente em todas as requisições, propagado entre serviços e incluído em todos os logs |
| **LGPD** | Dados de clientes (CPF, nome) não persistidos em logs; acesso auditável por seller |
| **Resiliência** | Retry + circuit breaker em todas as chamadas a PSPs externos (Polly) |
| **Secrets** | Chaves de API de PSPs via Key Vault / Secrets Manager — nunca em variáveis de ambiente em texto puro em produção |

---

## Definition of Done por Epic

| Epic | Critério principal de aceitação |
|------|--------------------------------|
| WIA-204 | Biblioteca compila, todos os tipos consumíveis pelos outros projetos .NET, zero `any` / dynamic |
| WIA-215 | Trocar o PSP ativo requer apenas configuração — zero alteração de código de negócio |
| WIA-261 | Enviar o mesmo webhook 10x simultaneamente resulta em exatamente 1 atualização de transação |
| WIA-272 | Seller cria link, pagador acessa URL pública, transação criada e vinculada ao link, métricas exibidas |
| WIA-297 | Usuário alterna entre dois sellers distintos; cada seller vê apenas seus próprios dados |
| WIA-296 | Dashboard exibe valores reais que batem com os registros do banco |

---

## Fases de Implementação

As fases abaixo refletem a ordem estrita de dependência. Ver [CONTEXT-MAP.md](./CONTEXT-MAP.md) para detalhes de cada step.

| Fase | Epics | Pré-requisito |
|------|-------|--------------|
| 0 — Fundação | WIA-204 | Nenhum |
| 1 — Abstração de Provedor | WIA-215 | WIA-204 |
| 2 — Core Assíncrono | WIA-261 | WIA-204, WIA-215 |
| 3 — Billing Links | WIA-272 | WIA-204, WIA-215, WIA-261 |
| 4 — Multi-Seller | WIA-297 | Paralelo com Fase 3, impacta todas |
| Fix | WIA-296 | WIA-275 + WIA-297 |
