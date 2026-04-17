# Architecture

**Analysis Date:** 2026-04-16

## Pattern Overview

**Overall:** Layered multi-service architecture with clear separation between public-facing API surface (Node.js) and internal transaction domain service (.NET). Frontend independently consumes the public API.

**Key Characteristics:**
- **Service boundary at product/domain divide** — Node-API owns HTTP surface, authentication, rate limiting, idempotency; dotnet-service owns transaction lifecycle and state machine logic
- **Stateless services** — Both backends delegate persistence to PostgreSQL and transient state to Redis
- **Correlation ID tracing** — End-to-end request tracking across two services and multiple stores
- **PII-safe error handling** — Personal data (name, CPF) never persists in logs even on exception

## Layers

**Presentation (Frontend):**
- Purpose: Seller dashboard (billing link management) and public payment page (unauthenticated payer interface)
- Location: `frontend/src/`
- Contains: React pages, API service client, UI components, tests
- Depends on: Node-API (`http://localhost:3000`)
- Used by: End users (sellers and payers)

**API Gateway / Product Layer (Node-API):**
- Purpose: HTTP entry point, authentication enforcement, idempotency guarantee, rate limiting, public surface contract
- Location: `node-api/src/`
- Contains: Controllers, request DTOs, middleware, guard chains, PostgreSQL ORM bindings
- Depends on: PostgreSQL (billing_links table), Redis (idempotency, rate limit counters), dotnet-service (internal transactions)
- Used by: Frontend, external callers via public API

**Domain / Business Logic Layer (dotnet-service):**
- Purpose: Transaction aggregate enforcement, state machine validation, write-once persistence
- Location: `dotnet-service/src/Domain/`, `dotnet-service/src/Application/`
- Contains: Entity aggregate roots, use cases, repository interface, validation logic
- Depends on: In-memory or EF Core repository (currently in-memory for dev)
- Used by: Node-API via HTTP `/internal/transactions`

**Infrastructure Layer (dotnet-service):**
- Purpose: Persistence mechanism, external service integration
- Location: `dotnet-service/src/Infrastructure/`
- Contains: Repository implementation (currently in-memory, must replace before production)
- Depends on: Transaction entity contract
- Used by: Application use cases

**Cross-Cutting Concerns (both services):**
- `shared/auth/` — JWT verification, seller identity extraction
- `shared/correlation/` — Request correlation ID generation and propagation
- `shared/idempotency/` — Redis-backed idempotency guard (SETNX atomic)
- `shared/rate-limit/` — Per-IP rate limiting with Redis counter
- `shared/pii/` — Automatic scrubbing of personal data from logs

## Data Flow

**Seller creates billing link:**

1. Frontend submits POST to `POST /v1/billing-links` with JWT bearer token
2. Node-API CorrelationIdMiddleware generates/reads correlation ID
3. JwtAuthGuard verifies token, injects `sellerId` into request context
4. BillingLinksController calls BillingLinksService.create()
5. Service creates entity and persists to PostgreSQL billing_links table
6. Response includes link ID, seller_id, amount, description, active=true, created_at
7. Correlation ID echoed in response headers

**Payer submits charge via public URL:**

1. Frontend (unauthenticated) renders public form at `/pay/:linkId`
2. Payer enters name and CPF, submits POST to `POST /v1/public/charge/:linkId`
3. Request must include `Idempotency-Key` header (UUID)
4. Node-API CorrelationIdMiddleware runs (generates ID if missing)
5. RateLimiterMiddleware applies rate limit using IP+link as key in Redis
6. PublicChargeController invokes PublicChargeService.charge()
7. Service calls BillingLinksService.findActiveById() to validate link exists and is active
8. Service calls IdempotencyService.exists() to check if same key was processed
   - If key exists in Redis: return 409 with cached result and `idempotent: true`
   - If key is new: proceed to step 9
