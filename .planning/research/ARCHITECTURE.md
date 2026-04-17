# Architecture Research

**Domain:** Billing / Payment Links platform — NestJS 11 + .NET 8 hybrid monorepo
**Researched:** 2026-04-16
**Confidence:** HIGH (NestJS module/Prisma patterns) | MEDIUM (.NET coexistence conventions)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                           │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │        frontend/  (React 18 + Vite, port 5173)             │     │
│  │   BillingLinksPage  │  PublicChargePage  │  (future pages) │     │
│  └─────────────────────────────┬──────────────────────────────┘     │
└────────────────────────────────│────────────────────────────────────┘
                                 │ HTTP (axios, port 3000)
┌────────────────────────────────▼────────────────────────────────────┐
│                    API GATEWAY LAYER (NestJS 11)                    │
│           src/main.ts  ─  ValidationPipe  ─  CORS                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  src/modules/                                                │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │ billing-links│ │ public-charge│ │ transactions         │ │   │
│  │  │ (auth CRUD)  │ │ (public API) │ │ (seller view)        │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │ auth         │ │ webhooks     │ │ dashboard            │ │   │
│  │  │ (JWT, login) │ │ (outbound)   │ │ (metrics/stats)      │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  src/shared/  (PrismaModule · AuthModule · Redis · PiiSanitizer)    │
└────────────────┬───────────────────────────────────┬───────────────┘
                 │                                   │
      HTTP (ioredis)                    HTTP internal (port 5001)
      ┌──────────▼──────────┐           ┌────────────▼────────────────┐
      │  PostgreSQL 15      │           │  services/dotnet-psp/       │
      │  (billing_links,    │           │  (.NET 8 ASP.NET Core)      │
      │   transactions,     │           │  POST /internal/transactions│
      │   webhooks, etc.)   │           │  Hexagonal: Domain/App/Infra│
      └─────────────────────┘           └─────────────────────────────┘
      ┌──────────▼──────────┐
      │  Redis 7            │
      │  (idempotency keys, │
      │   rate-limit INCR,  │
      │   webhook queues)   │
      └─────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `frontend/` | Seller dashboard + public payer form | React 18 + Vite + TypeScript |
| `src/main.ts` | Bootstrap NestJS, register ValidationPipe, CORS, global pipes | NestJS bootstrap |
| `src/modules/billing-links` | CRUD for seller payment links (authenticated) | NestJS feature module + Prisma |
| `src/modules/public-charge` | Accept payer submissions at `/pay/:slug` (unauthenticated) | NestJS feature module + Redis idempotency |
| `src/modules/transactions` | Seller view of transaction history per link | NestJS feature module + Prisma |
| `src/modules/auth` | JWT login, token issuance, seller identity | NestJS + Passport JWT |
| `src/modules/webhooks` | Outbound webhook dispatch when transaction status changes | NestJS EventEmitter + Redis queue |
| `src/modules/dashboard` | Aggregate metrics per seller/link | NestJS feature module + Prisma |
| `src/shared/prisma` | Single PrismaClient wrapping database connection | `@Global()` NestJS module |
| `src/shared/auth` | JWT guard, strategy, seller_id extractor | Passport + JWT |
| `src/shared/redis` | Shared Redis client for idempotency + rate limiting | ioredis provider |
| `src/shared/pii` | PiiSanitizer static utility — redact name/CPF before logging | Pure utility class |
| `src/shared/correlation` | CorrelationIdMiddleware, propagation to .NET | NestJS middleware |
| `services/dotnet-psp/` | PSP integration: transaction aggregate, state machine, EF Core | .NET 8 ASP.NET Core |
| `prisma/` | Schema, migrations, generated client | Prisma |
| `docker-compose.yml` | Postgres 15 + Redis 7 local infra | Docker Compose |

---

## Recommended Project Structure

