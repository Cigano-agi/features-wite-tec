# Project Research Summary

**Project:** WIA-272 -- Billing Links Production Refactor
**Domain:** Billing/payment link platform -- Brazilian market (B2B seller tool, PIX + card)
**Researched:** 2026-04-16
**Confidence:** HIGH

## Executive Summary

WIA-272 is a brownfield refactor, not a greenfield build. Three architectural debts are production blockers: TypeORM must be replaced with Prisma 6.x, the idempotency check-then-act pattern must be replaced with atomic Redis SET NX, and the .NET InMemoryRepository must be replaced with EF Core + PostgreSQL. The recommended migration path is sequential: scaffold the monorepo, complete the ORM migration, fix charge flow correctness, then build seller-facing features.

The Brazilian market specifics are non-negotiable constraints. PIX is the dominant payment method (40%+ of e-commerce) and requires dynamic QR code generation per charge -- txid, pixQrCode, and pixCopiaECola are absent from the current PoC response. CPF logging violates LGPD (up to 2% of annual Brazil revenue in penalties). PiiSanitizer must be applied on all error paths via a global NestJS exception filter -- a legal requirement, not optional hygiene.

The highest-risk phase is the charge flow correctness phase. The current PoC can cause double charges under concurrent load. After correctness blockers are resolved, the remaining work follows standard NestJS + Prisma patterns.

## Key Findings

### Recommended Stack

The migration stays within the existing technology decisions. Primary changes: NestJS 10 to 11 (Express v5 wildcard syntax change, Node 18 dropped), TypeORM to Prisma 6.19.x, Passport JWT to pure CanActivate guard with @nestjs/jwt, and raw process.env access to @nestjs/config ConfigService. The .NET service is not rewritten -- only its persistence layer changes. The frontend (React 18 + Vite + Tailwind) requires no migration.

Prisma 7 is explicitly not recommended: documented 35-40% small-query performance regression and a breaking generator config change. Rate limiting uses a hybrid approach: @nestjs/throttler with Redis storage for authenticated routes, and the custom RateLimiterMiddleware for the public charge endpoint.

**Core technologies:**
- NestJS 11 + Node 20 LTS: API framework -- Express v5 default; Node 18 dropped (hard requirement)
- Prisma 6.19.x + @prisma/adapter-pg: ORM replacing TypeORM -- WiteTec standard, db pull migration path
- @nestjs/jwt pure CanActivate guard (no Passport): JWT auth -- eliminates 3 packages, Trilon-recommended
- ioredis 5.x: Redis client -- already wired into IdempotencyService and RateLimiter; no mid-migration swap
- @nestjs/config v4: Environment config -- replaces scattered process.env with DI-injectable ConfigService
- @nestjs/axios HttpModule: Internal HTTP to .NET -- enables DI and test-module mocking; replaces raw axios
- @nestjs/throttler v5 + @nest-lab/throttler-storage-redis: Rate limiting on authenticated routes
- ASP.NET Core 8 + EF Core 8 + Npgsql: .NET PSP service -- persistence layer only change; hexagonal correct
### Expected Features

The PoC is missing two critical capabilities: PIX QR code + copia-e-cola in the charge response, and real dashboard metrics (currently hardcoded to 0). Every v1 feature depends on completing the BillingLink model first.

**Must have for v1 (P1):**
- BillingLink complete model (slug, FIXED/OPEN, allowPix, allowCard, expiresAt, active) -- all other features depend on this
- /pay/:slug public endpoint replacing /pay/:linkId -- URL format cannot change post-launch
- PIX dynamic QR code + copia-e-cola in charge response -- PIX is dominant; partial PIX support is not usable
- Credit card payment method -- sellers with high-ticket items cannot use the product without card
- Atomic idempotency with Redis SET NX before .NET call -- current race condition causes double charges
- Seller dashboard with real per-link totals (total, approved, pending) -- hardcoded 0 is not shippable
- Transaction listing per link with seller isolation -- audit trail required; regulatory expectation
- PiiSanitizer on all error paths via global exception filter -- LGPD compliance, non-negotiable
- seller_id always from JWT sub claim -- security invariant; any deviation is a privilege escalation vector

**Should have post-launch (P2):**
- Webhook on transaction status change
- Email notification to payer on payment success
- Link slug customization (seller-supplied branded URLs)
- Charge limit per link (maxCharges)
- Per-link conversion funnel (views vs charges)

**Defer to v2+ (P3):**
- Credit card installments (parcelas) -- requires PSP renegotiation; defer until card volume justifies
- Boleto -- out of scope; 30% non-payment rate mismatched with real-time confirmation model
- Custom checkout branding -- low conversion impact in v1
- Recurring/subscription billing -- separate product vertical
- WebSocket real-time push -- premature before reliable webhook delivery exists

### Architecture Approach

The system follows a layered structure: React frontend to NestJS API gateway (port 3000) to PostgreSQL 15 + Redis 7, with NestJS calling the .NET PSP service (port 5001). NestJS owns the PostgreSQL schema via Prisma migrations; .NET writes to its own psp_transactions table via EF Core. This separated table ownership prevents migration conflicts. The PspModule acts as an anti-corruption layer: all HTTP calls to .NET go through PspService only.

