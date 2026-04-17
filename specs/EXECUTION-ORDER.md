# Execution Order — WiteTec Production

## Estado atual do PoC

| Componente | Existe | Gaps |
|------------|--------|------|
| BillingLink CRUD (NestJS) | ✓ PoC | TypeORM → Prisma pendente |
| PublicChargeService | ✓ PoC | Chama .NET direto, sem IPaymentProvider |
| IdempotencyService (Redis) | ✓ PoC | OK |
| PiiSanitizer | ✓ PoC | OK |
| CorrelationId middleware | ✓ PoC | OK |
| Rate limiter | ✓ PoC | OK |
| JWT auth | ✓ PoC | Modelo 1:1 user↔seller |
| Transaction .NET | ✓ PoC | InMemory, só 3 status, sem contratos |
| Wite.Core.Domain.Contracts | ✗ | CRIAR |
| IPaymentProvider / ProviderFactory | ✗ | CRIAR |
| Webhook PIX + SQS | ✗ | CRIAR |
| EF Core (real persistence .NET) | ✗ | CRIAR |
| seller_users (multi-seller) | ✗ | CRIAR |
| Dashboard metrics reais | ✗ | CRIAR |

---

## Ordem de Execução

### FASE 0 — Domain Contracts (WIA-204) ← INICIAR AGORA
**Por que primeiro**: tudo depende dos contratos. TransactionStatus tem 3 valores no PoC, precisa de 7. Contratos inline precisam virar biblioteca compartilhada.

```
WIA-208  Criar projeto Wite.Core.Domain.Contracts
WIA-206  Enums: TransactionStatus (7 values), PaymentMethodType
WIA-205  Contracts: TransactionContract, CustomerContract, ItemContract
WIA-207  Contracts: IdempotencyContract, ApiResponseContract, ErrorResponseContract
```

**Entregável**: `dotnet-service/Wite.Core.Domain.Contracts/` compilando, referenciado pelo `WitetecBillingService`.

---

### FASE 1 — EF Core Persistence (pré-requisito para webhook)
**Por que antes do webhook**: WebhookPaymentLog precisa de banco real. InMemoryRepository inviabiliza produção.

```
- Adicionar EF Core + Npgsql ao WitetecBillingService.csproj
- Criar PostgresTransactionRepository (implementa ITransactionRepository)
- Criar WebhookPaymentLog entity + migration
- Docker compose já tem PostgreSQL 15 — só conectar
```

**Entregável**: .NET persiste transações em PostgreSQL real.

---

### FASE 2 — Payment Provider Abstraction (WIA-215)
**Por que agora**: PublicChargeService chama .NET sem passar pelo PSP real. IPaymentProvider desacopla.

```
WIA-218  IPaymentProvider + DTOs PaymentRequest/PaymentResponse
WIA-216  ProviderFactory + DI
WIA-217  Polly (retry + circuit breaker) + IProviderSecretProvider
```

**Entregável**: .NET processa cobranças via `IPaymentProvider`, não hardcoded.

---

### FASE 3 — Webhook PIX Pipeline (WIA-261)
**Por que aqui**: com persistência real + contratos prontos, webhook é viável.

```
WIA-263  SQS infra (Terraform/LocalStack para dev) + contrato de mensagem
WIA-262  POST /webhooks/{providerCode} → persiste log → enfileira SQS → 202
WIA-264  Worker SQS: idempotência por end2endId + TransactionStatusMachine
WIA-265  Testes: duplicidade, rastreabilidade, carga
```

**Entregável**: confirmação PIX atualiza Transaction.status de forma idempotente.

---

### FASE 4 — Multi-Seller (WIA-297) [paralelo com Fase 3]
**Por que paralelo**: não depende do webhook. Depende apenas da estrutura NestJS atual.

```
WIA-298  seller_users table (Prisma migration)
WIA-299  Remover Seller.userId unique constraint
WIA-300  Seed usuários existentes como OWNER
WIA-303  JWT claims: sellerId ativo + sellerRole
WIA-305  SellerContextGuard
WIA-306  @SellerId() decorator
WIA-301  GET /me/sellers
WIA-302  POST /auth/switch-seller
WIA-304  Logs estruturados no switch
WIA-307  Base RBAC (OWNER/ADMIN/VIEWER)
WIA-308  Mapear código 1:1 legado
WIA-309..315  Refatorar API keys, webhooks, tx, withdrawals, wallet, configs
WIA-315  Remover modelo 1:1 legado
```

**Entregável**: usuário alterna entre sellers sem relogar. Todos os endpoints usam sellerId do token.

---

### FASE 5 — Dashboard + Bug Fix (WIA-275 + WIA-296)
**Por que por último**: depende de dados reais (Fase 1) e sellerId correto (Fase 4).

```
WIA-275  GET /v1/billing-links/metrics com GROUP BY real + índices
WIA-296  Diagnóstico + fix do dashboard
```

---

## Regras de ouro durante implementação

1. `sellerId` sempre do JWT — nunca do body
2. PII nunca em logs (`PiiSanitizer` em todos os catch)
3. `correlationId` em toda requisição (NestJS → .NET)
4. Idempotência por `end2endId` (webhook) e `Idempotency-Key` header (charge)
5. Todo status transition vai pela `TransactionStatusMachine` — sem if/switch espalhado
6. Testes passando antes de cada commit

---

## Próximo passo imediato

**WIA-208**: Criar `Wite.Core.Domain.Contracts` como class library no dotnet-service.
