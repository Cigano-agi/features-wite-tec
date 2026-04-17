# Codebase Concerns

**Analysis Date:** 2026-04-16

## Tech Debt

**In-Memory Repository in Production Path:**
- Issue: `InMemoryTransactionRepository` is a temporary implementation marked for replacement before production but currently used in dotnet-service application layer
- Files: `dotnet-service/src/Infrastructure/Persistence/InMemoryTransactionRepository.cs`
- Impact: All transaction data is lost on service restart, no persistence across deployments, idempotency cannot be guaranteed in production
- Fix approach: Replace with PostgreSQL EntityFramework Core implementation using the existing PostgreSQL database in `docker-compose.yml`

**Incomplete Metrics Implementation:**
- Issue: Metrics endpoint returns hardcoded zeros for `total_approved` and `total_pending` instead of actual transaction counts
- Files: `node-api/src/billing-links/billing-links.service.ts` (line 48-49)
- Impact: Seller dashboard metrics are non-functional and misleading
- Fix approach: Add cross-schema join query between `billing_links` and transactions table in dotnet-service, or expose transaction metrics endpoint from dotnet-service to Node API

**Type Safety Issues with `any` Types:**
- Issue: Widespread use of `any` type in controllers and services bypasses TypeScript type checking
- Files: 
  - `node-api/src/billing-links/billing-links.controller.ts` - all request handlers use `req: any`
  - `node-api/src/public-charge/public-charge.controller.ts` - result type cast with `as any`
  - `node-api/src/public-charge/public-charge.service.ts` - multiple `as any` casts (lines 40, 62, 78)
  - `node-api/src/shared/auth/jwt.strategy.ts` - payload parameter uses `any`
  - `node-api/src/shared/correlation/correlation-id.middleware.ts` - request cast with `as any`
- Impact: Type errors can slip through to production, IDE autocomplete unavailable, harder to refactor safely
- Fix approach: Create proper types for authenticated request objects (`AuthenticatedRequest` interface extending Express Request with user property)

**Default Credentials in Examples:**
- Issue: `.env.example` contains hardcoded weak JWT secret and default PostgreSQL password
- Files: `.env.example` (lines 2, 7)
- Impact: Developers might use example values in development, increasing risk of copy-paste errors to production
- Fix approach: Generate strong random values, document that these must be overridden per environment

## Security Considerations

**JWT Secret Fallback to Development Value:**
- Risk: When `JWT_SECRET` environment variable is missing, application falls back to hardcoded `'dev-secret-local'`
- Files: `node-api/src/shared/auth/jwt.strategy.ts` (line 11)
- Current mitigation: Only applicable to development, would fail in production if env var missing
- Recommendations: 
  1. Throw error on startup if `JWT_SECRET` is not set instead of using fallback
  2. Add startup validation in `main.ts` to verify critical env vars exist
  3. Document that `dev-secret-local` is ONLY for local testing with unencrypted tokens

**PII Data Stored Without Validation:**
- Risk: Payer name and CPF collected in public charge endpoint are stored as-is without encryption
- Files: `dotnet-service/src/Domain/Entities/Transaction.cs` (lines 11-14), `node-api/src/public-charge/public-charge.service.ts` (lines 46-47)
- Current mitigation: PiiSanitizer redacts in logs, but stored data in database is plaintext
- Recommendations:
  1. Encrypt CPF field before storage in Transaction entity
  2. Consider database-level encryption for PII columns
  3. Add data retention policy (automatic deletion after X days)

**Default Email and Phone in Public Charge:**
- Risk: Payer email and phone are replaced with fixed default values instead of accepting user input
- Files: `node-api/src/public-charge/public-charge.service.ts` (lines 27-28, 48-49)
- Current mitigation: Input validation on name/CPF in DTO, but contact info is hardcoded
- Recommendations:
  1. Accept email and phone as optional parameters in `PublicChargeDto`
  2. Validate email format and phone format if provided
  3. Document why defaults are needed (if by design, e.g., email gateway limitations)

**Idempotency Key Storage Without Validation:**
- Risk: Idempotency keys stored in Redis with user-provided values without uniqueness constraints
- Files: `node-api/src/shared/idempotency/idempotency.service.ts`, `node-api/src/public-charge/public-charge.controller.ts` (line 15)
- Current mitigation: TTL set to 24 hours per `IDEMPOTENCY_TTL_SECONDS`
- Recommendations:
  1. Add server-side idempotency key generation as backup if client doesn't provide
  2. Validate idempotency key format (UUID or specific pattern)
  3. Log attempts to use duplicate keys for fraud detection