```
witetec-billing-links-master/
├── docker-compose.yml              # PostgreSQL 15 + Redis 7
├── .env.example                    # Root env template
│
├── prisma/                         # Prisma schema + migrations (Node owns DB)
│   ├── schema.prisma               # Models: BillingLink, Seller, Transaction, Webhook
│   └── migrations/                 # Auto-generated by prisma migrate
│
├── src/                            # NestJS application root
│   ├── main.ts                     # Bootstrap: ValidationPipe, CORS, port 3000
│   ├── app.module.ts               # Root module: imports all feature + shared modules
│   │
│   ├── modules/                    # Feature modules (domain-driven)
│   │   ├── billing-links/          # Seller CRUD for payment links
│   │   │   ├── billing-links.module.ts
│   │   │   ├── billing-links.controller.ts   # POST/GET/PATCH/DELETE (auth)
│   │   │   ├── billing-links.service.ts      # CRUD + Prisma queries
│   │   │   └── dto/
│   │   │       ├── create-billing-link.dto.ts
│   │   │       └── update-billing-link.dto.ts
│   │   │
│   │   ├── public-charge/          # Unauthenticated payer endpoint
│   │   │   ├── public-charge.module.ts
│   │   │   ├── public-charge.controller.ts   # POST /pay/:slug, GET /pay/:slug/info
│   │   │   ├── public-charge.service.ts      # Rate limit + idempotency + PSP call
│   │   │   └── dto/
│   │   │       └── submit-charge.dto.ts      # name, cpf, email, paymentMethod
│   │   │
│   │   ├── transactions/           # Seller views transaction history
│   │   │   ├── transactions.module.ts
│   │   │   ├── transactions.controller.ts    # GET /v1/billing-links/:id/transactions
│   │   │   └── transactions.service.ts       # Prisma: filter by sellerId + linkId
│   │   │
│   │   ├── auth/                   # JWT login, token issuance
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts            # POST /v1/auth/login
│   │   │   ├── auth.service.ts               # Validate credentials, sign JWT
│   │   │   └── dto/
│   │   │       └── login.dto.ts
│   │   │
│   │   ├── dashboard/              # Seller aggregate metrics
│   │   │   ├── dashboard.module.ts
│   │   │   ├── dashboard.controller.ts       # GET /v1/dashboard
│   │   │   └── dashboard.service.ts          # Prisma aggregates: totals by link
│   │   │
│   │   └── webhooks/               # Outbound webhook dispatch
│   │       ├── webhooks.module.ts
│   │       ├── webhooks.service.ts           # EventEmitter listener + HTTP dispatch
│   │       └── webhooks.controller.ts        # POST /v1/webhooks (register URL)
│   │
│   └── shared/                     # Cross-cutting infrastructure
│       ├── prisma/
│       │   ├── prisma.module.ts              # @Global() module, exports PrismaService
│       │   └── prisma.service.ts             # extends PrismaClient, OnModuleInit
│       │
│       ├── auth/
│       │   ├── jwt-auth.guard.ts             # Passport JWT guard
│       │   ├── jwt.strategy.ts               # Extract sub as sellerId
│       │   └── current-user.decorator.ts     # @CurrentUser() param decorator
│       │
│       ├── redis/
│       │   └── redis.module.ts               # ioredis provider, @Global()
│       │
│       ├── idempotency/
│       │   ├── idempotency.service.ts        # SET NX atomic check-or-save
│       │   └── idempotency.service.spec.ts
│       │
│       ├── rate-limit/
│       │   ├── rate-limiter.middleware.ts    # INCR+TTL per IP+slug
│       │   └── rate-limiter.middleware.spec.ts
│       │
│       ├── correlation/
│       │   └── correlation-id.middleware.ts  # Generate/propagate x-correlation-id
│       │
│       └── pii/
│           ├── pii-sanitizer.ts              # Static: safeBody(), redact name/cpf
│           └── pii-sanitizer.spec.ts
│
├── services/                       # Non-Node runtime services (polyglot)
│   └── dotnet-psp/                 # .NET 8 PSP integration service
│       ├── dotnet-psp.csproj
│       ├── Program.cs              # ASP.NET Core startup, port 5001
│       └── src/
│           ├── API/
│           │   └── Controllers/
│           │       └── InternalTransactionController.cs
│           ├── Application/
│           │   ├── DTOs/
│           │   ├── Interfaces/
│           │   └── UseCases/
│           ├── Domain/
│           │   ├── Entities/
│           │   ├── Enums/
│           │   └── Exceptions/
│           └── Infrastructure/
│               └── Persistence/    # EF Core PostgreSQL (replaces in-memory)
│
├── services/dotnet-psp-tests/      # xUnit test project (separate .csproj)
│
└── frontend/                       # React 18 + Vite (unchanged structure)
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── pages/
        │   ├── BillingLinks/
        │   ├── PublicCharge/
        │   └── Dashboard/
        ├── services/api.ts
        └── lib/
```

