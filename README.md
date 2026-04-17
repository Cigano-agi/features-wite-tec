# WiteTec Billing Links

A multi-service billing link platform that lets sellers generate shareable payment URLs without requiring technical integration on their end. Payers access a public URL, submit their personal details, and the system processes the transaction through an internal engine with idempotency and rate limiting built in.

**WIA-272**

---

## Architecture Overview

```
                    ┌──────────────────────────────────────────────┐
                    │               Browser / Client                │
                    │          React 18 + TypeScript + Vite         │
                    │                 (port 5173)                   │
                    └─────────────────┬────────────────────────────┘
                                      │ HTTP
                    ┌─────────────────▼────────────────────────────┐
                    │                 Node-API                      │
                    │            NestJS + TypeScript                │
                    │                 (port 3000)                   │
                    │                                               │
                    │  - JWT auth middleware                        │
                    │  - correlationId propagation                  │
                    │  - Idempotency guard    (Redis SETNX)         │
                    │  - Rate limiter         (Redis SETNX)         │
                    │  - PiiSanitizer on all error paths            │
                    └──────────────┬─────────────────┬─────────────┘
                                   │                 │
             Internal HTTP         │                 │  SQL
           x-correlation-id        │                 │
                    ┌──────────────▼──────┐   ┌──────▼──────────────┐
                    │   dotnet-service    │   │   PostgreSQL 15      │
                    │   .NET 8 / C#       │   │     (port 5432)      │
                    │   (port 5001)       │   │                      │
                    │                     │   │  billing_links       │
                    │  - Domain aggregate │   │  transactions        │
                    │  - State machine    │   └─────────────────────┘
                    │  - xUnit tests      │
                    └─────────────────────┘   ┌─────────────────────┐
                                              │      Redis 7         │
                                              │     (port 6379)      │
                                              │                      │
                                              │  Idempotency keys    │
                                              │  Rate limit counters │
                                              └─────────────────────┘
```

