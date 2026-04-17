# Codebase Structure

**Analysis Date:** 2026-04-16

## Directory Layout

```
witetec-billing-links-master/
├── docker-compose.yml                   # PostgreSQL 15 + Redis 7 services
├── .env.example                         # Environment variable template
├── README.md                            # Full project documentation
├── CLAUDE.md                            # Project constraints and commands
│
├── db/                                  # Database schemas and migrations
│   └── migrations/
│       └── 001_billing_links.sql        # Billing links table, indexes, triggers
│
├── node-api/                            # NestJS backend (public API)
│   ├── package.json                     # Dependencies, test/dev scripts
│   ├── tsconfig.json                    # TypeScript configuration
│   ├── jest.config.js                   # Jest test runner config
│   ├── .env.example                     # Service-specific env vars
│   └── src/
│       ├── main.ts                      # Bootstrap (ValidationPipe, port 3000)
│       ├── app.module.ts                # Root module, middleware registration
│       │
│       ├── billing-links/               # Authenticated seller endpoints
│       │   ├── billing-links.controller.ts     # POST/GET/PATCH/DELETE routes
│       │   ├── billing-links.service.ts        # BillingLink CRUD + metrics
│       │   ├── billing-link.entity.ts          # TypeORM entity (billing_links table)
│       │   ├── billing-links.module.ts         # Module registration
│       │   └── dto/
│       │       ├── create-billing-link.dto.ts  # name validation: @IsNotEmpty, @IsPositive
│       │       └── update-billing-link.dto.ts  # Partial DTO, optional fields
│       │
│       ├── public-charge/               # Public (unauthenticated) charge endpoint
│       │   ├── public-charge.controller.ts     # POST /v1/public/charge/:linkId
│       │   ├── public-charge.service.ts        # Charge flow, dotnet-service delegation
│       │   ├── public-charge.module.ts         # Module registration
│       │   └── dto/
│       │       └── public-charge.dto.ts        # name, cpf validation
│       │
│       ├── metrics/                     # Metrics aggregation endpoint
│       │   ├── metrics.controller.ts    # GET /v1/billing-links/metrics
│       │   └── metrics.module.ts        # Module registration
│       │
│       └── shared/                      # Cross-cutting middleware, utilities
│           ├── auth/
│           │   ├── jwt-auth.guard.ts    # Passport JWT guard (protects /v1/billing-links routes)
│           │   └── jwt.strategy.ts      # JWT extraction and payload validation
│           │
│           ├── correlation/
│           │   └── correlation-id.middleware.ts  # Generate/propagate x-correlation-id
│           │
│           ├── idempotency/
│           │   ├── idempotency.service.ts        # Redis SETNX, TTL management
│           │   └── idempotency.service.spec.ts   # Unit tests
│           │
│           ├── rate-limit/
│           │   ├── rate-limiter.middleware.ts    # Per-IP+link rate limit (Redis INCR)
│           │   └── rate-limiter.middleware.spec.ts # Unit tests
│           │
│           └── pii/
│               ├── pii-sanitizer.ts     # [REDACTED] field replacement utility
│               └── pii-sanitizer.spec.ts # Unit tests (field lists, redaction)
│
├── dotnet-service/                      # .NET 8 transaction domain service
│   ├── dotnet-service.csproj            # Project file, dependencies (xUnit, logging)
│   ├── Program.cs                       # ASP.NET Core startup
│   └── src/
│       ├── API/
│       │   ├── Controllers/
│       │   │   └── InternalTransactionController.cs  # POST /internal/transactions
│       │   └── Middleware/
│       │       └── CorrelationIdMiddleware.cs        # Extract/generate x-correlation-id
│       │
│       ├── Application/
│       │   ├── DTOs/
│       │   │   ├── CreateTransactionRequest.cs       # Input: billingLinkId, amount, payer fields
│       │   │   └── CreateTransactionResponse.cs      # Output: transactionId, status, amount
│       │   │
│       │   ├── Interfaces/
│       │   │   └── ITransactionRepository.cs         # Save, abstraction for persistence
│       │   │
│       │   └── UseCases/
│       │       └── CreateTransactionUseCase.cs       # Business logic: create + persist transaction
│       │
│       ├── Domain/
│       │   ├── Entities/
│       │   │   └── Transaction.cs                    # Aggregate root, state machine
│       │   │
│       │   ├── Enums/
│       │   │   └── TransactionStatus.cs              # Pending | Approved | Failed
│       │   │
│       │   └── Exceptions/
│       │       └── InvalidTransactionTransitionException.cs  # Guards state transitions
│       │
│       └── Infrastructure/
│           └── Persistence/
│               └── InMemoryTransactionRepository.cs  # Current: in-memory dict (DEV ONLY)
│
├── dotnet-service-tests/                # xUnit test project (separate .csproj)
│   ├── dotnet-service-tests.csproj
│   ├── UseCases/
│   │   └── CreateTransactionUseCaseTests.cs
│   └── Controllers/
│       └── InternalTransactionControllerTests.cs
│
├── frontend/                            # React 18 + TypeScript + Vite
│   ├── package.json                     # Dependencies, scripts (dev, build, test)
│   ├── vite.config.ts                   # Vite bundler config, port 5173
│   ├── tsconfig.json                    # TypeScript configuration
│   ├── vitest.config.ts                 # Vitest test runner config
│   └── src/
│       ├── main.tsx                     # React root, BrowserRouter, Routes
│       ├── index.css                    # Global styles (Tailwind)
│       │
│       ├── pages/
│       │   ├── BillingLinks/
│       │   │   └── index.tsx            # Seller dashboard (list, create, edit, delete)
│       │   │                             # Authenticated via stored JWT token
│       │   │
│       │   └── PublicCharge/
│       │       └── index.tsx            # Payer form at /pay/:linkId
│       │                                 # Public, unauthenticated
│       │                                 # Fetches link metadata, submits charge
│       │
│       ├── services/
│       │   └── api.ts                   # Axios client, endpoints (create, list, charge, etc.)
│       │
│       ├── lib/
│       │   ├── types.ts                 # TypeScript interfaces for API contracts
│       │   └── format.ts                # Utility functions (currency formatting, etc.)
│       │
│       └── __tests__/
│           ├── setup.ts                 # Test configuration (vi setup, mocks)
│           ├── BillingLinksList.test.tsx # Component tests
│           └── PublicChargePage.test.tsx # Public form tests
│
└── .planning/
    └── codebase/
        ├── ARCHITECTURE.md              # This layer analysis
        └── STRUCTURE.md                 # Directory layout (you are here)
```