**Correlation ID propagated without validation:**
- Risk: Correlation ID from client headers accepted as-is without format validation
- Files: `node-api/src/shared/correlation/correlation-id.middleware.ts` (line 10)
- Current mitigation: Fallback to UUID if missing, passed to dotnet-service
- Recommendations: Validate format (UUID or alphanumeric pattern) to prevent injection attacks or excessively long strings

## Performance Bottlenecks

**Redundant Database Query in Metrics:**
- Problem: Each metrics request triggers two separate queries (one for count, one to get link data)
- Files: `node-api/src/billing-links/billing-links.service.ts` (lines 46-50)
- Cause: `getMetrics()` counts only active links but doesn't leverage query optimization
- Improvement path: Add database index on `(seller_id, status)` for active links count, consider caching metrics with short TTL in Redis

**Redis Connection Per Middleware:**
- Problem: Both `RateLimiterMiddleware` and `IdempotencyService` create separate Redis connections
- Files: `node-api/src/shared/rate-limit/rate-limiter.middleware.ts` (line 14), `node-api/src/shared/idempotency/idempotency.service.ts` (line 12)
- Cause: No singleton Redis service, each creates independent connection pool
- Improvement path: Create `RedisService` singleton, inject into middleware and services to reuse connections

**Synchronous JSON Serialization in IdempotencyService:**
- Problem: JSON parse/stringify on every idempotency check for potentially large result objects
- Files: `node-api/src/shared/idempotency/idempotency.service.ts` (lines 26, 29-30, 39)
- Cause: No schema validation or compression of stored data
- Improvement path: Consider storing only transaction ID and checking transaction state from database instead of full result cache

**Axios Instance Not Reused:**
- Problem: Each `PublicChargeService.charge()` call creates fresh axios instance via `axios.post()`
- Files: `node-api/src/public-charge/public-charge.service.ts` (line 56)
- Cause: No configured axios instance, using default
- Improvement path: Create singleton axios instance with connection pooling, timeout configuration, and retry logic

**Missing Database Migration Versioning:**
- Problem: Migration scripts in `db/migrations/` are executed on startup but no version tracking
- Files: `docker-compose.yml` (line 15), `db/migrations/`
- Cause: Using Docker init scripts without schema_migrations table
- Improvement path: Implement Flyway or similar migration tool with version table to prevent re-running migrations

## Fragile Areas

**Public Charge Endpoint Coupling to .NET Service:**
- Files: `node-api/src/public-charge/public-charge.service.ts` (lines 56-59)
- Why fragile: Direct HTTP call to dotnet-service with timeout, no circuit breaker or retry logic, single failure point
- Safe modification: Add exponential backoff retry wrapper, implement circuit breaker pattern (e.g., using `opossum` package), add fallback response
- Test coverage: Only tests mocked axios, no integration tests with actual dotnet-service communication

**Metrics Endpoint Design Flaw:**
- Files: `node-api/src/billing-links/billing-links.service.ts`, `node-api/src/metrics/metrics.controller.ts`
- Why fragile: Two controllers expose same metrics endpoint (`v1/billing-links/metrics`), incomplete data requires future changes
- Safe modification: Choose single endpoint location, add transaction metrics from dotnet-service before deploying
- Test coverage: No tests for metrics endpoint, missing validation of response schema

**Hardcoded Environment Defaults:**
- Files: `node-api/src/public-charge/public-charge.service.ts` (lines 26-28), `node-api/src/shared/auth/jwt.strategy.ts` (line 11), `node-api/src/shared/rate-limit/rate-limiter.middleware.ts` (line 15), `node-api/src/app.module.ts` (line 14)
- Why fragile: Any change to environment variable names requires code changes and redeployment
- Safe modification: Create centralized config service that validates all env vars on startup
- Test coverage: Tests use mocked environment, actual startup validation missing

**Idempotency Race Condition:**
- Files: `node-api/src/public-charge/public-charge.service.ts` (lines 37-41), `node-api/src/shared/idempotency/idempotency.service.ts` (lines 24-31)
- Why fragile: Check-then-act pattern between idempotency check and transaction creation - two requests could both pass check before either saves
- Safe modification: Use Redis Lua script or atomic operation for check-and-set in single step (`checkOrSave` method exists but not used in charge flow)
- Test coverage: Happy path tested but concurrent request scenario not covered