### Structure Rationale

- **`src/modules/`:** Feature-first grouping — each business domain (billing-links, public-charge, etc.) owns its controller, service, and DTOs. Modules declare explicit imports/exports; nothing is globally available unless `@Global()`. This is the WiteTec standard.
- **`src/shared/`:** Truly cross-cutting infrastructure only — PrismaModule, RedisModule, JWT guard, PiiSanitizer. No business logic here. Feature modules import what they need.
- **`prisma/`:** Lives at the monorepo root because NestJS (Node process) owns the PostgreSQL schema. The .NET service reads transactions it creates through Prisma-managed tables — not directly via Prisma ORM, but via EF Core pointing to the same DB.
- **`services/dotnet-psp/`:** Renamed from `dotnet-service/` to signal it is one of potentially many services. Named `dotnet-psp` to be descriptive. The `services/` top-level directory is the polyglot boundary — anything inside runs as an independent process.
- **`frontend/`:** Stays at root level, separate from `services/` because it is not a backend service. It consumes the NestJS API directly.

---

## Architectural Patterns

### Pattern 1: Global Shared Module (PrismaModule + RedisModule)

**What:** Mark infrastructure modules `@Global()` so every feature module can inject `PrismaService` or `RedisService` without explicit re-import.

**When to use:** For truly singleton infrastructure — one DB connection, one Redis client. Do NOT use `@Global()` for feature services.

**Trade-offs:** Simplifies DI across many modules; hides coupling if overused.

```typescript
// src/shared/prisma/prisma.module.ts
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

// src/shared/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

Feature module usage — no PrismaModule import needed since it is global:
```typescript
// src/modules/billing-links/billing-links.service.ts
@Injectable()
export class BillingLinksService {
  constructor(private prisma: PrismaService) {}
}
```

### Pattern 2: PSP Adapter Module (PspModule)

**What:** Isolate .NET service HTTP communication behind a NestJS `PspModule` that wraps `@nestjs/axios`. Feature modules inject `PspService` — they never call `HttpService` directly. This is the anti-corruption layer.

**When to use:** Any call to the .NET PSP service goes through this single module.

**Trade-offs:** Centralizes the HTTP contract; makes it easy to swap PSP provider or add retry/circuit-breaker logic without touching feature code.

```typescript
// src/shared/psp/psp.module.ts
@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        baseURL: config.get('PSP_BASE_URL'),   // http://dotnet-psp:5001
        timeout: 5000,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [PspService],
  exports: [PspService],
})
export class PspModule {}

// src/shared/psp/psp.service.ts
@Injectable()
export class PspService {
  constructor(private http: HttpService) {}

  async createTransaction(dto: CreateTransactionDto, correlationId: string) {
    const { data } = await firstValueFrom(
      this.http.post('/internal/transactions', dto, {
        headers: { 'x-correlation-id': correlationId },
      })
    );
    return data;
  }
}
```

### Pattern 3: Seller Isolation via JWT + Prisma Filter

**What:** `sellerId` is always read from `req.user.sub` (set by JwtStrategy), never from the request body. Every Prisma query for seller-owned resources includes `WHERE seller_id = sellerId`.

**When to use:** Every authenticated resource operation.

**Trade-offs:** Requires consistent discipline but completely prevents cross-tenant data leaks.

```typescript
// src/modules/billing-links/billing-links.service.ts
async findAll(sellerId: string) {
  return this.prisma.billingLink.findMany({
    where: { sellerId },          // mandatory seller filter
    orderBy: { createdAt: 'desc' },
  });
}
```

### Pattern 4: Atomic Idempotency with Redis SET NX

**What:** Before delegating to the PSP, `IdempotencyService.checkOrSave()` atomically checks and reserves the idempotency key using `SET NX EX`. If the key already exists, return the cached result immediately (HTTP 200 with `idempotent: true`).

**When to use:** The public charge endpoint. Required by business rule.

**Trade-offs:** Eliminates race condition of the PoC's `exists + save` pattern. TTL auto-expires keys after 24h.

### Pattern 5: EventEmitter for Webhook Dispatch

**What:** When the PSP returns a terminal status (approved/failed), `PublicChargeService` emits a domain event (`transaction.approved`, `transaction.failed`). `WebhooksService` listens and dispatches the seller-registered webhook URL asynchronously.

**When to use:** Webhook notification on status change.

**Trade-offs:** Decouples charge flow from webhook dispatch. EventEmitter is in-process (no broker), which is sufficient for v1 but will need Redis Pub/Sub or a queue at scale.

```typescript
// src/modules/public-charge/public-charge.service.ts
this.eventEmitter.emit('transaction.approved', { transactionId, sellerId, linkId });