---

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Services](#services)
- [API Reference](#api-reference)
- [Request / Response Contracts](#request--response-contracts)
- [Full cURL Walkthrough](#full-curl-walkthrough)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Security](#security)
- [Design Decisions](#design-decisions)
- [Open Items for Tech Lead](#open-items-for-tech-lead)

---

## Quick Start

**Prerequisites:** Docker, Node.js 20+, .NET 8 SDK

```bash
# 1. Start infrastructure (Postgres 15 + Redis 7)
docker compose up -d

# 2. dotnet-service (new terminal)
cd dotnet-service
dotnet run

# 3. Node-API (new terminal)
cd node-api
cp ../.env.example .env
npm install
npm run start:dev

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

| Service        | URL                        |
|----------------|----------------------------|
| Frontend       | http://localhost:5173       |
| Node-API       | http://localhost:3000       |
| dotnet-service | http://localhost:5001 (internal only) |

---

## Project Structure

```
witetec-billing-links/
├── docker-compose.yml                   # Postgres 15 + Redis 7
├── .env.example                         # Environment variable template
│
├── frontend/                            # React 18 + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── pages/
│   │   │   ├── BillingLinksPage.tsx     # Seller dashboard
│   │   │   └── PublicChargePage.tsx     # Public payment form (/pay/:linkId)
│   │   ├── components/
│   │   │   └── BillingLinksList.tsx
│   │   └── services/
│   │       └── api.ts
│   ├── __tests__/
│   │   ├── BillingLinksList.test.tsx
│   │   └── PublicChargePage.test.tsx
│   ├── vite.config.ts
│   └── package.json
│
├── node-api/                            # NestJS + TypeScript (public-facing API)
│   ├── src/
│   │   ├── billing-links/
│   │   │   ├── billing-links.controller.ts
│   │   │   ├── billing-links.service.ts
│   │   │   ├── billing-links.module.ts
│   │   │   └── dto/
│   │   │       ├── create-billing-link.dto.ts
│   │   │       └── update-billing-link.dto.ts
│   │   ├── public/
│   │   │   ├── public-charge.controller.ts
│   │   │   └── public-charge.service.ts
│   │   ├── common/
│   │   │   ├── middleware/
│   │   │   │   └── correlation-id.middleware.ts
│   │   │   ├── guards/
│   │   │   │   └── jwt-auth.guard.ts
│   │   │   ├── idempotency/
│   │   │   │   └── idempotency.service.ts
│   │   │   ├── rate-limiter/
│   │   │   │   └── rate-limiter.service.ts
│   │   │   └── security/
│   │   │       └── pii-sanitizer.ts
│   │   └── main.ts
│   ├── test/
│   │   ├── billing-link.service.spec.ts
│   │   ├── public-charge.service.spec.ts
│   │   ├── idempotency.service.spec.ts
│   │   ├── rate-limiter.service.spec.ts
│   │   └── pii-sanitizer.spec.ts
│   └── package.json
│
├── dotnet-service/                      # .NET 8 / C# (transaction engine)
│   ├── src/
│   │   ├── Domain/
│   │   │   ├── Transaction.cs           # Aggregate root with state machine
│   │   │   ├── TransactionStatus.cs     # Pending | Approved | Failed
│   │   │   └── Exceptions/
│   │   │       └── InvalidTransactionTransitionException.cs
│   │   ├── Application/
│   │   │   └── UseCases/
│   │   │       └── CreateTransactionUseCase.cs
│   │   ├── Infrastructure/
│   │   │   └── Repositories/
│   │   │       └── InMemoryTransactionRepository.cs
│   │   └── Api/
│   │       └── Controllers/
│   │           └── InternalTransactionController.cs
│   └── dotnet-service.csproj
│
└── dotnet-service-tests/                # xUnit test project
    ├── CreateTransactionUseCaseTests.cs
    └── InternalTransactionControllerTests.cs
```

---

## Services

### Frontend — React 18 + Vite

Provides two primary surfaces:

- **Seller dashboard** — authenticated view where sellers create, list, edit, and deactivate billing links, and view aggregated metrics.
- **Public payment page** (`/pay/:linkId`) — unauthenticated form where payers enter name and CPF to initiate a charge. Fetches link metadata (description, amount) via the public-info endpoint before rendering.

### Node-API — NestJS

Handles all HTTP traffic from the frontend. Responsibilities:

- Authenticating sellers via JWT and extracting `seller_id` from the token payload.
- CRUD operations on billing links, scoped strictly to the authenticated seller.
- Processing public charge requests: validating idempotency, enforcing rate limits, and delegating transaction creation to the dotnet-service via HTTP.
- Generating a `correlationId` on every inbound request and propagating it through all downstream calls and log entries.
- Sanitizing PII from all error paths before writing to logs.

### dotnet-service — .NET 8

Internal transaction engine. Not exposed to the public internet. Responsibilities:

- Creating and persisting transaction records.
- Enforcing valid state transitions through a domain-level state machine on the `Transaction` aggregate root.
- Returning structured results to the Node-API.

### Infrastructure — Docker Compose

| Service  | Image       | Port | Purpose                               |
|----------|-------------|------|---------------------------------------|
| postgres | postgres:15 | 5432 | Primary data store                    |
| redis    | redis:7     | 6379 | Idempotency keys and rate limit counters |

---

## API Reference

### Node-API (port 3000)

#### Authenticated Endpoints

All authenticated endpoints require `Authorization: Bearer <token>`.

| Method   | Path                                      | Description                                        |
|----------|-------------------------------------------|----------------------------------------------------|
| `POST`   | `/v1/billing-links`                       | Create a billing link                              |
| `GET`    | `/v1/billing-links`                       | List all links belonging to the authenticated seller |
| `PATCH`  | `/v1/billing-links/:id`                   | Update a link's description or amount              |
| `DELETE` | `/v1/billing-links/:id`                   | Deactivate a link                                  |
| `GET`    | `/v1/billing-links/metrics`               | Aggregated metrics for the authenticated seller    |

#### Public Endpoints

| Method | Path                                           | Description                                              |
|--------|------------------------------------------------|----------------------------------------------------------|
| `GET`  | `/v1/billing-links/public-info/:linkId`        | Fetch description and amount (used by the payment page)  |
| `POST` | `/v1/public/charge/:linkId`                    | Submit a payment against a billing link                  |

### dotnet-service (port 5001 — internal only)

| Method | Path                     | Description             |
|--------|--------------------------|-------------------------|
| `POST` | `/internal/transactions` | Create a transaction    |

---

## Request / Response Contracts

### POST /v1/billing-links

**Request:**
```json
{
  "description": "Consultoria mensal",
  "amount": 19990
}
```
> `amount` is in cents.

**Responses:**

| Status | Body |
|--------|------|
| `201`  | `{ id, seller_id, description, amount, active, created_at }` |
| `400`  | `{ error: "validation_error", details: [...] }` |
| `401`  | `{ error: "unauthorized" }` |

---

### GET /v1/billing-links

**Responses:**

| Status | Body |
|--------|------|
| `200`  | `[{ id, description, amount, active, created_at }, ...]` |
| `401`  | `{ error: "unauthorized" }` |

---

### PATCH /v1/billing-links/:id

**Request (all fields optional):**
```json
{
  "description": "Novo titulo",
  "amount": 25000
}
```

**Responses:**

| Status | Body |
|--------|------|
| `200`  | `{ id, seller_id, description, amount, active, updated_at }` |
| `403`  | `{ error: "forbidden" }` |
| `404`  | `{ error: "billing_link_not_found" }` |

---

### DELETE /v1/billing-links/:id

**Responses:**

| Status | Body |
|--------|------|
| `204`  | (no body) |
| `403`  | `{ error: "forbidden" }` |
| `404`  | `{ error: "billing_link_not_found" }` |

---

### GET /v1/billing-links/metrics

**Responses:**

| Status | Body |
|--------|------|
| `200`  | `{ total_links, active_links, total_approved, total_pending }` |
| `401`  | `{ error: "unauthorized" }` |

> See [Open Items](#open-items-for-tech-lead) — `total_approved` and `total_pending` are pending a decision on aggregation strategy.

---

### GET /v1/billing-links/public-info/:linkId

No authentication required.

**Responses:**

| Status | Body |
|--------|------|
| `200`  | `{ description, amount }` |
| `404`  | `{ error: "billing_link_not_found_or_inactive" }` |

---

### POST /v1/public/charge/:linkId

**Headers:**
```
Idempotency-Key: <uuid>
Content-Type: application/json
```

**Request:**
```json
{
  "name": "Joao Silva",
  "cpf": "12345678901"
}
```

**Responses:**

| Status | Body | Notes |
|--------|------|-------|
| `201`  | `{ transaction_id, status, amount, billing_link_id }` | Charge processed |
| `404`  | `{ error: "billing_link_not_found_or_inactive" }` | Link does not exist or is inactive |
| `409`  | `{ transaction_id, status, idempotent: true }` | Same `Idempotency-Key` already processed; original result returned |
| `422`  | `{ error: "validation_error", details: [...] }` | Invalid name or CPF format |
| `429`  | `{ error: "rate_limit_exceeded", retry_after: 60 }` | Rate limit of 30 req/min exceeded for this IP+link combination |

The `409` response is not an error condition. It signals that a prior request with the same `Idempotency-Key` completed successfully, and the stored result is being returned. No duplicate charge was created.

---

### POST /internal/transactions (dotnet-service)

**Headers:**
```
x-correlation-id: <uuid>
Content-Type: application/json
```

**Request:**
```json
{
  "billing_link_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 19990,
  "payer_name": "Joao Silva",
  "payer_cpf": "12345678901"
}
```

**Responses:**

| Status | Body |
|--------|------|
| `201`  | `{ transaction_id, status: "pending" \| "approved" \| "failed" }` |
| `400`  | `{ error: "validation_error" }` |

---

## Full cURL Walkthrough

This section covers the complete payment lifecycle from link creation to rate limit verification.

### Step 1 — Generate a dev JWT

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sub: '550e8400-e29b-41d4-a716-446655440000', email: 'seller@witetec.com' },
  'dev-secret-local'
);
console.log(token);
"

export JWT="<token_from_above>"
```

### Step 2 — Create a billing link

```bash
curl -X POST http://localhost:3000/v1/billing-links \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"amount": 19990, "description": "Consultoria 1h"}'
```

Expected: `201` with `{ id, seller_id, amount, description, active: true, created_at }`.

```bash
export LINK_ID="<id_from_response>"
```

### Step 3 — List billing links

```bash
curl http://localhost:3000/v1/billing-links \
  -H "Authorization: Bearer $JWT"
```

### Step 4 — Update a billing link

```bash
curl -X PATCH http://localhost:3000/v1/billing-links/$LINK_ID \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"amount": 25000}'
```

### Step 5 — Fetch public link info (no auth)

```bash
curl http://localhost:3000/v1/billing-links/public-info/$LINK_ID
```

Expected: `200` with `{ description, amount }`.

### Step 6 — View metrics

```bash
curl http://localhost:3000/v1/billing-links/metrics \
  -H "Authorization: Bearer $JWT"
```

### Step 7 — Submit a public charge

```bash
export IDEM_KEY=$(uuidgen)

curl -X POST http://localhost:3000/v1/public/charge/$LINK_ID \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d '{"name": "Joao Silva", "cpf": "12345678901"}'
```

Expected `201`:
```json
{
  "transaction_id": "...",
  "status": "pending",
  "amount": 19990,
  "billing_link_id": "..."
}
```

### Step 8 — Replay the same charge (idempotency)

```bash
curl -X POST http://localhost:3000/v1/public/charge/$LINK_ID \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM_KEY" \
  -d '{"name": "Joao Silva", "cpf": "12345678901"}'
```

Expected `409` — same result as the original call, with `idempotent: true`. No duplicate transaction was created.

### Step 9 — Trigger rate limiting

```bash
for i in {1..35}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/v1/public/charge/$LINK_ID \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $(uuidgen)" \
    -d '{"name": "Teste", "cpf": "12345678901"}'
done
# Requests 31 through 35 should return 429
```

### Step 10 — Deactivate the link

```bash
curl -X DELETE http://localhost:3000/v1/billing-links/$LINK_ID \
  -H "Authorization: Bearer $JWT"
```

Expected: `204`.

### Step 11 — Charge against an inactive link

```bash
curl -X POST http://localhost:3000/v1/public/charge/$LINK_ID \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name": "Teste", "cpf": "12345678901"}'
```

Expected: `404` with `{ "error": "billing_link_not_found_or_inactive" }`.

---

## Environment Variables

Copy `.env.example` to `.env` inside `node-api/` before starting the service.

| Variable                  | Description                                                  | Default                                                |
|---------------------------|--------------------------------------------------------------|--------------------------------------------------------|
| `DATABASE_URL`            | PostgreSQL connection string                                 | `postgresql://postgres:postgres@localhost:5432/witetec` |
| `REDIS_URL`               | Redis connection string                                      | `redis://localhost:6379`                               |
| `DOTNET_SERVICE_URL`      | Internal base URL for the dotnet-service                     | `http://localhost:5001`                                |
| `JWT_SECRET`              | Secret used to verify seller JWT tokens                      | `dev-secret-local`                                     |
| `RATE_LIMIT_PER_MINUTE`   | Maximum charge requests per IP+link combination per minute   | `30`                                                   |
| `IDEMPOTENCY_TTL_SECONDS` | Retention period for idempotency keys in Redis               | `86400` (24 hours)                                     |

Do not commit `.env` files with real credentials. Use your deployment platform's secret management for production values.

---

## Running Tests

### Node-API — Jest (26 tests)

```bash
cd node-api
npm test
```

Covers: `BillingLinkService`, `PublicChargeService`, `IdempotencyService`, `RateLimiterService`, `PiiSanitizer`.

### dotnet-service — xUnit (7 tests)

```bash
cd dotnet-service-tests
dotnet test
```

Covers: `CreateTransactionUseCase`, `InternalTransactionController`.

### Frontend — Vitest (9 tests)

```bash
cd frontend
npm test
```

Covers: `BillingLinksList`, `PublicChargePage`.

### All suites from root

```bash
cd node-api && npm test && cd ../dotnet-service-tests && dotnet test && cd ../frontend && npm test
```

---

## Security

### Seller Isolation

`seller_id` is extracted exclusively from the verified JWT payload by the auth middleware. It is never read from the request body, query string, or any caller-supplied header. All database queries that read or modify billing links include a `WHERE seller_id = :sellerId` filter, preventing cross-seller data access even if a link ID is guessed or leaked.

### PII Protection

Payer name and CPF are personal data subject to LGPD. The `PiiSanitizer` utility strips these fields inside every `catch` block in the Node-API before any error is written to logs, error tracking, or log aggregators. The same principle applies in the dotnet-service. This means PII is never persisted in log storage, even under unexpected failure conditions or unhandled exceptions.

### Idempotency — Redis SETNX

Idempotency for public charge requests is enforced atomically using Redis `SETNX` (set-if-not-exists):

1. The Node-API issues `SETNX idempotency:<Idempotency-Key> <serialized_result>` with a TTL equal to `IDEMPOTENCY_TTL_SECONDS`.
2. If the key already exists, the stored result is returned immediately with `HTTP 409` and `idempotent: true`. No call to the dotnet-service is made.
3. If the key is new, the charge is processed, the result is stored atomically, and `HTTP 201` is returned.

The atomic nature of `SETNX` eliminates the race condition that would arise from a read-check-then-write approach. Duplicate browser submissions, network retries, and at-least-once delivery patterns are all handled without creating duplicate transactions.

### Rate Limiting — Redis SETNX Counter

Charge request rate is limited to `RATE_LIMIT_PER_MINUTE` per IP+link combination using a rolling 60-second counter in Redis. Requests exceeding the limit receive `HTTP 429` with a `retry_after` field.

### Correlation ID Propagation

A `CorrelationIdMiddleware` runs on every inbound request to the Node-API. It reads `x-correlation-id` from the request headers or generates a new UUID v4 if none is present. This ID is:

- Attached to the NestJS request context and included in every structured log entry for the duration of that request.
- Forwarded as the `x-correlation-id` header on every outbound HTTP call to the dotnet-service.
- Logged by the dotnet-service on every log entry related to that call.

The result is a single traceable identifier that spans both service log streams, allowing any transaction to be reconstructed end-to-end from a single grep.

---

## Design Decisions

### Boundary between Node-API and dotnet-service

The Node-API owns the product surface: billing link lifecycle, authentication, public-facing HTTP, idempotency, and rate limiting. The dotnet-service owns the transaction domain: creating, persisting, and transitioning transactions.

This boundary is deliberate. The transaction engine has no awareness of HTTP sessions, seller authentication, or product-layer concerns. The Node-API treats the dotnet-service as a narrow internal dependency. Either service can be scaled, replaced, or tested in isolation without the other needing to change.

### State machine in the domain layer

The `Transaction` aggregate exposes `Approve()` and `Fail()` methods. Each method validates the current state before applying the transition and throws `InvalidTransactionTransitionException` for any illegal move. There are no `if`/`switch` branches scattered across service or controller code to guard against invalid transitions — the domain object enforces the state graph itself.

This means the valid lifecycle of a transaction is defined and enforced in exactly one place. When business rules change, that is the only place that needs to change.

### Idempotency check before the downstream call

The idempotency guard runs in the Node-API, before any HTTP call to the dotnet-service. Duplicate requests are short-circuited at the API layer and never reach the transaction engine. Placing the check inside the dotnet-service would still incur the network round-trip and would require the transaction engine to understand `Idempotency-Key` semantics — a product-layer concept that does not belong in an internal domain service.

### `seller_id` from JWT only

Accepting a `seller_id` from the request body is a common surface for privilege escalation: a caller could supply any seller's ID and access their data. By extracting the identifier exclusively from the verified token at the middleware layer and injecting it into the request context, the service layer receives a value it can trust unconditionally. The JWT verification step is the sole trust boundary, and it is enforced in one place.

### Structured logging with correlationId on both services

Both services emit structured JSON logs. The `correlationId` field is present on every entry. When an error occurs, engineers can filter either log stream by a single ID and reconstruct the full request lifecycle — across two services, multiple Redis operations, and the database — without manually correlating timestamps or request order.

---

## Open Items for Tech Lead

The following items require a decision before production deployment.

### 1. Metrics aggregation strategy

`GET /v1/billing-links/metrics` currently returns `total_approved: 0` and `total_pending: 0` as placeholders. These values require aggregating transaction data that is owned by the dotnet-service.

Options to evaluate:

- **Aggregation endpoint on dotnet-service** — Node-API calls `/internal/metrics?seller_id=...` and receives pre-aggregated counts. Keeps data access within the service that owns it; adds a synchronous dependency on reads.
- **Materialized view in Postgres** — if both services share the same database, a materialized view can join `billing_links` and `transactions` on a schedule. Simpler query path; requires the view to stay in sync with schema changes across both services.
- **Event-driven counter** — dotnet-service emits a domain event on each approval or failure; Node-API (or a dedicated consumer) updates counters in Redis. Decouples the services; introduces eventual consistency on metrics.

### 2. Replace InMemoryTransactionRepository before production

The dotnet-service uses an in-memory repository that loses all data on process restart. This is intentional for the current development phase. The `ITransactionRepository` interface is already in place — only the implementation needs to be replaced with an EF Core + PostgreSQL repository before any production deployment.

### 3. Formalize the public-info endpoint

`GET /v1/billing-links/public-info/:linkId` was added to unblock frontend development but was not in the original WIA-272 contract. The public payment page (`/pay/:linkId`) requires it to display description and amount before the payer submits their details.

This endpoint should either be formally added to the API contract, or the frontend flow should be redesigned to receive link metadata through another channel (e.g., server-side rendering, embedded in the initial HTML, or included in the page route data).

---

## License

Proprietary — WiteTec. All rights reserved.