**Major components:**
1. src/modules/billing-links -- seller CRUD for payment links (authenticated, Prisma, JWT-guarded)
2. src/modules/public-charge -- payer-facing POST /pay/:slug (unauthenticated, rate-limited, idempotent)
3. src/modules/transactions -- read-only seller view of transaction history per link (Prisma, seller-isolated)
4. src/modules/dashboard -- aggregate metrics per seller/link (Prisma GROUP BY, currently hardcoded 0 in PoC)
5. src/modules/webhooks -- outbound webhook dispatch on transaction status change (EventEmitter v1)
6. src/shared/psp -- PspModule wrapping @nestjs/axios -- sole anti-corruption layer for all .NET calls
7. src/shared/prisma -- @Global() PrismaModule -- singleton DB connection shared across all feature modules
8. src/shared/redis -- @Global() RedisModule -- ioredis singleton for idempotency + rate limiting
9. src/shared/pii -- PiiSanitizer static utility -- applied in every catch block touching payer data
10. services/dotnet-psp/ -- .NET 8 PSP gateway -- hexagonal structure correct; persistence layer change only

**Dependency-driven build order:** monorepo scaffold -> Prisma schema -> shared infrastructure -> auth -> billing-links -> PSP + .NET EF Core -> public-charge -> transactions -> dashboard -> webhooks -> frontend refactor.

### Critical Pitfalls

1. **Idempotency race condition** -- PoC calls exists() then save() separately. Fix: call checkOrSave() (atomic SET NX EX) BEFORE the .NET HTTP call. If key exists, return cached result immediately.

2. **Redis key eviction silently kills idempotency** -- Managed Redis defaults to allkeys-lru; keys evicted under memory pressure cause silent double charges. Fix: set maxmemory-policy noeviction; monitor memory headroom.

3. **Prisma column rename = silent data loss** -- Prisma Migrate generates DROP + ADD (not RENAME). Fix: use prisma migrate --create-only, manually review SQL before applying. Use @map for field renames.

4. **PII on all error paths** -- NestJS default exception filter logs axios response data containing payerName and payerCpf. Fix: global exception filter applying PiiSanitizer; unit tests asserting no CPF in any log output.

5. **.NET 5xx does not mean transaction did not happen** -- HTTP is not transactional. Fix: reserve idempotency key before the .NET call so retries are deduplicated at Redis.

6. **.NET InMemoryTransactionRepository in production** -- All transaction history lost on restart. Fix: EF Core + PostgreSQL is the first .NET deliverable; startup assertion blocking InMemoryRepository in non-local environments.
## Implications for Roadmap

### Phase 1
**Rationale:** Foundation phase.
**Delivers:** Clean monorepo.
**Avoids:** Pitfall 6, 16, 17, 18.

### Phase 2
**Rationale:** Schema first.
**Delivers:** schema.prisma; baseline migration.
**Avoids:** Pitfall 3, 7, 8, 14.

### Phase 3
**Rationale:** PiiSanitizer before payer data.
**Delivers:** PrismaModule @Global(); RedisModule @Global(); PiiSanitizer with global NestJS exception filter; CorrelationIdMiddleware with regex format validation; JwtAuthGuard (pure CanActivate); @CurrentUser() decorator; AuthenticatedRequest interface enforcing req.user.sub as sole sellerId source; rate-limiter middleware; @nestjs/throttler with Redis storage.
**Avoids:** Pitfall 4, 13, 15.

### Phase 4
**Rationale:** First complete seller workflow.
**Delivers:** POST /v1/auth/login; POST/GET/PATCH/DELETE /v1/billing-links with seller isolation; slug uniqueness; link expiry; toggle flags; activate/deactivate; DTOs.
**Implements:** src/modules/auth, src/modules/billing-links.

### Phase 5
**Rationale:** EF Core is first deliverable.
**Delivers:** EF Core replacing InMemoryTransactionRepository; psp_transactions table; PspModule; POST /internal/transactions returning pixQrCode, pixCopiaECola, pixExpiresAt; txid as Guid.NewGuid().ToString(N); startup assertion.
**Avoids:** Pitfall 5, 10, 12.

### Phase 6
**Rationale:** Highest-risk phase.
**Delivers:** POST /pay/:slug (atomic SET NX EX 86400 BEFORE .NET call); PIX QR + copia-e-cola; pixExpiresAt; credit card path; GET /pay/:slug/info; PiiSanitizer in catch blocks; 5xx returns error; noeviction verified.
**Avoids:** Pitfall 1, 2, 4, 5, 9.

### Phase 7
**Rationale:** Depends on Phases 5-6.
**Delivers:** GET /v1/billing-links/:id/transactions; GET /v1/dashboard; Prisma aggregates with indexed seller_id.
**Implements:** src/modules/transactions, src/modules/dashboard.

