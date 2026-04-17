# Domain Pitfalls

**Domain:** Billing/payment link platform — brownfield refactor (NestJS 10+TypeORM → NestJS 11+Prisma, PIX+card payments, Node→.NET→PSP flow)
**Researched:** 2026-04-16
**Sources:** Prisma migration docs, NestJS v11 migration guide, Redis idempotency patterns (Airbnb, Redis.io), PIX API docs (Efí/EFIPay, Cielo, Celcoin), LGPD compliance, production post-mortems

---

## Critical Pitfalls

Mistakes that cause rewrites, double charges, or compliance violations.

---

### Pitfall 1: Idempotency Race Condition — check-then-act pattern

**What goes wrong:** The PoC's `public-charge.service.ts` calls `idempotencyService.exists()` then later `idempotencyService.save()` as two separate Redis operations. Two concurrent requests with the same `Idempotency-Key` can both pass the `exists()` check (both see null), both proceed to create a transaction in the .NET service, and both call `save()` — resulting in two real charges on the PSP and two transactions in the database, with only the second one stored under the idempotency key.

**Why it happens:** Non-atomic check-then-act. The window between `GET` and `SET` in Redis is visible to concurrent requests. This is the exact race condition Redis `SET NX` was designed to prevent.

**Consequences:** Double charges to payer's PIX/card. Duplicate transactions in .NET DB with the same `billingLinkId`. No reconciliation mechanism exists to detect or reverse this. The second `save()` silently overwrites the first — the second duplicate response becomes the "canonical" one.

**Prevention:**
- Use `SET key value EX ttl NX` (one atomic command) — the `checkOrSave()` method already exists on `IdempotencyService` but is NOT called in `charge()`. Fix: replace the `exists()` + later `save()` pair with a single `checkOrSave()` call **before** the HTTP call to .NET.
- Correct flow: `checkOrSave()` → if existing returned, respond immediately (idempotent replay); if null returned, proceed to charge. Do NOT store result after the fact.
- Warning sign: any code path where Redis `GET` and `SET` for the same key are separated by business logic or I/O.

**Phase:** Migration phase — fix before any production traffic hits the charge endpoint.

---

### Pitfall 2: Redis Key Eviction Silently Kills Idempotency Guarantees

**What goes wrong:** If Redis is configured with any LRU/LFU eviction policy (the default `allkeys-lru` in many managed Redis installations), idempotency keys can be silently evicted under memory pressure. After eviction, a replayed request with the same `Idempotency-Key` passes through as a fresh charge — no error, no warning, silent double charge.

**Why it happens:** Redis eviction is designed for cache use cases. Idempotency keys are not cache — they are guarantees. The default eviction policies treat all keys equally and will remove idempotency keys if memory fills.

**Consequences:** Double charges resume silently in production whenever Redis approaches `maxmemory`. No observable error — charge "succeeds" twice. Only reconciliation against PSP reveals the discrepancy.

**Prevention:**
- Set `maxmemory-policy noeviction` on the Redis instance (or the namespace/database used for idempotency).
- If noeviction is not possible (shared Redis), use a dedicated Redis DB index for idempotency keys and set `maxmemory` high enough with alerting before capacity is reached.
- Alternative: store idempotency records in PostgreSQL with a unique constraint — more durable, survives Redis restart.
- Warning sign: Redis `maxmemory` configured without also specifying `maxmemory-policy noeviction`.

**Phase:** Infrastructure/migration phase. Must be verified before production deployment.

---

### Pitfall 3: Prisma Column Rename Treated as Drop+Create — Silent Data Loss

**What goes wrong:** When adding the full `BillingLink` model (slug, allowPix, allowCard, FIXED/OPEN type, expiresAt, etc.), if any existing column is renamed in `schema.prisma` (e.g., `description` renamed to `name`), Prisma Migrate generates `ALTER TABLE DROP COLUMN` + `ALTER TABLE ADD COLUMN` — not `RENAME COLUMN`. All data in the renamed column is destroyed in production.

