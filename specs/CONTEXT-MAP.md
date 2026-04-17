# Context Map — WiteTec Platform Tasks

**Tipo:** Documento de contexto de engenharia  
**Escopo:** Todas as 33 tarefas ativas da plataforma WiteTec  
**Última revisão:** 2026-04-17

---

## Inventário Completo de Tarefas

### WIA-204 — Core .NET: Domain Contracts

| ID | Título | Tipo |
|----|--------|------|
| WIA-204 | Core .NET: Domain Contracts | Epic |
| WIA-208 | Criar projeto `Wite.Core.Domain.Contracts` | Subtarefa |
| WIA-205 | Definir contratos de entidades (Transaction, Customer, Item) | Subtarefa |
| WIA-206 | Definir enums de domínio (TransactionStatus, PaymentMethodType) | Subtarefa |
| WIA-207 | Definir contratos de idempotência e resposta de API | Subtarefa |

### WIA-215 — Strategy Pattern: Provedores de Pagamento

| ID | Título | Tipo |
|----|--------|------|
| WIA-215 | Strategy Pattern para Provedores de Pagamento PIX | Epic |
| WIA-218 | Definir interfaces `IPaymentProvider`, `PaymentRequest`, `PaymentResponse` | Subtarefa |
| WIA-216 | Implementar `ProviderFactory` | Subtarefa |
| WIA-217 | Resiliência com Polly + abstração de secrets | Subtarefa |

### WIA-261 — Webhook PIX: Processamento Assíncrono

| ID | Título | Tipo |
|----|--------|------|
| WIA-261 | Webhook PIX: Processamento Assíncrono e Idempotente | Epic |
| WIA-263 | Infraestrutura SQS (fila + DLQ) | Subtarefa |
| WIA-262 | Endpoint de recebimento do webhook | Subtarefa |
| WIA-264 | Worker SQS: consumo e atualização de status | Subtarefa |
| WIA-265 | Testes de carga e duplicidade | Subtarefa |

### WIA-272 — Billing Links

| ID | Título | Tipo |
|----|--------|------|
| WIA-272 | Implementar Links de Pagamento (Billing Links) | Epic |
| WIA-276 | Modelagem de Dados e CRUD de BillingLink | Subtarefa |
| WIA-273 | Endpoint Público de Charge | Subtarefa |
| WIA-274 | Segurança e Rate Limiting no Checkout | Subtarefa |
| WIA-275 | Dashboard de Métricas | Subtarefa |

### WIA-296 — Bug: Dashboard sem dados

| ID | Título | Tipo |
|----|--------|------|
| WIA-296 | [BUG] Dashboard não exibe dados de vendas | Bug standalone |

### WIA-297 — Multi-Seller (Subcontas)

| ID | Título | Tipo |
|----|--------|------|
| WIA-297 | Subcontas: Multi-Seller por Usuário | Epic |
| WIA-298 | Criar tabela `seller_users` (migração Prisma) | Subtarefa |
| WIA-299 | Remover constraint única de `Seller.userId` | Subtarefa |
| WIA-300 | Seed: migrar usuários existentes para `seller_users` como OWNER | Subtarefa |
| WIA-303 | JWT claims: adicionar `sellerId` ativo e `sellerRole` | Subtarefa |
| WIA-301 | `GET /me/sellers` — listar sellers do usuário | Subtarefa |
| WIA-302 | `POST /auth/switch-seller` — trocar seller ativo | Subtarefa |
| WIA-305 | `SellerContextGuard` — guard de contexto de seller | Subtarefa |
| WIA-306 | Decorator `@SellerId()` | Subtarefa |
| WIA-304 | Logs estruturados de switch-seller | Subtarefa |
| WIA-307 | Infraestrutura base de RBAC (OWNER/ADMIN/VIEWER) | Subtarefa |
| WIA-308 | Mapeamento e catalogação de pontos legados 1:1 | Subtarefa |
| WIA-309 | Refatorar API Keys para `@SellerId()` | Subtarefa |
| WIA-310 | Refatorar Webhooks (seller) para `@SellerId()` | Subtarefa |
| WIA-311 | Refatorar Transactions para `@SellerId()` | Subtarefa |
| WIA-312 | Refatorar Withdrawals para `@SellerId()` | Subtarefa |
| WIA-313 | Refatorar Wallet/BalanceStatement para `@SellerId()` | Subtarefa |
| WIA-314 | Refatorar Acquirer configs para `@SellerId()` | Subtarefa |
| WIA-315 | Remover todo código legado 1:1 | Subtarefa |

---

## Grafo de Dependências

```
WIA-204 (Domain Contracts — FUNDAÇÃO)
  ├── define: TransactionContract, CustomerContract, ItemContract
  ├── define: TransactionStatus enum, PaymentMethodType enum
  ├── define: IdempotencyContract, ApiResponseContract, ErrorResponseContract
  └── consumido por: WIA-215, WIA-261, WIA-272, WIA-297

WIA-215 (Provider Strategy)
  ├── depende de: WIA-204
  ├── define: IPaymentProvider, ProviderFactory, resiliência Polly
  └── consumido por: WIA-272 (charges via billing link chamam PSP através do provider)

WIA-261 (PIX Webhook)
  ├── depende de: WIA-204, WIA-215
  ├── define: WebhookPaymentLog, TransactionStatusMachine, pipeline SQS
  └── consumido por: WIA-272 (transações criadas via billing link recebem confirmação via webhook)

WIA-272 (Billing Links)
  ├── depende de: WIA-204, WIA-215, WIA-261
  ├── usa: CreateTransactionService (existente), IPaymentProvider (WIA-215)
  ├── adiciona: entidade BillingLink, FK Transaction.billingLinkId
  └── consumido por: WIA-297 (escopo por seller), WIA-275 (métricas)

WIA-297 (Multi-seller)
  ├── cross-cutting: afeta TODAS as features
  ├── quebra: modelo atual 1:1 User↔Seller
  ├── adiciona: tabela seller_users N:N, endpoint switch-seller
  ├── refatora: API keys, webhooks, transactions, withdrawals, wallet (WIA-308 a WIA-315)
  └── corrige contexto para: WIA-296 (dashboard bug)

WIA-296 (Dashboard Bug)
  ├── prováveis causas raiz: gaps de agregação WIA-275 OU limitação do modelo 1:1 de WIA-297
  └── fix desbloqueado após: WIA-275 completo + contexto sellerId de WIA-297 corrigido
```

