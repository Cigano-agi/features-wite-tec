# Requirements: WIA-272 Billing Links

**Defined:** 2026-04-16
**Core Value:** Seller cria billing link, cliente acessa /pay/:slug, paga via PIX ou cartao, seller ve resultado no dashboard

## v1 Requirements

Requirements for production-ready release. Each maps to roadmap phases.

### Infrastructure & Migration

- [ ] **INFRA-01**: Migrate from NestJS 10 to NestJS 11 (Express v5 wildcard fix, Node 20 minimum)
- [ ] **INFRA-02**: Replace TypeORM with Prisma 6.x (db pull from existing schema, PrismaService global module)
- [ ] **INFRA-03**: Reorganize from 3 separate directories to monorepo src/modules structure
- [ ] **INFRA-04**: Replace Passport with pure CanActivate guard + JwtService.verifyAsync()
- [ ] **INFRA-05**: Replace raw axios with @nestjs/axios HttpModule for .NET service calls
- [ ] **INFRA-06**: Replace scattered process.env with @nestjs/config ConfigService
- [ ] **INFRA-07**: .NET EF Core persistence replacing in-memory repository (PostgreSQL)
- [ ] **INFRA-08**: PspModule as anti-corruption layer (src/shared/psp/) wrapping .NET service communication

### Security & Compliance

- [ ] **SEC-01**: PiiSanitizer global exception filter (name/cpf NUNCA em logs, CVV/PAN never stored)
- [ ] **SEC-02**: CPF mascarado em logs (*********01), persistencia conforme politica interna
- [ ] **SEC-03**: Error responses padrao: { code, message, correlationId } — sem stack trace, sem mensagem de banco
- [ ] **SEC-04**: Secrets somente via secret store (AWS Secrets Manager), injetados por ambiente
- [ ] **SEC-05**: CI/CD em GitHub Actions sem impressao de variaveis sensiveis em logs
- [ ] **SEC-06**: LGPD: minimizacao no checkout (apenas nome e CPF), criptografia em transito (HTTPS) e repouso
- [ ] **SEC-07**: PCI DSS: nunca armazenar CVV ou PAN completo, logs sanitizados (brand + last4 apenas)
- [ ] **SEC-08**: Rastreabilidade obrigatoria: transactionId, billingLinkId, externalRef, end2endId, correlationId
- [ ] **SEC-09**: Log imutavel de incidentes e mudancas criticas (auditoria e pos-mortem)

### Authentication & Authorization

- [ ] **AUTH-01**: JWT Guard padrao Nest para rotas privadas (sellerId no token)
- [ ] **AUTH-02**: Rotas publicas sem auth, com rate limiting + idempotencia obrigatorios
- [ ] **AUTH-03**: Ownership obrigatorio: billingLink.sellerId == token.sellerId em qualquer leitura/edicao
- [ ] **AUTH-04**: Nenhuma resposta publica pode expor sellerId, credenciais, segredos ou configs internas

### BillingLink Model & CRUD

- [ ] **LINK-01**: BillingLink model completo (name, slug, chargeType FIXED_AMOUNT/OPEN_AMOUNT, amount, allowPix, allowCard, expiresAt, maxCharges, isActive)
- [ ] **LINK-02**: Slug unico por seller (unique index sellerId+slug), seller-supplied ou nanoid auto-gerado
- [ ] **LINK-03**: CRUD completo: create, list (paginated), update, soft delete (activate/deactivate)
- [ ] **LINK-04**: Indices PostgreSQL: unique(sellerId, slug), index(sellerId, isActive), index(sellerId, createdAt)
- [ ] **LINK-05**: OPEN_AMOUNT com min/max opcionais, payer define valor no charge request
- [ ] **LINK-06**: maxCharges: cap de pagamentos por link, verificado antes da chamada ao PSP

### Public Payment Flow

- [ ] **PAY-01**: GET /public/billing-links/:slug retorna config do link (sem expor sellerId/internals)
- [ ] **PAY-02**: Cache Redis para GET /public/billing-links/:slug (TTL 30-120s), invalidacao ao editar/desativar
- [ ] **PAY-03**: POST /public/billing-links/:slug/charge com Idempotency-Key obrigatorio
- [ ] **PAY-04**: Idempotencia atomica com Redis SET NX + TTL 24h (Idempotency-Key max 64 chars, impede duplo clique/retry)
- [ ] **PAY-05**: Charge valida: link ativo, nao expirado, metodo permitido (allowPix/allowCard), maxCharges nao atingido
- [ ] **PAY-06**: PIX: QR code image + copia e cola string no response (dynamic PIX via PSP, txid sem dashes)
- [ ] **PAY-07**: Credit card: tokenizacao via .NET/PSP
- [ ] **PAY-08**: CPF validation frontend (regex) + backend (class-validator, checksum Luhn-like 11 digitos)
- [ ] **PAY-09**: Provider PIX timeout 3-5s, retry com backoff: 3 tentativas (200ms, 500ms, 1000ms)