**Why it happens:** Prisma cannot infer rename intent from schema diff alone. It sees a missing old field and a new field, and generates destructive SQL.

**Consequences:** All existing billing link descriptions (or any other renamed column) are wiped in production. Migration is irreversible once applied.

**Prevention:**
- Always use `prisma migrate --create-only` for schema changes that might involve renames, then manually inspect and edit the generated SQL before applying.
- Use the expand-and-contract pattern: (1) add new column, (2) deploy code writing to both, (3) backfill, (4) switch reads to new column, (5) remove old column.
- For `@map` renames (Prisma field name ≠ DB column name), use `@map("original_column_name")` — this renames only the Prisma model field, leaving DB column untouched.
- Run `prisma migrate diff` before `migrate deploy` in CI to audit generated SQL.
- Warning sign: any `schema.prisma` change where a field disappears and a new field appears with the same semantic meaning.

**Phase:** Schema migration phase — mandatory pre-review of all generated migrations.

---

### Pitfall 4: PII in Logs via Error Paths Not Covered by PiiSanitizer

**What goes wrong:** The current `PiiSanitizer` covers a hardcoded list of field names (`name`, `cpf`, `payerName`, `payerCpf`, `pan`, `cvv`). In error paths, TypeScript `catch (err: any)` blocks can log `err.config`, `err.request`, or `err.response.data` from axios — all of which contain the full request payload including `payerName` and `payerCpf`. NestJS's default exception filter also logs unhandled exceptions with their context, which may include the full DTO. During the Prisma migration, new error surfaces appear (Prisma validation errors, connection errors) that log model data.

**Why it happens:** The sanitizer must be applied explicitly. Any new code path that logs an error object without calling `PiiSanitizer.sanitize()` first is a leak. LGPD (Lei Geral de Proteção de Dados) treats CPF as personal data — logging it constitutes a recordable data incident and triggers 72-hour ANPD notification obligations.

**Consequences:** CPF and payer name appear in plaintext in application logs, log aggregators (Datadog, CloudWatch, etc.), and any log exports. LGPD penalties up to 2% of annual Brazil revenue, maximum 50M BRL.

**Prevention:**
- Add a NestJS global exception filter that applies `PiiSanitizer` to all logged error payloads before they reach the logger.
- Add PII field coverage for Prisma-specific error structures: `meta.target`, `meta.cause`, and any fields named after Prisma model properties.
- Test: write a unit test that verifies no value from a `PublicChargeDto` (name/cpf) appears in any log output across happy path and all error paths.
- Extend `PII_FIELDS` to cover camelCase variants, snake_case variants, and nested structures (not just flat object keys).
- Warning sign: any catch block that logs `err` directly without `PiiSanitizer.safeBody()`.

**Phase:** Foundation phase — must be implemented before the public endpoint accepts real payer data.

---

### Pitfall 5: .NET Service Returns 5xx but Transaction Was Processed

**What goes wrong:** When the .NET service responds with a 5xx error (timeout, network blip, unhandled exception), the Node service throws `payment_processor_unavailable` and logs the failure. But the .NET service may have already persisted the transaction and sent the charge to the PSP before the error response was generated. The Node side retries (or the payer retries), and a second charge is created.

**Why it happens:** HTTP is not transactional. A 5xx response means "something went wrong on the server" — it does not mean "the operation did not happen." This is explicitly documented in PIX API specs: "a failure in the 5XX range may occur but the transaction may have been successfully processed."

**Consequences:** Double charge to payer. Two transactions for the same billing link + payer intent. Idempotency key was not yet saved in Redis (the `save()` call in the PoC only happens after a successful response), so the second attempt creates a new idempotency entry.