## Directory Purposes

**Root:**
- Purpose: Project orchestration, infrastructure definition
- Contains: Docker Compose (Postgres + Redis), environment templates, documentation

**db/migrations/:**
- Purpose: Schema version control
- Contains: SQL migration files numbered sequentially
- Key files: `001_billing_links.sql` creates billing_links table with seller_id index, status check constraint, auto-updated_at trigger
- Committed: Yes
- Generated: No

**node-api/src/:**
- Purpose: NestJS application code
- Contains: Controllers, services, entities, middleware, DTOs, guards
- Entry point: `main.ts` (bootstrap)
- Database: TypeORM + PostgreSQL
- Cache/State: ioredis for idempotency and rate limiting

**node-api/src/billing-links/:**
- Purpose: Seller-authenticated CRUD for billing link resources
- Contains: Controller (routes), Service (queries), Entity (schema), DTOs (validation)
- Access control: JwtAuthGuard on controller level; sellerId filter in all queries

**node-api/src/public-charge/:**
- Purpose: Public (no auth) payment submission
- Contains: Controller (public routes), Service (charge orchestration)
- Dependencies: BillingLinksService (link validation), IdempotencyService (duplicate prevention), axios (dotnet-service call)
- No authentication guard; relies on link existence check

**node-api/src/shared/:**
- Purpose: Cross-cutting infrastructure
- Subfolders:
  - `auth/` — JWT/Passport integration
  - `correlation/` — Request tracing middleware
  - `idempotency/` — Redis-backed request deduplication
  - `rate-limit/` — Per-IP rate limiting middleware
  - `pii/` — PII field redaction utility

**dotnet-service/src/:**
- Purpose: Transaction domain service (internal only)
- Architecture: Hexagonal (ports & adapters) with clear domain/application/infrastructure layers
- Entry point: Program.cs (ASP.NET Core bootstrap)
- Currently: In-memory persistence (must be replaced with EF Core + PostgreSQL before production)

**dotnet-service/src/Domain/:**
- Purpose: Business logic enforcement
- Contains: Transaction aggregate, state machine, validation exceptions
- No infrastructure dependencies; pure C# domain logic

