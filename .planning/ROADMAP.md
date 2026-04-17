# Roadmap: WIA-272 Billing Links — Production Refactor

## Overview

This roadmap takes the Billing Links PoC from a functional proof-of-concept to a production-ready system. The journey follows a strict dependency order: establish the monorepo foundation and shared infrastructure first, then build upward through authentication, the BillingLink CRUD layer, the .NET PSP integration, the public charge flow (the highest-risk phase), seller-facing metrics and transaction history, async webhook delivery, and finally the frontend refactor that consumes all the API contracts established in earlier phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Monorepo Scaffold** - Migrate to NestJS 11 + Prisma, reorganize into monorepo src/modules, wire CI/CD pipelines
- [ ] **Phase 2: Shared Infrastructure** - Global Prisma/Redis modules, PiiSanitizer, CorrelationId, OpenTelemetry, rate limiting, .NET EF Core + PspModule
- [ ] **Phase 3: Auth & BillingLink CRUD** - JWT guard, seller auth, complete BillingLink model with full CRUD
- [ ] **Phase 4: Public Charge Flow** - Public /public/billing-links/:slug endpoint, atomic idempotency, PIX QR code, credit card, charge validation
- [ ] **Phase 5: Transactions & Dashboard** - Transaction persistence, seller dashboard with real aggregates, paginated transaction listing, conversion funnel
- [ ] **Phase 6: Webhooks & Async** - AWS SQS webhook dispatch on status change, DLQ, idempotent workers, exponential backoff
- [ ] **Phase 7: Security, Compliance & Deployment** - Secrets management, LGPD/PCI DSS controls, audit logging, canary deployment, availability SLOs
- [ ] **Phase 8: Frontend Refactor** - Pay page /pay/:slug, seller dashboard UI, CPF validation, performance SLOs verified

## Phase Details

### Phase 1: Monorepo Scaffold
**Goal**: The project runs as a single monorepo on NestJS 11 + Prisma with all three legacy repos consolidated, TypeORM removed, and CI/CD pipelines in place
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, AVAIL-03, AVAIL-04, AVAIL-05
**Success Criteria** (what must be TRUE):
  1. `npm test` passes in node-api/ after upgrading to NestJS 11 with Node 20
  2. Prisma 6.x is installed and `prisma generate` runs without TypeORM present in the project
  3. All three legacy directories are merged into a single monorepo with src/modules layout
  4. The PR pipeline (.github/workflows/pull_request.yaml) runs automatically on every pull request
  5. The production deploy pipeline (.github/workflows/aws_prod.yml) exists and is configured
**Plans**: 4 plans
- [x] 01-01-PLAN.md — NestJS 11 upgrade + monorepo restructure (move node-api/ to root, fix wildcard route)
- [x] 01-02-PLAN.md — Prisma 6.19 install + introspect billing_links + PrismaService global module + [BLOCKING] db push
- [x] 01-03-PLAN.md — DI replacements: @nestjs/config + pure CanActivate JWT guard + @nestjs/axios HttpModule (removes Passport, 7 process.env reads)
- [x] 01-04-PLAN.md — TypeORM removal + BillingLinksService ported to Prisma + GitHub Actions PR/prod workflows + Dockerfile

### Phase 2: Shared Infrastructure
**Goal**: All shared building blocks are operational — Prisma and Redis singletons, PiiSanitizer enforced globally, CorrelationId on every request, OpenTelemetry traces flowing, rate limiting active, .NET persisting to PostgreSQL via EF Core, and PspModule as the sole HTTP adapter to .NET
**Depends on**: Phase 1
**Requirements**: INFRA-07, INFRA-08, SEC-01, SEC-02, SEC-03, OBS-01, OBS-02, OBS-03, RATE-01, RATE-02, RATE-03
**Success Criteria** (what must be TRUE):
  1. A request containing a CPF value that throws an error produces zero CPF digits in the log output
  2. Every API error response contains exactly { code, message, correlationId } with no stack trace or raw DB message
  3. A CorrelationId is present on the response header for every request, including errors
  4. OpenTelemetry spans are emitted and received by the configured OTLP endpoint for a sample request
  5. The charge endpoint returns HTTP 429 after exceeding 10 requests per minute from the same IP on the same slug
  6. The .NET service starts with EF Core connected to PostgreSQL; restarting .NET does not lose transaction records
**Plans**: TBD

### Phase 3: Auth & BillingLink CRUD
**Goal**: A seller can register, log in, and perform full CRUD on billing links with complete model fields, slug uniqueness enforced, and seller isolation guaranteed
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, LINK-01, LINK-02, LINK-03, LINK-04, LINK-05, LINK-06
**Success Criteria** (what must be TRUE):
  1. An authenticated seller can create a billing link with all model fields (name, slug, FIXED_AMOUNT/OPEN_AMOUNT, allowPix, allowCard, expiresAt, maxCharges, isActive)
  2. Creating two links with the same slug under the same seller returns a conflict error; the same slug under a different seller succeeds
  3. A seller cannot read, update, or delete a billing link that belongs to another seller (HTTP 404 or 403)
  4. No public endpoint response reveals sellerId, internal IDs, or server configuration
  5. An OPEN_AMOUNT link accepts a payer-defined amount within configured min/max bounds
  6. A link with maxCharges=1 rejects a second charge attempt