**Prevention:**
- Move idempotency key reservation to **before** the .NET HTTP call (atomic `SET NX`), not after.
- On 5xx from .NET, do NOT immediately retry. Return the error to the client and let the client retry with the same `Idempotency-Key` — the idempotency layer will then handle deduplication.
- Add a query endpoint on .NET: `GET /internal/transactions/{idempotencyKey}` so Node can verify whether a transaction was created before deciding whether to retry.
- Implement exponential backoff with jitter for retries, never immediate retry on 5xx.
- Warning sign: any code that retries an HTTP POST to .NET without first checking whether the operation succeeded.

**Phase:** Charge flow implementation phase.

---

## Moderate Pitfalls

---

### Pitfall 6: NestJS v11 Express v5 Routing — Wildcard Routes Break Silently

**What goes wrong:** NestJS 11 ships with Express v5, which changes wildcard route syntax. The `*` wildcard character no longer works as a greedy match standalone — it must be a named parameter like `*path`. Routes using the old pattern resolve to 404 silently. Middleware mounted with `'*'` (e.g., `CorrelationIdMiddleware`) stops applying to all routes.

**Why it happens:** Breaking change in `path-to-regexp` library upgrade within Express v5. `setGlobalPrefix` also drops RegExp support.

**Consequences:** Correlation ID middleware fails to attach to some routes. Any catch-all routes (e.g., 404 handler, global prefix handling) silently stop matching.

**Prevention:**
- After NestJS upgrade, audit every `apply(...).forRoutes('*')` call in middleware — change to `forRoutes({ path: '*path', method: RequestMethod.ALL })`.
- Verify `setGlobalPrefix('v1')` still works (simple prefix strings are fine; RegExp patterns are not).
- Run full e2e test suite after the v10→v11 upgrade before migrating any other component.
- Warning sign: 404 responses from routes that existed and worked in v10.

**Phase:** NestJS upgrade phase — must be verified with tests immediately after version bump.

---

### Pitfall 7: Prisma Client Not Generated in CI/Docker — Runtime Crash

**What goes wrong:** Prisma generates its typed client into `node_modules/.prisma/client` at build time via `prisma generate`. If the Docker image or CI pipeline only runs `npm install` without `prisma generate`, the app starts and crashes with: `Error: @prisma/client did not initialize yet. Please run "prisma generate"`. This happens silently in production deployments if the build pipeline is not updated during migration.

**Why it happens:** Unlike TypeORM (which derives types from decorators at runtime), Prisma requires a code generation step. Teams migrating from TypeORM miss this because TypeORM had no equivalent requirement.

**Consequences:** Production deployment fails immediately on startup. CI passes (build compiles TypeScript fine) but runtime fails.

**Prevention:**
- Add `"postinstall": "prisma generate"` to `package.json` scripts — runs automatically after `npm install` including in CI.
- Add explicit `RUN npx prisma generate` step in Dockerfile after `npm install`.
- Add a smoke test to CI that imports `@prisma/client` and asserts it loads without error.
- Warning sign: `npm ci` in CI without a subsequent `prisma generate` call.

**Phase:** Migration phase — day one of Prisma adoption.

---

### Pitfall 8: Prisma Interactive Transactions + Connection Pool Exhaustion

**What goes wrong:** Prisma's interactive transactions (`prisma.$transaction(async (tx) => {...})`) hold a database connection open for the entire transaction duration. In NestJS, if request handlers use long-running transactions (e.g., fetching link + processing + saving), and load spikes, the pool (default: `min(cpuCount+1, 10)` connections) exhausts. All subsequent queries hang waiting for a connection, and the entire service becomes unresponsive.

**Why it happens:** Prisma's connection pool is much smaller by default than TypeORM's (TypeORM defaults to 10 connections; Prisma defaults to CPU count + 1, often 5-6 on small containers). Teams migrating from TypeORM with `synchronize: true` never encountered this because TypeORM managed connections more aggressively.

**Consequences:** Service-wide hang under load. All endpoints (not just the slow ones) stop responding. Kubernetes liveness probes fail, triggering restarts that don't help because new instances also exhaust the pool.