### Rate Limiting

- [ ] **RATE-01**: @nestjs/throttler + Redis storage (@nest-lab/throttler-storage-redis)
- [ ] **RATE-02**: Charge endpoint: 10 req/min por IP por slug, 60 req/min por IP global
- [ ] **RATE-03**: Burst protection: >20 requests em 5 min enfileirados para tratamento manual

### Transactions & Metrics

- [ ] **TXN-01**: Transaction entity com status PENDING/COMPLETED/CONFIRMED (conforme enum do sistema)
- [ ] **TXN-02**: Transactions persistidas em PostgreSQL (indices: billingLinkId+status, sellerId+billingLinkId)
- [ ] **TXN-03**: Dashboard seller: totais por link (cobrado, pago, pendente) via SUM/COUNT/GROUP BY no Postgres (proibido N+1)
- [ ] **TXN-04**: Listagem de transacoes por link paginada (GET /billing-links/:id/transactions)
- [ ] **TXN-05**: Conversion funnel: page view counter por link (Redis ou DB)

### Webhooks & Async

- [ ] **HOOK-01**: Webhook POST para URL do seller em mudanca de status (Pending->Completed, Pending->Failed)
- [ ] **HOOK-02**: AWS SQS para processamento assincrono de eventos e webhooks com DLQ
- [ ] **HOOK-03**: Idempotencia por messageId/evento no worker SQS — reprocessamento nao pode duplicar efeito financeiro
- [ ] **HOOK-04**: Exponential backoff retry (imediato, 5 min, 30 min, 2h, 5h)

### Observability

- [ ] **OBS-01**: OpenTelemetry tracing via @opentelemetry/exporter-trace-otlp-http
- [ ] **OBS-02**: CorrelationId end-to-end (API, logs, filas, workers) obrigatorio em respostas de erro
- [ ] **OBS-03**: Redis noeviction policy para instancia de idempotencia

### Performance SLOs

- [ ] **PERF-01**: GET /public/billing-links/:slug — p95 <= 150ms, p99 <= 350ms
- [ ] **PERF-02**: POST /public/billing-links/:slug/charge (sem provider) — p95 <= 300ms, p99 <= 700ms
- [ ] **PERF-03**: POST /public/billing-links/:slug/charge (com provider PIX) — p95 <= 900ms, p99 <= 1500ms
- [ ] **PERF-04**: GET /billing-links/summary — p95 <= 250ms, p99 <= 600ms
- [ ] **PERF-05**: GET /billing-links?page=1&limit=20 — p95 <= 350ms, p99 <= 800ms
- [ ] **PERF-06**: Throughput publico sustentado 100 req/s, pico 300 req/s por 5 min por instancia
- [ ] **PERF-07**: Throughput privado sustentado 50 req/s por instancia

### Availability & Deployment

- [ ] **AVAIL-01**: SLO 99.9% mensal para endpoints criticos (GET config e POST charge)
- [ ] **AVAIL-02**: API stateless, escala horizontal
- [ ] **AVAIL-03**: Branch + PR obrigatorio (sem push direto em main)
- [ ] **AVAIL-04**: Pipeline PR: .github/workflows/pull_request.yaml
- [ ] **AVAIL-05**: Deploy producao: .github/workflows/aws_prod.yml
- [ ] **AVAIL-06**: Canary por seller via gateway/ALB com rollback por configuracao

### Frontend

- [ ] **UI-01**: Refatorar frontend React (manter base, corrigir e completar)
- [ ] **UI-02**: Pay page /pay/:slug com form de pagamento (PIX + cartao)
- [ ] **UI-03**: Dashboard seller com totais, listagem de transacoes, conversion funnel
- [ ] **UI-04**: CPF validation client-side (regex + formato)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Payments

- **PAY-V2-01**: Boleto como metodo de pagamento
- **PAY-V2-02**: Installments (parcelas) em cartao de credito
- **PAY-V2-03**: PIX Parcelado (BACEN 2025 — spec ainda instavel)

### Seller Features

- **SELL-V2-01**: Email notification para payer on success
- **SELL-V2-02**: QR code image para link de cartao (/pay/:slug QR)
- **SELL-V2-03**: Custom checkout branding (logo, colors)
- **SELL-V2-04**: Real-time push notifications (WebSocket/SSE)

### Platform

- **PLAT-V2-01**: OAuth / social login para sellers
- **PLAT-V2-02**: Subscription / recurring billing
- **PLAT-V2-03**: Multi-currency support
- **PLAT-V2-04**: Payer accounts / saved payment methods

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Boleto payment method | 30% non-payment rate, 1-3 day settlement, FEBRABAN compliance — PIX + card covers 90%+ |
| OAuth / social login | Email/password sufficient for v1, adds security surface without proportional value |
| Mobile app | Web-first, mobile later |
| Real-time WebSocket | Dashboard can poll; webhooks cover integration case |
| Subscription/recurring | Separate product vertical, not billing link feature |
| Multi-currency | Brazilian PSPs operate in BRL; domestic market |
| Payer saved methods | PCI-DSS SAQ-D expansion, disproportionate complexity |
| Custom branding | Not a conversion driver for v1; add when usage established |
| PIX Parcelado | BACEN 2025 spec immature, PSP support still maturing |