**Plans**: TBD

### Phase 4: Public Charge Flow
**Goal**: A payer can access a billing link by slug and submit a payment (PIX or credit card) with full idempotency guarantees, receiving a PIX QR code or card confirmation in the response, while the system enforces all charge validations atomically
**Depends on**: Phase 3
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, PAY-08, PAY-09
**Success Criteria** (what must be TRUE):
  1. GET /public/billing-links/:slug returns link configuration without exposing sellerId or internal fields, cached in Redis
  2. POST /public/billing-links/:slug/charge with the same Idempotency-Key submitted twice returns identical responses without creating a second transaction
  3. A PIX charge response contains pixQrCode (image), pixCopiaECola (text string), and pixExpiresAt
  4. A credit card charge completes tokenization via .NET/PSP and returns a confirmed transaction reference
  5. Attempting to charge an expired link, a link with a disallowed payment method, or a link at maxCharges returns a validation error before calling .NET
  6. An invalid CPF (failing checksum) is rejected with an error at the backend before reaching the PSP
**Plans**: TBD
**UI hint**: yes

### Phase 5: Transactions & Dashboard
**Goal**: A seller can view real aggregate metrics for each billing link and browse a paginated transaction history, with all totals computed from live PostgreSQL data (no hardcoded values)
**Depends on**: Phase 4
**Requirements**: TXN-01, TXN-02, TXN-03, TXN-04, TXN-05
**Success Criteria** (what must be TRUE):
  1. GET /v1/billing-links/summary returns per-link totals (total charged, completed, pending) computed from the transactions table via GROUP BY — values change as transactions are created
  2. GET /v1/billing-links/:id/transactions returns a paginated list of transactions for that link, visible only to the owning seller
  3. A transaction status of PENDING, COMPLETED, or CONFIRMED is accurately reflected in the summary totals
  4. Page view counter for a link increments on each visit to GET /public/billing-links/:slug
**Plans**: TBD

### Phase 6: Webhooks & Async
**Goal**: When a transaction status changes, the seller's configured webhook URL receives a signed POST notification delivered via AWS SQS with exponential backoff retries and a DLQ for failed deliveries, and duplicate SQS messages do not cause duplicate financial effects
**Depends on**: Phase 5
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04
**Success Criteria** (what must be TRUE):
  1. A transaction status change from PENDING to COMPLETED triggers a POST to the seller's webhook URL containing the transaction details
  2. Delivering the same SQS message twice (simulating duplicate delivery) results in exactly one webhook POST to the seller URL
  3. A webhook delivery that fails 5 times lands in the DLQ and does not retry further automatically
  4. Retry intervals follow the exponential schedule: immediate, 5 min, 30 min, 2h, 5h
**Plans**: TBD

### Phase 7: Security, Compliance & Deployment
**Goal**: The production environment meets LGPD and PCI DSS requirements, secrets are injected from AWS Secrets Manager, CI/CD never prints sensitive values, audit logs are immutable, and canary deployment with rollback is configured
**Depends on**: Phase 6
**Requirements**: SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09, AVAIL-01, AVAIL-02, AVAIL-06
**Success Criteria** (what must be TRUE):
  1. No hardcoded secret values exist in the codebase; all secrets are resolved from AWS Secrets Manager at startup
  2. A CI/CD run log contains no printout of database passwords, JWT secrets, or API keys
  3. The charge endpoint never stores CVV or full PAN; card logs contain only brand and last4
  4. Every transaction record carries transactionId, billingLinkId, externalRef, end2endId, and correlationId
  5. Canary deployment routes a configurable percentage of sellers to the new version; rollback is achievable via ALB configuration without code change
**Plans**: TBD

### Phase 8: Frontend Refactor
**Goal**: The React frontend is refactored and complete — the pay page at /pay/:slug renders a functional PIX + credit card payment form, the seller dashboard shows real data, and all performance SLOs are met under load
**Depends on**: Phase 7
**Requirements**: UI-01, UI-02, UI-03, UI-04, PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06, PERF-07
**Success Criteria** (what must be TRUE):
  1. A payer navigating to /pay/:slug sees a working payment form with PIX QR code display and credit card fields
  2. CPF entered in the payment form is validated client-side with format check before the form submits
  3. The seller dashboard displays real per-link totals, a paginated transaction list, and a conversion funnel with live data
  4. GET /public/billing-links/:slug meets p95 <= 150ms under load test
  5. POST /public/billing-links/:slug/charge (without provider) meets p95 <= 300ms under load test
  6. The system sustains 100 req/s on the public endpoint without degradation
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Monorepo Scaffold | 0/4 | Not started | - |
| 2. Shared Infrastructure | 0/TBD | Not started | - |
| 3. Auth & BillingLink CRUD | 0/TBD | Not started | - |
| 4. Public Charge Flow | 0/TBD | Not started | - |
| 5. Transactions & Dashboard | 0/TBD | Not started | - |
| 6. Webhooks & Async | 0/TBD | Not started | - |
| 7. Security, Compliance & Deployment | 0/TBD | Not started | - |
| 8. Frontend Refactor | 0/TBD | Not started | - |