**Prevention:**
- Keep interactive transactions as short as possible: only wrap the operations that require atomicity.
- Configure pool size explicitly: `datasource db { url = env("DATABASE_URL") }` + `DATABASE_URL` with `?connection_limit=20&pool_timeout=10`.
- Use a single shared `PrismaService` (extends `PrismaClient`) as a NestJS singleton — multiple PrismaClient instances = multiple pools.
- Warning sign: interactive transactions that include HTTP calls or slow operations; multiple `PrismaClient` instantiations.

**Phase:** Migration phase and ongoing — enforce in code review.

---

### Pitfall 9: PIX QR Code Expiration Not Surfaced to Payer

**What goes wrong:** Dynamic PIX QR codes (cobrança dinâmica) expire — typically within 30-60 minutes, but the exact expiration is set by the PSP and must be communicated to the user. If the frontend shows a QR code but never displays or re-checks the expiration time, the payer may scan an expired QR code and get a confusing error from their bank app, with no UI feedback explaining what happened.

**Why it happens:** The PoC's `ChargeResult` interface does not include `expiresAt` or PIX-specific fields. The frontend has no expiration countdown or re-generate flow.

**Consequences:** Failed payments with no user-actionable recovery. Payer abandons. Seller loses transaction. Customer support burden.

**Prevention:**
- The .NET service must return `pixExpiresAt`, `pixQrCode` (base64 image), and `pixCopiaECola` (copy-paste string) from the PSP in the `CreateTransactionResponse`.
- The frontend must display a countdown to expiration and a "Generate new QR code" button (which re-calls `POST /pay/:slug` with a new idempotency key).
- Validate `expiresAt` in the Node API response schema and return it to the frontend.
- Warning sign: `ChargeResult` type that does not include PIX-specific fields.

**Phase:** PIX integration phase.

---

### Pitfall 10: PIX txid Collision — Non-Unique Transaction IDs at PSP