**Error Handling in Public Charge:**
- Files: `node-api/src/public-charge/public-charge.service.ts` (lines 61-68)
- Why fragile: Catches all axios errors but only logs sanitized body without actual error details - difficult to debug
- Safe modification: Log error type (timeout, connection refused, 4xx, 5xx) separately before returning generic error
- Test coverage: Only tests ECONNREFUSED scenario, missing timeout and HTTP error status tests

## Scaling Limits

**Hardcoded Pagination and Query Limits:**
- Current capacity: `findAllBySeller()` returns all billing links without pagination (line 21 in billing-links.service.ts)
- Limit: When seller has 10,000+ active links, endpoint returns all in single response, causes memory exhaustion and timeout
- Scaling path: Add pagination with `limit` and `offset` parameters, default to 50 per page

**Redis Single-Instance:**
- Current capacity: Single Redis container (port 6379) for both idempotency and rate limiting
- Limit: All connections to single instance, no replication or failover
- Scaling path: Implement Redis Sentinel for HA, separate Redis instances for different concerns, add Redis cluster for horizontal scaling

**Database Index Coverage:**
- Current capacity: Primary key only, sequential scan on large tables
- Limit: Queries like `findAllBySeller()` scan full table when seller_id is not indexed
- Scaling path: Add indexes on `(seller_id, created_at)` and `(seller_id, status)`, review query plans

**Rate Limiting Per IP Without Distributed State:**
- Current capacity: Rate limiter tracks per IP address, effective only within single Node API instance
- Limit: If Node API is load-balanced, each instance has independent counter (3x instances = 3x limit)
- Scaling path: Implement distributed rate limiter keyed by user ID (from JWT) instead of IP, ensure enforced at Redis level

## Test Coverage Gaps

**Public Charge Controller Not Tested:**
- What's not tested: Controller logic for idempotency key validation (line 18-20), response status handling for 409 case (line 24-25)
- Files: `node-api/src/public-charge/public-charge.controller.ts`
- Risk: 400 response when idempotency key missing could pass but 409 response for duplicate request might not serialize correctly
- Priority: High - public API endpoint critical for data consistency

**Billing Links Controller Not Tested:**
- What's not tested: Authorization checks for PATCH/DELETE operations, seller_id isolation
- Files: `node-api/src/billing-links/billing-links.controller.ts`
- Risk: One seller could modify/delete another seller's links if authorization fails silently
- Priority: High - direct security issue

**Rate Limiter Middleware Missing Integration Tests:**
- What's not tested: Actual Redis interaction, concurrent requests, TTL behavior, IP address edge cases
- Files: `node-api/src/shared/rate-limit/rate-limiter.middleware.spec.ts` (uses mocked Redis)
- Risk: Rate limiter might not work correctly in production, no actual rate limiting despite passing tests
- Priority: High - DOS protection critical

**Metrics Endpoint Missing Tests:**
- What's not tested: Actual metrics calculation, response schema validation
- Files: `node-api/src/metrics/metrics.controller.ts`
- Risk: Incomplete data (always 0 for approved/pending) accepted as correct
- Priority: Medium - impacts reporting but not critical path

**Frontend API Integration Not Tested:**
- What's not tested: Token refresh, 401 handling, error responses from backend
- Files: `frontend/src/services/api.ts`
- Risk: UI might not handle auth failures gracefully
- Priority: Medium - impacts user experience

**Database Migration Scripts Not Tested:**
- What's not tested: Schema correctness, data types, constraints
- Files: `db/migrations/`
- Risk: Migration failures in production
- Priority: Medium - setup phase but impacts all deployments

**dotnet-service Not Tested in Node API Context:**
- What's not tested: Integration between Node API and dotnet-service, actual HTTP communication
- Files: Cross-service integration in `node-api/src/public-charge/public-charge.service.ts`
- Risk: Services work in isolation but fail when integrated
- Priority: High - critical data flow

## Dependencies at Risk

**Axios ^1.6.0 (Old Version):**
- Risk: Version 1.6.0 is from 2023, likely has unpatched vulnerabilities, newer versions have breaking changes in progress handling
- Impact: Security vulnerabilities in HTTP client, potential CVE exposure
- Migration plan: Update to axios ^1.7.x (stable), test timeout and retry behavior with new version