// src/modules/webhooks/webhooks.service.ts
@OnEvent('transaction.approved')
async handleApproved(event: TransactionApprovedEvent) {
  const url = await this.getSellerWebhookUrl(event.sellerId);
  if (url) await this.dispatch(url, event);
}
```

---

## Data Flow

### Flow 1: Seller Creates Billing Link (Authenticated)

```
Seller Browser
    ↓ POST /v1/billing-links  (Bearer JWT)
CorrelationIdMiddleware  →  generate x-correlation-id
JwtAuthGuard             →  verify JWT, inject sellerId into req.user
BillingLinksController   →  validate DTO (ValidationPipe)
BillingLinksService      →  prisma.billingLink.create({ sellerId, slug, ... })
    ↓
PostgreSQL (billing_links table)
    ↓
Response 201 { id, slug, sellerId, amount, ... }
```

### Flow 2: Payer Submits Payment via Public URL (Unauthenticated)

```
Payer Browser
    ↓ POST /pay/:slug  (no auth, Idempotency-Key header required)
CorrelationIdMiddleware   →  generate/propagate x-correlation-id
RateLimiterMiddleware     →  Redis INCR key=rate:charge:<IP>:<slug>, reject 429 if >30/min
PublicChargeController    →  validate DTO, read Idempotency-Key header
PublicChargeService
    ├─ prisma.billingLink.findUnique({ where: { slug, status: ACTIVE } })  →  404 if not found or expired
    ├─ idempotencyService.checkOrSave(key)  →  return cached 200 if duplicate
    ├─ pspService.createTransaction({ billingLinkId, amount, payerName*, payerCpf* })
    │       ↓ POST /internal/transactions  (x-correlation-id header)
    │   .NET PspService (CorrelationIdMiddleware)
    │   CreateTransactionUseCase → Transaction.Create() → persist to PostgreSQL (EF Core)
    │   Response: { transactionId, status: PENDING, pixQrCode, pixCopyPaste }
    ├─ prisma.transaction.create(...)  →  store transaction record in Node's DB
    ├─ idempotencyService.save(key, result)  →  Redis SET NX EX 86400
    └─ eventEmitter.emit('transaction.created', ...)
    ↓
Response 201 { transactionId, status, pixQrCode, pixCopyPaste }

* payerName/payerCpf never logged — PiiSanitizer.safeBody() wraps all catch blocks
```

### Flow 3: PSP Callback / Status Update

```
.NET PspService (webhook from real PSP provider)
    ↓ PATCH /internal/transactions/:id/status
Transaction.Approve() or Transaction.Fail()  →  state machine guard
EF Core: update transaction status + updatedAt
    ↓
.NET calls back Node via HTTP: POST /v1/internal/psp-callback  (optional pattern)
    OR
Node polls dotnet-psp: GET /internal/transactions/:id
    ↓
PublicChargeService / WebhooksService
    ├─ prisma.transaction.update(status)
    └─ eventEmitter.emit('transaction.approved' | 'transaction.failed')
          ↓
      WebhooksService.dispatch(sellerWebhookUrl, payload)
```

### Flow 4: Seller Views Dashboard Metrics

```
Seller Browser
    ↓ GET /v1/dashboard  (Bearer JWT)
JwtAuthGuard  →  sellerId
DashboardService
    └─ prisma.billingLink.groupBy / aggregate
       { totalCharged, totalApproved, totalPending, perLink[] }
    ↓
Response 200 { metrics }
```

---

## Integration Points

### NestJS → .NET PSP Service

| Aspect | Detail |
|--------|--------|
| Transport | HTTP (axios via `@nestjs/axios`) |
| Base URL | `PSP_BASE_URL` env var (e.g., `http://dotnet-psp:5001`) |
| Tracing | `x-correlation-id` header on every outbound call |
| Error handling | Catch axios errors in `PspService`, wrap with typed `PspException`, PiiSanitizer before logging |
| Isolation | `PspModule` is the only NestJS module that knows the .NET URL; feature modules inject `PspService` only |
| Retry | v1: none. v2: add `axios-retry` inside `PspService` for idempotent retries |