**dotnet-service/src/Application/:**
- Purpose: Use case orchestration, DTOs, repository interface
- Contains: CreateTransactionUseCase (create + save), DTOs (request/response contracts), repository interface (persistence abstraction)
- Depends on: Domain entities, repository interface (injected)

**dotnet-service/src/Infrastructure/:**
- Purpose: Persistence implementation
- Contains: InMemoryTransactionRepository (dev/test), will hold EF Core repository (production)
- ITransactionRepository interface lives in Application/ for inversion of control

**dotnet-service-tests/:**
- Purpose: xUnit test suite (separate project)
- Contains: UseCase tests, Controller tests
- Runs: `cd dotnet-service-tests && dotnet test`

**frontend/src/:**
- Purpose: React application
- Entry point: `main.tsx` (ReactDOM root, router setup)
- Pages: BillingLinks (dashboard), PublicCharge (payment form)
- Services: api.ts (Axios client wrapping Node-API calls)

**frontend/src/lib/:**
- Purpose: Shared utilities
- Contains: TypeScript interfaces (API contracts), formatting utilities (currency, date)

**frontend/src/__tests__/:**
- Purpose: Vitest-based component tests
- Contains: Component unit tests with mocked API
- Runs: `cd frontend && npm test`

## Key File Locations

**Entry Points:**

| File | Purpose |
|------|---------|
| `node-api/src/main.ts` | NestJS bootstrap, ValidationPipe setup, listen on port 3000 |
| `frontend/src/main.tsx` | React root, BrowserRouter, route definitions |
| `dotnet-service/Program.cs` | ASP.NET Core startup, middleware registration, listen on port 5001 |

**Configuration:**

| File | Purpose |
|------|---------|
| `.env.example` | Template for environment variables (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.) |
| `node-api/tsconfig.json` | TypeScript compiler options |
| `frontend/vite.config.ts` | Vite bundler config (dev port, build output) |
| `dotnet-service/dotnet-service.csproj` | .NET project dependencies and build config |

**Core Logic:**

| File | Purpose |
|------|---------|
| `node-api/src/billing-links/billing-links.service.ts` | BillingLink CRUD, seller isolation, metrics aggregation |
| `node-api/src/public-charge/public-charge.service.ts` | Charge flow: link validation, idempotency check, dotnet-service delegation |
| `dotnet-service/src/Domain/Entities/Transaction.cs` | Transaction aggregate, state machine (Pending→Approved/Failed) |
| `dotnet-service/src/Application/UseCases/CreateTransactionUseCase.cs` | Use case: create transaction, log with correlation ID, persist |

**Shared Infrastructure:**

| File | Purpose |
|------|---------|
| `node-api/src/shared/correlation/correlation-id.middleware.ts` | Generate/propagate x-correlation-id across requests and logs |
| `node-api/src/shared/auth/jwt.strategy.ts` | JWT extraction, payload validation, seller_id injection |
| `node-api/src/shared/idempotency/idempotency.service.ts` | Redis SETNX for duplicate detection, TTL management |
| `node-api/src/shared/rate-limit/rate-limiter.middleware.ts` | Per-IP rate limiter, Redis INCR counter, 30 req/min default |
| `node-api/src/shared/pii/pii-sanitizer.ts` | Redact name, cpf, payerName, payerCpf, pan, cvv before logging |

**Database:**

| File | Purpose |
|------|---------|
| `db/migrations/001_billing_links.sql` | CREATE TABLE billing_links with seller_id index, status enum, auto-update trigger |
| `node-api/src/billing-links/billing-link.entity.ts` | TypeORM entity mapping to billing_links table |

**Testing:**

| File | Purpose |
|------|---------|
| `node-api/src/billing-links/billing-links.service.spec.ts` | Service unit tests (CRUD, seller isolation) |
| `node-api/src/shared/idempotency/idempotency.service.spec.ts` | Idempotency service tests (SETNX behavior) |
| `frontend/src/__tests__/BillingLinksList.test.tsx` | React component tests (list, create, delete flows) |
| `dotnet-service-tests/UseCases/CreateTransactionUseCaseTests.cs` | Use case tests (transaction creation, logging) |

## Naming Conventions

**Files:**