## Glossary

| Term | Definition |
|------|-----------|
| WiteTec | Nucleo de pagamentos do Wite Group; API principal em api-v2-main (Node/NestJS) |
| Wite Group | Ecossistema de produtos que consome o core de pagamentos da WiteTec |
| Seller | Cliente B2B (empresa) que cria links e recebe pagamentos |
| Pagador | Cliente final que acessa o link publico e paga |
| Billing Link | Entidade persistida que funciona como molde reutilizavel; cada uso gera nova transacao vinculada |
| Slug | Identificador publico do link na URL (/pay/:slug), unico por seller |
| ChargeType | FIXED_AMOUNT (valor fixo) ou OPEN_AMOUNT (valor definido pelo pagador, com min/max opcionais) |
| Transaction | Registro central de tentativa de pagamento; carrega billingLinkId quando originada do link |
| TransactionStatus | PENDING / COMPLETED / CONFIRMED conforme enum do sistema |
| PaymentMethod | Metodo de pagamento permitido (PIX, cartao) |
| Idempotency-Key | Chave enviada no charge request, validada e persistida com TTL via Redis SET NX |
| CorrelationId | Identificador de rastreio ponta a ponta (API, logs, filas, workers) |
| externalRef | Referencia externa do seller/provider para rastreio e conciliacao |
| end2endId | Identificador do PIX para rastrear confirmacao ponta a ponta |
| Webhook | Notificacao para URL do seller em mudanca de status/pagamento |
| SQS | Fila AWS para processamento assincrono, retries e DLQ |
| DLQ | Fila de mensagens falhadas para investigacao e reprocessamento controlado |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 2 | Pending |
| INFRA-08 | Phase 2 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| SEC-03 | Phase 2 | Pending |
| SEC-04 | Phase 7 | Pending |
| SEC-05 | Phase 7 | Pending |
| SEC-06 | Phase 7 | Pending |
| SEC-07 | Phase 7 | Pending |
| SEC-08 | Phase 7 | Pending |
| SEC-09 | Phase 7 | Pending |
| AUTH-01 | Phase 3 | Pending |
| AUTH-02 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| AUTH-04 | Phase 3 | Pending |
| LINK-01 | Phase 3 | Pending |
| LINK-02 | Phase 3 | Pending |
| LINK-03 | Phase 3 | Pending |
| LINK-04 | Phase 3 | Pending |
| LINK-05 | Phase 3 | Pending |
| LINK-06 | Phase 3 | Pending |
| PAY-01 | Phase 4 | Pending |
| PAY-02 | Phase 4 | Pending |
| PAY-03 | Phase 4 | Pending |
| PAY-04 | Phase 4 | Pending |
| PAY-05 | Phase 4 | Pending |
| PAY-06 | Phase 4 | Pending |
| PAY-07 | Phase 4 | Pending |
| PAY-08 | Phase 4 | Pending |
| PAY-09 | Phase 4 | Pending |
| RATE-01 | Phase 2 | Pending |
| RATE-02 | Phase 2 | Pending |
| RATE-03 | Phase 2 | Pending |
| TXN-01 | Phase 5 | Pending |
| TXN-02 | Phase 5 | Pending |
| TXN-03 | Phase 5 | Pending |
| TXN-04 | Phase 5 | Pending |
| TXN-05 | Phase 5 | Pending |
| HOOK-01 | Phase 6 | Pending |
| HOOK-02 | Phase 6 | Pending |
| HOOK-03 | Phase 6 | Pending |
| HOOK-04 | Phase 6 | Pending |
| OBS-01 | Phase 2 | Pending |
| OBS-02 | Phase 2 | Pending |
| OBS-03 | Phase 2 | Pending |
| PERF-01 | Phase 8 | Pending |
| PERF-02 | Phase 8 | Pending |
| PERF-03 | Phase 8 | Pending |
| PERF-04 | Phase 8 | Pending |
| PERF-05 | Phase 8 | Pending |
| PERF-06 | Phase 8 | Pending |
| PERF-07 | Phase 8 | Pending |
| AVAIL-01 | Phase 7 | Pending |
| AVAIL-02 | Phase 7 | Pending |
| AVAIL-03 | Phase 1 | Pending |
| AVAIL-04 | Phase 1 | Pending |
| AVAIL-05 | Phase 1 | Pending |
| AVAIL-06 | Phase 7 | Pending |
| UI-01 | Phase 8 | Pending |
| UI-02 | Phase 8 | Pending |
| UI-03 | Phase 8 | Pending |
| UI-04 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 68 total (note: original estimate of 56 was undercounted — actual count is 68 across 12 categories)
- Mapped to phases: 68
- Unmapped: 0

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after roadmap creation — traceability complete*