9. Service posts payload to `POST /internal/transactions` on dotnet-service with x-correlation-id header
10. dotnet-service CreateTransactionController logs with correlation ID
11. CreateTransactionUseCase.ExecuteAsync() creates Transaction aggregate via factory
12. Transaction is marked Pending, assigned ID, and persisted to in-memory repo
13. Response returns transactionId, status (pending), amount
14. Node-API saves result to Redis with idempotency key and TTL of 24 hours
15. Returns 201 with transaction record

**Metrics aggregation (incomplete):**

1. Frontend calls `GET /v1/billing-links/metrics` with JWT
2. BillingLinksService.getMetrics() queries database for:
   - Active link count for seller (query succeeds)
   - Total approved and pending counts (hardcoded to 0 — requires transaction aggregation from dotnet-service)
3. Returns metrics object with placeholder values for approved/pending

**State Transitions (dotnet-service domain):**

1. Transaction created in Pending state via `Transaction.Create()`
2. State transitions guarded by validate-before-move pattern:
   - `Approve()` — throws InvalidTransactionTransitionException unless current status is Pending
   - `Fail()` — throws InvalidTransactionTransitionException unless current status is Pending
3. UpdatedAt timestamp updated on every transition
4. No multiple transitions of same transaction possible without catching exception

## Key Abstractions

**BillingLink (TypeORM Entity):**
- Purpose: Represents a shareable payment URL generated by a seller
- Examples: `node-api/src/billing-links/billing-link.entity.ts`
- Pattern: ORM-mapped table entity with lifecycle hooks (createdAt auto-set, updatedAt trigger on DB)
- Properties: id (UUID), sellerId (UUID), amount (cents), description, status (active/inactive), timestamps
- Invariants: seller_id required, status restricted to enum, seller_id indexed for query performance

**Transaction (DDD Aggregate):**
- Purpose: Core business rule enforcer — only valid state transitions allowed
- Examples: `dotnet-service/src/Domain/Entities/Transaction.cs`
- Pattern: Private constructor, static factory (Create), validated state machine via method guards
- Properties: transactionId, billingLinkId, amount, payerName, payerCpf, payerEmail, payerPhone, status, metadata, createdAt, updatedAt
- Invariants: Only Pending→Approved or Pending→Failed allowed; transition violations throw InvalidTransactionTransitionException

**IdempotencyService:**
- Purpose: Atomically store and retrieve request results keyed by Idempotency-Key header
- Examples: `node-api/src/shared/idempotency/idempotency.service.ts`
- Pattern: Redis SETNX (set-if-not-exists) for atomic check-or-create; TTL expiration for auto-cleanup
- Key space: `idempotency:charge:<Idempotency-Key>`
- Behavior: checkOrSave() returns null if new, returns cached result if duplicate

**RateLimiterMiddleware:**
- Purpose: Enforce per-minute charge request limit per IP+link pair
- Examples: `node-api/src/shared/rate-limit/rate-limiter.middleware.ts`
- Pattern: Redis INCR counter with TTL; reject if counter > limit
- Key space: `rate:charge:<IP>`
- Behavior: Increments counter, sets 60-second expiration on first use; rejects at 31st request (limit=30)

**CorrelationIdMiddleware:**
- Purpose: Generate or propagate x-correlation-id across request/response and downstream calls
- Examples: `node-api/src/shared/correlation/correlation-id.middleware.ts`
- Pattern: Middleware extracts from request headers or generates UUID; attaches to req object; injects into outbound HTTP headers
- Behavior: Ensures single ID tracks request through all services and log entries

**PiiSanitizer:**
- Purpose: Strip personal data fields (name, cpf, payerName, payerCpf, pan, cvv) before logging
- Examples: `node-api/src/shared/pii/pii-sanitizer.ts`
- Pattern: Static utility with field redaction list; used in all catch blocks
- Behavior: Replaces PII field values with '[REDACTED]' before serializing to log/error response

## Entry Points

