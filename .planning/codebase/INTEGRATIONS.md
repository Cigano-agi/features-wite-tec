# External Integrations

**Analysis Date:** 2026-04-16

## APIs & External Services

**Internal .NET Service:**
- Service: WitetecBillingService (payment/transaction processor)
  - What it's used for: Transaction creation and processing for billing charges
  - Client: `axios` (HTTP client)
  - Base URL: Environment variable `DOTNET_SERVICE_URL` (default: `http://localhost:5001`)
  - Auth: Via `x-correlation-id` header for request tracing
  - Endpoint: `POST /internal/transactions` - Creates transactions from public charge requests
  - Location: `node-api/src/public-charge/public-charge.service.ts` (lines 56-60)

## Data Storage

**Databases:**
- PostgreSQL 15
  - Connection: `DATABASE_URL` environment variable
  - Default: `postgresql://postgres:postgres@localhost:5432/witetec`
  - Client: TypeORM with `pg` driver (Node.js)
  - Client: Npgsql with Entity Framework Core (C#/.NET)
  - Configuration: `node-api/src/app.module.ts` (TypeOrmModule setup)
  - Migrations: `db/migrations/` - Applied automatically on container startup
  - Entities: `BillingLink` entity in `node-api/src/billing-links/billing-link.entity.ts`

**Caching:**
- Redis 7
  - Connection: `REDIS_URL` environment variable
  - Default: `redis://localhost:6379`
  - Client: `ioredis` 5.3.2
  - Purpose: Idempotency key storage with TTL
  - Configuration: `node-api/src/shared/idempotency/idempotency.service.ts`
  - TTL: Configurable via `IDEMPOTENCY_TTL_SECONDS` environment variable (default: 86400 seconds)

**File Storage:**
- Not detected - No file storage service integration found

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based implementation
  - Implementation: Passport.js with JWT strategy
  - JWT Secret: Environment variable `JWT_SECRET`
  - Strategy: `passport-jwt` with Bearer token extraction from Authorization header
  - Location: `node-api/src/shared/auth/jwt.strategy.ts`
  - Guard: `node-api/src/shared/auth/jwt-auth.guard.ts`
  - Protected routes: Billing links management endpoints (`/v1/billing-links/*`)
  - Public routes: Public charge endpoint (`/v1/public/charge/:linkId`) - requires `Idempotency-Key` header instead of JWT

## Monitoring & Observability

**Error Tracking:**
- Not detected - No external error tracking service (Sentry, Rollbar, etc.) integrated

**Logs:**
- Console-based structured logging
  - Node.js: Console logs with context information
  - .NET: Serilog with console output
  - Correlation ID middleware: Adds `x-correlation-id` to all requests for distributed tracing
  - Location: `node-api/src/shared/correlation/correlation-id.middleware.ts`
  - PII Sanitization: `node-api/src/shared/pii/pii-sanitizer.ts` - Sanitizes logs to remove name/CPF (as per CLAUDE.md requirements)

## CI/CD & Deployment

**Hosting:**
- Docker Compose for local and containerized deployment
- Production deployment target: Inferred cloud-native (not specified in codebase)

**CI Pipeline:**
- Not detected - No GitHub Actions, GitLab CI, Jenkins, or other CI/CD configuration found

**Docker:**
- `docker-compose.yml` defines three services:
  - PostgreSQL 15-alpine
  - Redis 7-alpine
  - Infrastructure only - Node API and .NET service deployment not defined in compose file

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string (default provided)
- `REDIS_URL` - Redis connection URL (default provided)
- `DOTNET_SERVICE_URL` - Internal .NET service endpoint (default: `http://localhost:5001`)
- `JWT_SECRET` - Secret for JWT signing (default: `dev-secret-local`)
- `PUBLIC_CHARGE_DEFAULT_EMAIL` - Email used for public charges (default: `noreply@witetec.com`)
- `PUBLIC_CHARGE_DEFAULT_PHONE` - Phone used for public charges (default: `+5500000000000`)
- `RATE_LIMIT_PER_MINUTE` - Rate limiting threshold (default: 30)
- `IDEMPOTENCY_TTL_SECONDS` - Idempotency key expiration (default: 86400)
- `PORT` - Node API port (default: 3000)
- `ASPNETCORE_URLS` - .NET service URLs (default: `http://localhost:5001`)

**Secrets location:**
- Stored in `.env` file (not committed - listed in `.gitignore`)
- Template: `.env.example` checked into repository
- Development: Local `.env` with dev secrets
- Production: Environment variables or secrets management system (not detailed in codebase)

## Webhooks & Callbacks

**Incoming:**
- `POST /v1/public/charge/:linkId` - Public charge webhook endpoint
  - Purpose: Accept payment charge requests with Idempotency-Key header
  - Location: `node-api/src/public-charge/public-charge.controller.ts`
  - Auth: Idempotency-Key header (required, enforced via middleware)
  - Rate limiting: Applied via `RateLimiterMiddleware` at `node-api/src/shared/rate-limit/rate-limiter.middleware.ts`

**Outgoing:**
- `POST http://localhost:5001/internal/transactions` - Internal call to .NET service
  - Purpose: Process transaction creation
  - Headers: `x-correlation-id` for request tracing
  - Payload: Billing link ID, amount, payer info, metadata
  - Error handling: HTTP 503 (SERVICE_UNAVAILABLE) if .NET service is down
  - Location: `node-api/src/public-charge/public-charge.service.ts` (line 56)
  - Timeout: 10 seconds

## Rate Limiting

**Public Charge Endpoint:**
- Implementation: `node-api/src/shared/rate-limit/rate-limiter.middleware.ts`
- Applied to: `v1/public/charge/:linkId`
- Threshold: `RATE_LIMIT_PER_MINUTE` environment variable (default: 30 requests/minute)
- Storage: Likely Redis-based (verify in implementation)

## Idempotency

**Implementation:**
- Service: `node-api/src/shared/idempotency/idempotency.service.ts`
- Storage: Redis cache
- Key header: `Idempotency-Key` (required on public charge endpoint)
- TTL: `IDEMPOTENCY_TTL_SECONDS` (default: 86400 seconds = 24 hours)
- Purpose: Prevent duplicate charges on public charge endpoint
- Behavior: Returns cached response if idempotency key exists

---

*Integration audit: 2026-04-16*