**What goes wrong:** The Brazilian Central Bank PIX spec (BACEN) requires that each `txid` is globally unique per PSP per merchant. The `txid` must be 26-35 alphanumeric characters. If the .NET service generates `txid` from `Guid.NewGuid()`, it likely exceeds 35 characters when formatted as a standard UUID string (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` = 36 chars with dashes, 32 without). Some PSPs reject txids that don't match `[A-Za-z0-9]{26,35}`.

**Why it happens:** `Guid.NewGuid().ToString()` without `.Replace("-", "")` produces a 36-character string with dashes. BACEN spec does not allow dashes.

**Consequences:** PSP rejects the charge request with a 400/422 error. Payment fails. The error message may be cryptic and not surfaced properly to the end user.

**Prevention:**
- Generate txid as `Guid.NewGuid().ToString("N")` (produces 32 lowercase hex chars, no dashes — within BACEN spec).
- Alternatively use a nanoid-style 26-character alphanumeric string.
- Add a unit test that validates txid format against the BACEN regex `^[a-zA-Z0-9]{26,35}$`.
- Warning sign: txid generation using default `ToString()` on a Guid without "N" format specifier.

**Phase:** PIX integration phase — verify before connecting to real PSP sandbox.

---

### Pitfall 11: Webhook Delivery Is At-Least-Once — Consumer Must Be Idempotent

**What goes wrong:** PSPs (and the webhook dispatch system this project will build) guarantee at-least-once delivery. A webhook for `transaction.approved` may be delivered 2-3 times if the consumer doesn't respond with 200 within the timeout window. If the webhook consumer (seller's system or WiteTec dashboard update) is not idempotent, the same approval triggers duplicate notifications, duplicate state updates, or duplicate seller payouts.

**Why it happens:** Exactly-once delivery is mathematically impossible in distributed systems. Timeouts cause the provider to retry even if the consumer processed the event successfully.

**Consequences:** Seller dashboard shows incorrect total_approved counts (doubled). Automated outbound notifications (email/SMS) sent multiple times to payer. Downstream integrations receive duplicate events.

**Prevention:**
- Store processed webhook delivery IDs in a deduplification table with a unique constraint. On re-delivery, return 200 immediately without reprocessing.
- Use database upsert (`ON CONFLICT DO NOTHING`) for state transitions — idempotent by nature.
- The outbound webhook dispatcher (to sellers) must also include a delivery ID header so sellers can deduplicate.
- Warning sign: webhook handler that does not check whether the event has already been processed.

**Phase:** Webhook implementation phase.

---

### Pitfall 12: .NET InMemoryTransactionRepository in Production Path

**What goes wrong:** `InMemoryTransactionRepository` is the only `ITransactionRepository` implementation registered in the .NET DI container. All transactions are stored in a `ConcurrentDictionary` in memory. A service restart (deployment, crash, OOM kill) destroys all transaction history. Idempotency guarantees in .NET are meaningless because the transaction lookup after restart always returns "not found."

**Why it happens:** PoC shortcut. The interface exists and is well-defined, but the EF Core + PostgreSQL implementation was deferred.

**Consequences:** Zero persistence. Transaction audit trail is lost on every deploy. Cannot reconcile with PSP. Cannot answer "did this transaction succeed?" after a restart.

**Prevention:**
- The EF Core implementation must be the first deliverable in the .NET migration phase — before any other .NET feature work.
- Add a startup check: if `ASPNETCORE_ENVIRONMENT` is `Production`, throw if `InMemoryTransactionRepository` is registered.
- Warning sign: any deployment to a non-local environment with `InMemoryTransactionRepository` still in the DI container.

**Phase:** .NET persistence phase — block 1 of .NET work.

---

### Pitfall 13: seller_id From Body/Query Instead of JWT

**What goes wrong:** If `seller_id` is accepted from the request body or query string (even as a fallback), a logged-in seller can impersonate another seller by passing a different `seller_id`. The `BillingLinksService` uses `seller_id` as a WHERE filter — if the value is attacker-controlled, seller isolation breaks.

**Why it happens:** TypeScript's `req: any` pattern makes it easy to accidentally read `req.body.sellerId` instead of `req.user.sub`. During migration, type rewrites can accidentally introduce this regression.

**Consequences:** Seller A can create billing links attributed to Seller B. Seller A can read, modify, or delete Seller B's links. Financial fraud vector.

**Prevention:**
- Create `AuthenticatedRequest` interface (`extends Request { user: { sub: string } }`) and use it in all controller signatures — removes the `req: any` escape hatch.
- Add a test for every authenticated endpoint: call with JWT for seller A but body containing seller B's ID — assert that the resource is still attributed to seller A.
- Code review gate: any use of `req.body.sellerId` or `req.query.sellerId` is an automatic rejection.
- Warning sign: any controller accessing `req.body.seller*` or `req.query.seller*`.

**Phase:** Authentication/security hardening phase.

---

## Minor Pitfalls

---

### Pitfall 14: Amount Field Ambiguity — Cents vs. Units

**What goes wrong:** `billing_link.amount` and `Transaction.Amount` are typed as `int` but documentation does not specify the unit. Is 10000 = R$100.00 or R$10,000.00? PIX and credit card PSPs typically require amounts in cents (integer, no decimal). Display requires dividing by 100. A mismatch between storage unit and PSP expectation causes charges 100x too large or too small.

**Prevention:**
- Document in the `BillingLink` and `Transaction` models: amounts are **always in centavos (cents)**. `10000 = R$100,00`.
- Add `@Min(1)` and `@Max(99999999)` (R$999,999.99) validation to `CreateBillingLinkDto.amount`.
- Add a comment in the Prisma schema: `/// Amount in cents (centavos). 10000 = R$100,00`.
- Warning sign: any display code that renders `amount` directly without dividing by 100.

**Phase:** Schema definition phase.

---

### Pitfall 15: Correlation ID Header — Injection via Client-Supplied Value

**What goes wrong:** `x-correlation-id` is accepted from client request headers without format validation. An attacker can supply a value like `../../../etc/passwd` or a 10,000-character string. This value is propagated to the .NET service and logged by both services. Log injection is possible if the logger doesn't escape the value.

**Prevention:**
- Validate correlation ID in middleware: must match `/^[a-zA-Z0-9-]{8,64}$/`. If invalid, generate a fresh UUID and ignore the client-supplied value.
- Add a max length check: reject values longer than 64 characters.
- Warning sign: middleware that passes `req.headers['x-correlation-id']` directly to logger without validation.

**Phase:** Foundation phase.

---

### Pitfall 16: Metrics Endpoint Route Duplication — Non-Deterministic Resolution

**What goes wrong:** Two NestJS controllers (`BillingLinksController` and `MetricsController`) both register `GET /v1/billing-links/metrics`. NestJS resolves to whichever controller was registered first in the module — this is non-deterministic and can change with module refactoring. Tests may pass with one controller while production uses the other.

**Prevention:**
- During migration: delete `MetricsController` entirely; keep metrics logic only in `BillingLinksController`.
- If metrics need their own controller, change the route to `/v1/metrics/billing-links`.
- Warning sign: `nest-router` or module import ordering change causing metrics to return 0 where it previously returned real data.

**Phase:** Migration cleanup phase — day one.

---

### Pitfall 17: TypeORM `synchronize: true` Left Enabled After Schema Drift

**What goes wrong:** If the TypeORM config still has `synchronize: true` during the transition period (while some code still uses TypeORM), any schema change in the new Prisma schema that TypeORM also "sees" (shared database) can cause TypeORM to add or drop columns autonomously to match its entity definitions. This creates silent schema corruption.

**Prevention:**
- Ensure `synchronize: false` is set in all TypeORM configuration before any schema changes are made.
- Confirm that Prisma Migrate is the single source of schema truth immediately upon migration start.
- Warning sign: TypeORM config file that does not explicitly set `synchronize: false`.

**Phase:** Migration start — pre-condition check.

---

### Pitfall 18: NestJS v11 `@nestjs/config` v4 — Config Precedence Inversion

**What goes wrong:** `@nestjs/config` v4 (bundled with NestJS 11) inverts configuration precedence: application config files previously took precedence over environment variables, but in v4, environment variables now take precedence. If the project uses config files for any default overrides, the behavior silently changes after upgrade.

**Prevention:**
- After upgrading to NestJS 11, audit all `ConfigService.get()` calls and verify values are resolved correctly in test environments.
- Add a startup config dump (non-PII fields only) to confirm resolved values match expectations.
- Warning sign: test environment config values changing unexpectedly after NestJS upgrade.

**Phase:** NestJS upgrade phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| NestJS v10→v11 upgrade | Express v5 wildcard routes break (Pitfall 6) | Run full e2e suite immediately after version bump |
| NestJS v11 upgrade | `@nestjs/config` v4 precedence inversion (Pitfall 18) | Audit all ConfigService.get() values post-upgrade |
| TypeORM→Prisma schema migration | Column rename = data loss (Pitfall 3) | Always `--create-only`, manually review SQL |
| TypeORM→Prisma migration | Prisma client not generated in CI/Docker (Pitfall 7) | Add postinstall script and Dockerfile RUN step |
| Prisma migration | `synchronize: true` still enabled (Pitfall 17) | Verify disabled pre-migration |
| Prisma adoption | Connection pool exhaustion (Pitfall 8) | Configure pool size, use singleton PrismaService |
| BillingLink model expansion | Amount unit ambiguity (Pitfall 14) | Document cents in schema, add validation |
| Public charge endpoint | Idempotency race condition (Pitfall 1) | Use checkOrSave() before HTTP call |
| Public charge endpoint | Redis eviction kills idempotency (Pitfall 2) | Set noeviction policy, monitor memory |
| Public charge endpoint | 5xx from .NET = possible double charge (Pitfall 5) | Reserve idempotency key before calling .NET |
| PII handling | Error paths not covered by PiiSanitizer (Pitfall 4) | Global exception filter + PII tests |
| seller_id security | Body/query sellerId bypass (Pitfall 13) | AuthenticatedRequest type + tests |
| .NET persistence | InMemoryRepository in production (Pitfall 12) | EF Core implementation = first .NET deliverable |
| PIX integration | QR code expiration not shown to user (Pitfall 9) | Return expiresAt, frontend countdown |
| PIX integration | txid format rejected by PSP (Pitfall 10) | Use Guid "N" format, validate against BACEN regex |
| Webhook implementation | At-least-once delivery causes duplicates (Pitfall 11) | Deduplification table with unique constraint |
| Metrics | Route duplication (Pitfall 16) | Delete MetricsController, single endpoint |
| Correlation ID | Header injection (Pitfall 15) | Validate format in middleware |

---

## Sources

- [How to migrate from TypeORM to Prisma ORM — Prisma Documentation](https://www.prisma.io/docs/guides/migrate-from-typeorm)
- [Prisma ORM vs TypeORM — Prisma Documentation](https://www.prisma.io/docs/orm/more/comparisons/prisma-and-typeorm)
- [Common Data Loss Scenarios in Prisma Schema Changes — DEV Community](https://dev.to/vatul16/common-data-loss-scenarios-solutions-in-prisma-schema-changes-52id)
- [Customizing migrations — Prisma Documentation](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)
- [NestJS Migration Guide — NestJS Documentation](https://docs.nestjs.com/migration-guide)
- [NestJS v11 Migration Issue: setGlobalPrefix and RegExp — GitHub](https://github.com/nestjs/nest/issues/16095)
- [Optimize Recommendations: Avoid long-running transactions — Prisma Documentation](https://www.prisma.io/docs/postgres/query-optimization/recommendations/long-running-transactions)
- [Avoiding double payments in a distributed payments system — Airbnb Tech Blog](https://medium.com/airbnb-engineering/avoiding-double-payments-in-a-distributed-payments-system-2981f6b070bb)
- [Handling Race Conditions in Idempotent Operations — Medium](https://medium.com/@ankurnitp/handling-race-conditions-in-idempotent-operations-a-practical-guide-for-payment-systems-eb045b9ca7c4)
- [What is idempotency in Redis? — Redis Blog](https://redis.io/blog/what-is-idempotency-in-redis/)
- [Key eviction — Redis Documentation](https://redis.io/docs/latest/develop/reference/eviction/)
- [PIX API Integration manual — Cielo (EFIPay)](https://developercielo.github.io/en/manual/apipix)
- [Immediate charges — EFI Pay PIX API](https://dev.efipay.com.br/en/docs/api-pix/cobrancas-imediatas/)
- [At-Least-Once vs. Exactly-Once Webhook Delivery Guarantees — Hookdeck](https://hookdeck.com/webhooks/guides/webhook-delivery-guarantees)
- [Handling Payment Webhooks Reliably — Medium](https://medium.com/@sohail_saifii/handling-payment-webhooks-reliably-idempotency-retries-validation-69b762720bf5)
- [LGPD: Brazil's General Data Protection Law — UpGuard](https://www.upguard.com/blog/lgpd)
- [Pix payments — Stripe Documentation](https://docs.stripe.com/payments/pix)
- [Error: @prisma/client did not initialize yet — GitHub Discussion](https://github.com/prisma/prisma/discussions/22213)
- [NestJS + Prisma: Pools That Don't Melt p99 — Medium](https://medium.com/@connect.hashblock/nestjs-prisma-pools-that-dont-melt-p99-7a68850f36e8)