**TypeORM ^0.3.17 (Maintenance Mode):**
- Risk: Version 0.3.x is end-of-life, version 0.4.x exists but with breaking changes, migration effort required
- Impact: No security patches, long-term support ending
- Migration plan: Plan upgrade to 0.4.x or consider migration to Drizzle/Prisma - test all database operations

**Passport-JWT ^4.0.1 (Potential Compatibility):**
- Risk: Old major version, passport ecosystem has evolved, newer authentication patterns available
- Impact: May not integrate cleanly with newer NestJS versions
- Migration plan: Consider NestJS JWT module directly, or upgrade passport-jwt with compatibility testing

**Outdated dev dependencies (Jest, TypeScript, ESLint):**
- Risk: TypeScript 5.3.3 and Jest 29.7.0 have newer stable versions with bug fixes
- Impact: Missing bug fixes and performance improvements
- Migration plan: Run `npm update` for dev deps, test against all environments

## Missing Critical Features

**No API Versioning Strategy:**
- Problem: `v1` hardcoded in routes but no versioning documentation or deprecation plan
- Blocks: Cannot introduce breaking changes without impacting existing clients
- Impact: Locked into current API contracts indefinitely

**No Audit Logging:**
- Problem: PiiSanitizer prevents logging of sensitive data but no audit trail for who did what when
- Blocks: Cannot track billing link creation/modifications for compliance or fraud investigation
- Impact: Non-compliant with financial regulations, no repudiation capability

**No Webhook Support:**
- Problem: No way to notify external systems when billing link status changes or transaction completes
- Blocks: Third-party integrations must poll for updates
- Impact: Inefficient integrations, delayed notifications

**No Bulk Operations:**
- Problem: Sellers must create/update/inactivate billing links one at a time
- Blocks: Sellers with 1000+ links cannot bulk import or update
- Impact: Poor UX for enterprise customers

**No Rate Limit Bypass for Authenticated Users:**
- Problem: Rate limiter applies to all public charge requests regardless of whether user is registered
- Blocks: Legitimate sellers cannot do bulk charges without hitting rate limit
- Impact: Functional limitation for high-volume sellers

**No Transaction Idempotency without Key:**
- Problem: Idempotency requires client to provide key, no server-side idempotency generation
- Blocks: Legacy systems without idempotency key generation cannot use safely
- Impact: Risky double-charge scenarios in production

**No Health Check Endpoint:**
- Problem: No `/health` endpoint to check service status and dependencies
- Blocks: Kubernetes and load balancers cannot determine if service is healthy
- Impact: Crashes not detected, traffic continues to failed instances

## Known Bugs

**Metrics Endpoint Route Duplication:**
- Symptoms: GET metrics available at both `/v1/billing-links/metrics` (from BillingLinksController) and `/v1/billing-links/metrics` (from MetricsController)
- Files: `node-api/src/billing-links/billing-links.controller.ts` (line 22), `node-api/src/metrics/metrics.controller.ts` (line 10)
- Trigger: Both controllers mounted on same path, NestJS picks one (undefined behavior on which)
- Workaround: Remove MetricsController or change its route

**Idempotency Check Implementation Inconsistency:**
- Symptoms: `PublicChargeService` uses `exists()` method but `IdempotencyService` provides both `exists()` and `checkOrSave()` - inconsistent usage patterns
- Files: `node-api/src/public-charge/public-charge.service.ts` (line 38), `node-api/src/shared/idempotency/idempotency.service.ts` (lines 24, 37)
- Trigger: Mismatched error handling between check and save steps
- Workaround: Use `checkOrSave()` atomic operation to guarantee atomicity

**Amount Field Uses Integer Not Decimal:**
- Symptoms: Billing amounts stored as integers - unclear if in cents or units, no documentation
- Files: `node-api/src/billing-links/billing-link.entity.ts` (line 14), `dotnet-service/src/Domain/Entities/Transaction.cs` (line 10)
- Trigger: Display or calculation of amounts could lose precision
- Workaround: Document that amounts are in cents (e.g., 10000 = 100.00), add type-level documentation

**Request Type Casting Loses JWT Properties:**
- Symptoms: Controllers use `@Req() req: any` then access `req.user.sellerId`, but TypeScript doesn't know user property exists
- Files: `node-api/src/billing-links/billing-links.controller.ts` (lines 13-14, etc.)
- Trigger: IDE won't autocomplete, runtime error if user property missing (though NestJS guards prevent this)
- Workaround: Create `JwtPayload` interface and extend Request type properly

---

*Concerns audit: 2026-04-16*