### .NET PSP Service → PostgreSQL

| Aspect | Detail |
|--------|--------|
| ORM | EF Core 8 with Npgsql provider (replaces current in-memory repo) |
| Schema ownership | Prisma (Node) manages schema migrations; .NET reads/writes to shared tables |
| Transactions table | Both Node (Prisma) and .NET (EF Core) write to the same `transactions` table — Node stores the external view, .NET stores the domain aggregate |
| Recommendation | Separate tables: `transactions` (Prisma-owned, Node writes charge metadata) and `psp_transactions` (EF Core-owned, .NET writes PSP state) — keeps schema ownership clean |

### NestJS → Redis

| Aspect | Detail |
|--------|--------|
| Client | ioredis singleton via `RedisModule` (`@Global()`) |
| Key namespaces | `idempotency:charge:<key>`, `rate:charge:<IP>:<slug>` |
| Webhook queue | v1: EventEmitter (in-process). v2: Bull queue backed by Redis |

### Frontend → NestJS

| Aspect | Detail |
|--------|--------|
| Transport | HTTP REST via axios |
| Auth | JWT stored in localStorage; injected as `Authorization: Bearer <token>` |
| Public routes | `/pay/:slug` and `/pay/:slug/info` — no token required |

---

## Component Boundaries

```
frontend/                   →  src/main.ts (NestJS, port 3000)
src/modules/billing-links   →  src/shared/prisma  (PrismaService)
src/modules/billing-links   →  src/shared/auth    (JwtAuthGuard)
src/modules/public-charge   →  src/shared/psp     (PspService)
src/modules/public-charge   →  src/shared/redis   (IdempotencyService, RateLimiter)
src/modules/public-charge   →  src/modules/billing-links (link validation)
src/modules/public-charge   →  EventEmitter       (transaction events)
src/modules/webhooks        →  EventEmitter       (listener)
src/modules/webhooks        →  src/shared/prisma  (load seller webhook URLs)
src/modules/transactions    →  src/shared/prisma  (query psp_transactions)
src/modules/dashboard       →  src/shared/prisma  (aggregate queries)
src/shared/psp              →  services/dotnet-psp/ (HTTP, port 5001)
services/dotnet-psp/        →  PostgreSQL (EF Core, psp_transactions table)
src/shared/prisma           →  PostgreSQL (Prisma, all other tables)
src/shared/redis            →  Redis 7
```

**Boundaries that MUST NOT be crossed:**
- Feature modules must never call `HttpService` directly — only via `PspService`
- No module other than `src/shared/pii` should log raw payer data
- `sellerId` must never come from request body/query — always from `req.user.sub`
- `services/dotnet-psp/` must never be called from frontend directly — only via NestJS

---

## Build Order (Phase Dependencies)

The following order reflects hard dependencies — each item requires the previous to be functional:

1. **Monorepo scaffold** — Set up new directory structure, move files, install Nest 11 + Prisma. Nothing else works until this exists.

2. **`prisma/schema.prisma` + migrations** — Define `BillingLink`, `Transaction`, `Seller` models. All Prisma-dependent modules require this.

3. **`src/shared/`** — PrismaModule, RedisModule, PiiSanitizer, CorrelationMiddleware. All feature modules depend on shared infrastructure.

4. **`src/modules/auth`** — JWT login + JwtAuthGuard. All authenticated modules require guards.

5. **`src/modules/billing-links`** — Core seller resource. `public-charge` depends on link validation from here.

6. **`src/shared/psp` + `services/dotnet-psp/` (EF Core)** — PSP adapter + .NET persistence fix. `public-charge` depends on PSP call.

7. **`src/modules/public-charge`** — Payer-facing endpoint. Depends on billing-links, psp, redis, idempotency.

8. **`src/modules/transactions`** — Read-only seller view. Depends on Prisma transactions table populated by step 7.

9. **`src/modules/dashboard`** — Aggregate metrics. Depends on transactions data from step 7-8.

10. **`src/modules/webhooks`** — Outbound dispatch. Depends on EventEmitter events from step 7.