### Phase 8
**Rationale:** Both close out v1.
**Delivers:** POST /v1/webhooks; EventEmitter dispatch on transaction.approved and transaction.failed; deduplification table; exponential backoff retry; delivery ID header. Frontend: /pay/:slug with PIX QR + countdown; dashboard; BillingLinks CRUD UI.
**Avoids:** Pitfall 11.
### Phase Ordering Rationale

- Phases 1-3 must complete before any feature work -- monorepo structure, ORM, and shared infrastructure are pre-conditions.
- Phase 4 before Phase 6 -- public-charge validates billing links by slug; billing-links module must exist first.
- Phase 5 before Phase 6 -- .NET must persist transactions; Phase 6 correctness requires queryable .NET.
- Phase 6 before Phase 7 -- Dashboard metrics require real transactions in PostgreSQL.
- Phase 8 is the only phase that can be split -- webhooks and frontend refactor are independent.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (.NET EF Core + PIX integration):** PSP sandbox API contracts vary between Brazilian PSPs (Efi Pay, Cielo, Celcoin). Exact field names and txid constraints depend on the specific PSP. Requires PSP-specific API documentation.
- **Phase 6 (Redis noeviction):** Managed Redis providers may restrict maxmemory-policy settings. Needs validation against the actual hosting environment.
- **Phase 8 (webhook retry strategy):** Decision on EventEmitter + retry cron vs Bull queue in v1 needs architectural decision.

Phases with standard, well-documented patterns (can skip research-phase):
- **Phase 1 (NestJS 11 upgrade):** Official NestJS migration guide is complete and specific.
- **Phase 2 (Prisma migration):** Official migrate-from-typeorm guide + prisma db pull is the documented path.
- **Phase 3 (shared infrastructure):** PrismaModule @Global(), RedisModule, CanActivate guard -- all have official NestJS examples.
- **Phase 4 (billing-links CRUD):** Standard NestJS module with Prisma. Well-documented patterns.
- **Phase 7 (transactions + dashboard):** Standard Prisma aggregate queries with seller isolation filter.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | NestJS v11, Prisma v6.19, @nestjs/config v4 verified against official docs and npm registry. |
| Features | HIGH | PIX market data from BACEN and PYMNTS. Cross-referenced against iugu, Pagar.me, Stripe Payment Links. |
| Architecture | HIGH (NestJS) / MEDIUM (.NET coexistence) | NestJS patterns from official docs. Dual-table approach is a recommendation without a specific reference implementation. |
| Pitfalls | HIGH | Sourced from Airbnb post-mortems, official Redis docs, Prisma migration docs, and LGPD enforcement guidance. |

**Overall confidence:** HIGH

### Gaps to Address

- **PSP API contract details:** The PSP in use must be confirmed and its sandbox docs read during Phase 5 planning.
- **Redis hosting environment:** maxmemory-policy noeviction may require instance-level access on managed providers. Confirm before Phase 6.
- **Webhook URL ownership model:** Per-link vs per-seller webhook URL storage is not resolved. Decide during Phase 8 planning.
- **PSP callback pattern:** Polling vs .NET pushing to Node -- affects Phase 5 and Phase 6 contracts; decide before Phase 5 planning.

## Sources

### Primary (HIGH confidence)
- NestJS Migration Guide v10 to v11 -- https://docs.nestjs.com/migration-guide
- Trilon -- Announcing NestJS 11 -- https://trilon.io/blog/announcing-nestjs-11-whats-new
- Trilon -- NestJS Auth without Passport -- https://trilon.io/blog/nestjs-authentication-without-passport
- Prisma NestJS Guide -- https://www.prisma.io/docs/guides/frameworks/nestjs
- Prisma migrate-from-typeorm -- https://www.prisma.io/docs/guides/migrate-from-typeorm
- Prisma 6.19 release -- https://www.prisma.io/blog/announcing-prisma-6-19-0
- BACEN Manual de Padroes para Iniciacao do Pix -- dynamic QR / txid spec
- PYMNTS -- Pix Surges 53% -- PIX market share data (40%+ of e-commerce)
- Redis key eviction -- https://redis.io/docs/latest/develop/reference/eviction/
- NestJS EventEmitter -- https://docs.nestjs.com/techniques/events
- @nestjs/throttler npm v5.1.2 -- https://www.npmjs.com/package/@nestjs/throttler
- @nestjs/config npm v4.0.4 -- https://www.npmjs.com/package/@nestjs/config
- Airbnb -- Avoiding double payments in a distributed payments system

### Secondary (MEDIUM confidence)
- Prisma 7 vs NestJS Discussion -- https://github.com/prisma/prisma/discussions/29146
- @nest-lab/throttler-storage-redis npm -- community package, actively maintained
- NestJS payment gateway adapter pattern -- PspModule anti-corruption layer
- NestJS + .NET polyglot monorepo -- coexistence conventions
- Hookdeck -- Webhook retry best practices
- Cashfree -- Webhook idempotency patterns

### Tertiary (LOW confidence -- validate during implementation)
- PSP-specific PIX field names -- pattern verified but field names vary per PSP
- Prisma + EF Core dual-table ownership in same PostgreSQL DB -- recommendation without specific reference implementation

---
*Research completed: 2026-04-16*
*Ready for roadmap: yes*