---

## Ordem de Build (dependência estrita)

```
Fase 0 — Fundação
  WIA-208 → WIA-205 → WIA-206 → WIA-207
  (Domain Contracts — base para todos os epics)

Fase 1 — Abstração de Provedor
  WIA-218 → WIA-216 → WIA-217
  (Payment Provider Strategy)

Fase 2 — Core Assíncrono
  WIA-263 → WIA-262 → WIA-264 → WIA-265
  (PIX Webhook)

Fase 3 — Feature Billing Links
  WIA-276 → WIA-273 → WIA-274 → WIA-275
  (Billing Links — pode iniciar em paralelo com Fase 2 a partir de WIA-276)

Fase 4 — Evolução de Auth (paralela com Fase 3)
  WIA-298 → WIA-299 → WIA-300
  → WIA-303 → WIA-305 → WIA-306
  → WIA-301 → WIA-302 → WIA-304 → WIA-307
  → WIA-308
  → WIA-309, WIA-310, WIA-311, WIA-312, WIA-313, WIA-314 (paralelos entre si)
  → WIA-315
  (Multi-seller)

Fix — Bug
  WIA-296 (após WIA-275 + WIA-297 completos)
```

---

## Preocupações Transversais (Cross-cutting Concerns)

### Enum `TransactionStatus`

| Tarefa | Como usa |
|--------|---------|
| WIA-206 | Define o enum |
| WIA-261 | TransactionStatusMachine — valida transições |
| WIA-272 | Determina o que conta como "aprovado" e "pendente" nas métricas |
| WIA-275 | Query de agregação filtra por status |

### `IdempotencyContract`

| Tarefa | Como usa |
|--------|---------|
| WIA-207 | Define o contrato |
| WIA-261 | Idempotência por `end2endId` no worker SQS |
| WIA-272 | `Idempotency-Key` obrigatório no endpoint público |
| WIA-273 | Implementação via Redis SETNX com TTL 24h |

### Escopo por `sellerId`

Invariante crítico compartilhado por TODOS os epics. O `sellerId` deve ser **sempre** extraído do JWT — nunca do body da requisição.

| Tarefa | Impacto |
|--------|---------|
| WIA-204 | Contratos de domínio devem carregar sellerId |
| WIA-261 | WebhookPaymentLog vinculado ao seller correto |
| WIA-272 | `sellerId` obtido do `BillingLink`, não de auth (endpoint público) |
| WIA-275 | Métricas filtradas por `sellerId` do JWT |
| WIA-297 | Refatora o modelo: `seller_users` é a nova fonte de verdade |
| WIA-296 | Dashboard quebrado se sellerId resolvido incorretamente |

### Propagação de `correlationId`

| Tarefa | Como usa |
|--------|---------|
| WIA-207 | Contrato base inclui `correlationId` |
| WIA-261 | Payload SQS contém `correlationId`; logs do worker incluem |
| WIA-262 | Header `x-correlation-id` propagado para SQS |
| WIA-272 | `correlationId` presente em todos os logs de erro |
| WIA-297 | Logs de switch-seller incluem `correlationId` |

### Proteção de PII

| Tarefa | Onde se aplica |
|--------|----------------|
| WIA-207 | `ErrorResponseContract` — sem dados de cliente nos erros |
| WIA-217 | Sanitizador de logs em todas as chamadas `IPaymentProvider` |
| WIA-273 | `PiiSanitizer` obrigatório em todos os `catch` blocks do endpoint público |

---

## Matriz de Riscos

| Risco | Severidade | Tarefas que mitigam |
|-------|-----------|---------------------|
| Webhook duplicado gera transação dupla (efeito financeiro) | Crítico | WIA-263 (DLQ), WIA-264 (check `end2endId`), WIA-265 (testes) |
| `sellerId` errado expõe dados de outro seller | Crítico | WIA-305 (`SellerContextGuard`), WIA-306 (decorator), WIA-315 (remoção legado) |
| PII em logs de produção | Alto | WIA-207, WIA-217, WIA-273 |
| Troca de PSP sem mudança de código (lock-in) | Alto | WIA-215 (`IPaymentProvider`, `ProviderFactory`) |
| Dashboard quebrado bloqueia visibilidade operacional do seller | Médio | WIA-275 (métricas corretas), WIA-297 (contexto sellerId) |
| Rate limit baixo demais bloqueia transações legítimas em pico | Médio | WIA-274 (limites configuráveis) |
| Migração multi-seller sem seed quebra usuários existentes | Alto | WIA-300 (seed OWNER obrigatório) |
| Transição de status inválida passa silenciosamente | Alto | WIA-206 (enum), WIA-261 (state machine com exceções explícitas) |