- Controllers: `{feature}.controller.ts` (e.g., `billing-links.controller.ts`)
- Services: `{feature}.service.ts` (e.g., `billing-links.service.ts`)
- Entities: `{feature}.entity.ts` (e.g., `billing-link.entity.ts`)
- DTOs: `{action}-{feature}.dto.ts` (e.g., `create-billing-link.dto.ts`)
- Middleware: `{concern}.middleware.ts` (e.g., `correlation-id.middleware.ts`)
- Tests: `{feature}.spec.ts` (e.g., `billing-links.service.spec.ts`)
- .NET Classes: PascalCase with suffix (e.g., `CreateTransactionUseCase`, `InternalTransactionController`)

**Directories:**

- Feature modules: lowercase-hyphenated (e.g., `billing-links/`, `public-charge/`)
- Shared utilities: lowercase-hyphenated (e.g., `correlation/`, `rate-limit/`)
- DTOs: `dto/` subfolder inside feature
- Domain layers: `Domain/`, `Application/`, `Infrastructure/` (DDD naming in .NET)

## Where to Add New Code

**New authenticated endpoint:**

1. Create feature directory: `node-api/src/{feature}/`
2. Create controller: `node-api/src/{feature}/{feature}.controller.ts` with `@UseGuards(JwtAuthGuard)`
3. Create service: `node-api/src/{feature}/{feature}.service.ts` (inject BillingLinksService if seller isolation needed)
4. Create DTOs: `node-api/src/{feature}/dto/{action}-{feature}.dto.ts` with class-validator decorators
5. Create module: `node-api/src/{feature}/{feature}.module.ts`, import TypeOrmModule if database access needed
6. Register module in `node-api/src/app.module.ts` imports array
7. Extract `seller_id` from `req.user.sellerId` (set by JWT middleware)
8. All database queries: filter `WHERE seller_id = :sellerId`
9. Write tests in `node-api/src/{feature}/{feature}.service.spec.ts` and `{feature}.controller.spec.ts`

**New public endpoint:**

1. Create feature directory or add to `node-api/src/public-charge/`
2. Create controller without `@UseGuards(JwtAuthGuard)`
3. Validate link existence via `BillingLinksService.findActiveById()` before processing
4. If charge-like, add `@Headers('idempotency-key')` validation
5. Write tests with no authentication mocking

**New domain entity in dotnet-service:**

1. Create entity in `dotnet-service/src/Domain/Entities/{Entity}.cs`
2. Create repository interface in `dotnet-service/src/Application/Interfaces/I{Entity}Repository.cs`
3. Create use case in `dotnet-service/src/Application/UseCases/{Action}{Entity}UseCase.cs`
4. Create controller in `dotnet-service/src/API/Controllers/{Entity}Controller.cs` with `/internal/{endpoint}` route
5. Inject correlation ID and log with it
6. Implement in-memory repository in `dotnet-service/src/Infrastructure/Persistence/InMemory{Entity}Repository.cs` (dev only)
7. Write tests in `dotnet-service-tests/` matching directory structure

**New React page:**

1. Create page component: `frontend/src/pages/{Feature}/index.tsx`
2. Add route in `frontend/src/main.tsx` Routes
3. Import and use `api` client from `frontend/src/services/api.ts` for Node-API calls
4. Store JWT token in localStorage (convention: look at existing BillingLinksPage implementation)
5. Write tests in `frontend/src/__tests__/{Feature}.test.tsx`
6. Use Vitest with mocked api.ts via vi.mock()

**New utility/helper:**

1. Shared logic across services: `node-api/src/shared/{concern}/{utility}.ts`
2. Shared logic across pages: `frontend/src/lib/{utility}.ts`
3. PII-sensitive: Always use `PiiSanitizer.safeBody()` before logging

## Special Directories

**.planning/codebase/:**
- Purpose: GSD mapping documentation
- Contains: ARCHITECTURE.md, STRUCTURE.md (this file), and generated docs (CONVENTIONS.md, TESTING.md, STACK.md, INTEGRATIONS.md, CONCERNS.md)
- Generated: Yes (by GSD mapper agent)
- Committed: Yes (part of project)

**node-api/src/shared/:**
- Purpose: Cross-cutting concerns shared by all controllers/services
- Not a feature; middleware, utilities, guards only
- No database entities here (those belong in feature directories)
- Middleware registered in `app.module.ts` with scope (all routes or specific)

**dotnet-service/src/Domain/:**
- Purpose: Pure business logic with no infrastructure dependencies
- Should be testable without mocking HTTP, database, or external services
- Exceptions belong here (not in controllers)
- Entities are aggregate roots, not simple records

---

*Structure analysis: 2026-04-16*