11. **`frontend/`** — Refactor React pages to match new API contracts (slug, real metrics, PIX QR, etc.). Depends on all API endpoints.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k sellers / 10k charges | Current monolith is fine. Redis + Postgres handle load easily. |
| 1k-10k sellers / 100k charges | Add connection pooling (PgBouncer). Redis cluster or Upstash. Bull queue for webhooks instead of EventEmitter. |
| 10k+ sellers / 1M+ charges | Split `public-charge` into separate NestJS app (NestJS monorepo mode with `apps/`). Scale .NET PSP service independently. Read replica for dashboard queries. |

**First bottleneck:** Dashboard aggregate queries — `GROUP BY seller_id` on large transaction tables. Mitigation: Prisma `$queryRaw` with indexed queries, or materialized views.

**Second bottleneck:** Webhook dispatch blocking charge response. Mitigation: Move to Bull queue in phase with webhooks.

---

## Anti-Patterns

### Anti-Pattern 1: Feature Module Calling .NET Directly

**What people do:** Inject `HttpService` in `PublicChargeService` and call `http://dotnet-psp:5001` inline.

**Why it's wrong:** Couples PSP URL, timeout config, and error handling to the feature module. Changing the PSP endpoint or adding retry logic requires editing charge code.

**Do this instead:** Always inject `PspService` from `PspModule`. Keep the HTTP wire details in one place.

### Anti-Pattern 2: Logging Raw Payer Data in Catch Blocks

**What people do:** `this.logger.error('Charge failed', JSON.stringify(payload))` where `payload` contains `name` and `cpf`.

**Why it's wrong:** Violates PII policy. CPF is a personally identifying number; logging it is a LGPD compliance violation.

**Do this instead:** Every catch block that touches charge data must call `PiiSanitizer.safeBody(payload)` before logging.

### Anti-Pattern 3: `seller_id` from Request Body

**What people do:** `POST /v1/billing-links` with `{ sellerId: "...", amount: 100 }` and trusting the body value.

**Why it's wrong:** Any authenticated user could forge another seller's ID and create/read their resources.

**Do this instead:** `@CurrentUser() user: JwtPayload` param decorator, read `user.sub` only.

### Anti-Pattern 4: `exists()` + `save()` for Idempotency

**What people do:** Check `redis.get(key)` first, then `redis.set(key, result)` as two separate commands.

**Why it's wrong:** Race condition — two concurrent requests with the same key both pass the `get` check before either sets the value.

**Do this instead:** `redis.set(key, value, 'NX', 'EX', 86400)` — single atomic operation. `null` return means duplicate.

### Anti-Pattern 5: TypeORM Entities Mixed with Prisma Schema

**What people do:** Keep `billing-link.entity.ts` TypeORM decorators while adding `schema.prisma`.

**Why it's wrong:** Dual ORM setup creates divergent schema definitions, migration conflicts, and doubles the mental model.

**Do this instead:** Complete the migration to Prisma before any feature work. Remove all TypeORM entities and `@Entity()` decorators. One ORM, one source of truth.

---

## Sources

- NestJS Modules documentation — https://docs.nestjs.com/modules (official, HIGH confidence)
- NestJS HttpModule / @nestjs/axios — https://github.com/nestjs/axios (official, HIGH confidence)
- Prisma + NestJS integration — https://www.prisma.io/docs/guides/frameworks/nestjs (official, HIGH confidence)
- NestJS monorepo structure article — https://medium.com/@nairi.abgaryan/stop-the-chaos-clean-folder-file-naming-guide-for-backend-nest-js-and-node-331fdc6400dc (MEDIUM confidence, verified against official docs)
- NestJS + .NET polyglot monorepo — https://mykeels.medium.com/monorepo-for-net-and-nodejs-workspaces-dca7716c16c6 (MEDIUM confidence)
- NestJS payment gateway adapter pattern — https://medium.com/@bouhouchchamseddine/building-a-scalable-payment-gateway-with-the-adapter-design-pattern-in-nestjs-fdb4e249e0a1 (MEDIUM confidence)
- NestJS EventEmitter for webhooks — https://docs.nestjs.com/techniques/events (official, HIGH confidence)
- Current codebase analysis — `.planning/codebase/ARCHITECTURE.md` + `.planning/codebase/STRUCTURE.md`

---

*Architecture research for: WIA-272 Billing Links monorepo refactor*
*Researched: 2026-04-16*