**Node-API Main:**
- Location: `node-api/src/main.ts`
- Triggers: `npm run start:dev` or production start script
- Responsibilities: NestJS bootstrap, ValidationPipe registration (whitelist=true, forbidNonWhitelisted=true), listen on PORT (default 3000)

**Frontend Main:**
- Location: `frontend/src/main.tsx`
- Triggers: `npm run dev` or build
- Responsibilities: React root mount, router setup with two routes (/ → BillingLinksPage, /pay/:linkId → PublicChargePage)

**dotnet-service Entry:**
- Location: `dotnet-service/` (Program.cs, implicit in .NET project)
- Triggers: `dotnet run` or published binary execution
- Responsibilities: ASP.NET Core startup, middleware registration, controller discovery, listen on port 5001

**Billing Links Controller:**
- Location: `node-api/src/billing-links/billing-links.controller.ts`
- Routes:
  - POST `/v1/billing-links` (create, auth required)
  - GET `/v1/billing-links` (list all by seller, auth required)
  - GET `/v1/billing-links/metrics` (aggregates, auth required)
  - PATCH `/v1/billing-links/:id` (update, auth required)
  - DELETE `/v1/billing-links/:id` (inactivate, auth required)
- Responsibilities: Extract sellerId from JWT, delegate to service, validate access control

**Public Charge Controller:**
- Location: `node-api/src/public-charge/public-charge.controller.ts`
- Routes:
  - POST `/v1/public/charge/:linkId` (submit payment, public)
  - GET `/v1/billing-links/public-info/:linkId` (fetch link details for form, public)
- Responsibilities: Enforce Idempotency-Key header, validate input DTO, coordinate with IdempotencyService and PublicChargeService

**Internal Transaction Controller:**
- Location: `dotnet-service/src/API/Controllers/InternalTransactionController.cs`
- Routes: POST `/internal/transactions` (internal only)
- Responsibilities: Extract correlation ID from header, invoke CreateTransactionUseCase, return 201

## Error Handling

**Strategy:** Synchronous exception throwing with type-safe guard clauses and PII redaction on all HTTP error paths.

**Patterns:**

- **Authentication failures** — JwtAuthGuard.handleRequest() throws UnauthorizedException if token invalid
- **Seller isolation** — Service layer findByIdAndSeller() throws NotFoundException if link not found or seller_id mismatch (guards all PATCH/DELETE)
- **Invalid state transitions** — Transaction.Approve()/Fail() throw InvalidTransactionTransitionException if pre-condition fails
- **Validation errors** — NestJS ValidationPipe rejects DTO whitelist violations with 400
- **Rate limit exceeded** — RateLimiterMiddleware returns 429 before reaching controller
- **Idempotency** — PublicChargeController returns 409 with idempotent=true if key exists
- **External service failure** — PublicChargeService catches axios errors, PiiSanitizer.safeBody() redacts payload, returns 503 with correlation ID
- **PII protection** — Every catch block in service layer calls PiiSanitizer before returning error response

## Cross-Cutting Concerns

**Logging:** Both services emit structured JSON logs (NestJS built-in, .NET ILogger). Correlation ID included on every entry for request tracing.

**Validation:** 
- Frontend: Client-side form validation (CPF format, required fields)
- Node-API: ValidationPipe (DTO class-validator decorators) rejects non-whitelisted fields at middleware layer
- dotnet-service: Implicit via domain aggregate — invalid state throws exception

**Authentication:**
- JWT verification on all authenticated routes via Passport strategy (`JwtStrategy`)
- Seller ID extracted from token `sub` claim, injected into request context
- No seller_id read from request body or query params
- Token secret: `JWT_SECRET` env var (default dev-secret-local)

**Authorization:**
- Row-level: All queries filter `WHERE seller_id = :sellerId`
- Link access: findByIdAndSeller() ensures authenticated seller owns the link before PATCH/DELETE
- Public endpoints: Public charge and public-info have no authentication check

---

*Architecture analysis: 2026-04-16*
