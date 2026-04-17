# Testing Patterns

**Analysis Date:** 2026-04-16

## Test Framework

**Runner:**
- Jest 29.7.0 (Node API)
- Vitest 1.1.0 (Frontend)

**Configuration:**

Node API (`node-api/jest.config.js`):
```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\.spec\.ts$',
  transform: { '^.+\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.(t|j)s', '!src/main.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
```

Frontend (`frontend/package.json`):
- Test runner: `vitest run`
- Watch mode: `vitest --ui`
- Coverage: `vitest run --coverage`

**Assertion Library:**
- Jest (built-in expect)
- Vitest (built-in expect)

**Run Commands:**
```bash
cd node-api && npm test              # Run all tests
npm run test:coverage                # Generate coverage report
cd frontend && npm test               # Run React tests
npm run test:coverage                 # Frontend coverage
```

## Test File Organization

**Location:**
- Node API: co-located with source, same directory with `.spec.ts` suffix (e.g., `src/billing-links/billing-links.service.spec.ts`)
- Frontend: separate `__tests__/` directory (e.g., `src/__tests__/BillingLinksList.test.tsx`)

**Naming:**
- Node API: `[feature].spec.ts` (follows NestJS convention)
- Frontend: `[feature].test.tsx` or `.test.ts`

**Structure:**
```
node-api/src/
├── billing-links/
│   ├── billing-links.service.ts
│   └── billing-links.service.spec.ts
├── public-charge/
│   ├── public-charge.service.ts
│   └── public-charge.service.spec.ts
└── shared/
    ├── pii/
    │   └── pii-sanitizer.spec.ts
    └── rate-limit/
        └── rate-limiter.middleware.spec.ts

frontend/src/
├── pages/
├── services/
└── __tests__/
    ├── BillingLinksList.test.tsx
    ├── PublicChargePage.test.tsx
    └── setup.ts
```

## Test Structure

**Suite Organization:**

Node API pattern (from `src/billing-links/billing-links.service.spec.ts`):
```typescript
describe('BillingLinksService', () => {
  let service: BillingLinksService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingLinksService,
        { provide: getRepositoryToken(BillingLink), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BillingLinksService>(BillingLinksService);
  });

  describe('create', () => {
    it('creates a billing link with seller_id from token, status active', async () => {
      // test body
    });
  });

  afterEach(() => jest.clearAllMocks());
});
```

Frontend pattern (from `src/__tests__/BillingLinksList.test.tsx`):
```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('BillingLinksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // setup mocks
  });

  it('renders billing links with status badges', async () => {
    render(<BillingLinksPage />);
    await waitFor(() => {
      expect(screen.getByText('Product A')).toBeInTheDocument();
    });
  });
});
```

**Patterns:**
- Setup in `beforeEach()` (not `before()`) for isolated test state
- Teardown with `jest.clearAllMocks()` or `vi.clearAllMocks()`
- Async tests use `async/await` with `jest.fn()` or `vi.fn()`
- Grouped test cases by feature: `describe('featureName', () => {})`

## Mocking

**Framework:** 
- Jest native mocking (`jest.fn()`, `jest.mock()`)
- Vitest native mocking (`vi.fn()`, `vi.mock()`)

**Patterns:**

Module mocking (from `src/public-charge/public-charge.service.spec.ts`):
```typescript
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
```

Service injection mocking (from `src/public-charge/public-charge.service.spec.ts`):
```typescript
billingLinksService = {
  findActiveById: jest.fn(),
} as any;

const module: TestingModule = await Test.createTestingModule({
  providers: [
    PublicChargeService,
    { provide: BillingLinksService, useValue: billingLinksService },
  ],
}).compile();
```

Repository mocking (from `src/billing-links/billing-links.service.spec.ts`):
```typescript
mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  count: jest.fn(),
};

{ provide: getRepositoryToken(BillingLink), useValue: mockRepo }
```

Mock resolution (from `src/public-charge/public-charge.service.spec.ts`):
```typescript
billingLinksService.findActiveById.mockResolvedValue(makeLink());
idempotencyService.exists.mockResolvedValue(null);
(mockedAxios.post as jest.Mock).mockResolvedValue({
  data: { transactionId: 'tx-1', status: 'pending', amount: 10000 },
});
```

API mocking in React (from `src/__tests__/BillingLinksList.test.tsx`):
```typescript
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

(api.get as any).mockImplementation((url: string) => {
  if (url === '/billing-links') return Promise.resolve({ data: mockLinks });
  if (url === '/billing-links/metrics') return Promise.resolve({ data: mockMetrics });
  return Promise.resolve({ data: {} });
});
```

**What to Mock:**
- External HTTP calls (axios, API services)
- Database repositories (TypeORM Repository)
- Other services injected via constructor
- localStorage (for JWT token tests)
- Timers if testing timeout behavior

**What NOT to Mock:**
- Pure utility functions (formatting, validation logic)
- Entity creation (use factory functions instead)
- Business logic under test (always test actual implementation)

## Fixtures and Factories

**Test Data:**

Factory function pattern (from `src/billing-links/billing-links.service.spec.ts`):
```typescript
const makeLink = (overrides: Partial<BillingLink> = {}): BillingLink =>
  Object.assign(new BillingLink(), {
    id: 'link-uuid-1',
    sellerId: 'seller-uuid-1',
    amount: 10000,
    description: 'Test product',
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

// Usage:
const link = makeLink();
const inactiveLink = makeLink({ status: 'inactive' });
```

Mock data arrays (from `src/__tests__/BillingLinksList.test.tsx`):
```typescript
const mockLinks = [
  { id: 'link-1', seller_id: 'seller-1', amount: 10000, description: 'Product A', status: 'active', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'link-2', seller_id: 'seller-1', amount: 5000, description: 'Product B', status: 'inactive', created_at: '2026-01-01', updated_at: '2026-01-01' },
];

const mockMetrics = { active_links: 1, total_approved: 3, total_pending: 1 };
```

**Location:**
- Factory functions defined at top of test file, scoped to that test suite
- Mock response data defined at top as const
- No separate fixtures directory detected

## Coverage

**Requirements:** Not enforced

**View Coverage:**
```bash
cd node-api && npm run test:coverage
cd frontend && npm run test:coverage
```

Coverage settings exclude bootstrap file (`src/main.ts` excluded from collection).

## Test Types

**Unit Tests:**
- Scope: Individual service methods and middleware functions
- Approach: Mock all dependencies, test single unit in isolation
- Example: `BillingLinksService.create()` tested with mocked repository
- Assertion focus: Return values, mock call verification, error throws

**Integration Tests:**
- Scope: Service + external service interactions (e.g., PublicChargeService calling axios)
- Approach: Mock external HTTP calls, test service coordination
- Example: `PublicChargeService.charge()` mocks axios, tests idempotency logic
- Assertion focus: Request payloads sent correctly, response handling

**E2E Tests:**
- Status: Not used in this codebase
- .NET service tests exist separately in `dotnet-service-tests/` (not part of Node test suite)

**React Component Tests:**
- Scope: Component rendering, user interactions
- Approach: Mock API service, render component with test library
- Example: `BillingLinksPage` test mocks api.get/post/delete
- Assertion focus: DOM elements rendered, event handlers called correctly

## Common Patterns

**Async Testing:**

Jest/NestJS pattern (from `src/public-charge/public-charge.service.spec.ts`):
```typescript
it('creates transaction and returns result', async () => {
  billingLinksService.findActiveById.mockResolvedValue(makeLink());
  idempotencyService.exists.mockResolvedValue(null);
  (mockedAxios.post as jest.Mock).mockResolvedValue({
    data: { transactionId: 'tx-1', status: 'pending', amount: 10000 },
  });

  const result = await service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID);

  expect(result.transaction_id).toBe('tx-1');
});
```

React Vitest pattern (from `src/__tests__/BillingLinksList.test.tsx`):
```typescript
it('renders billing links with status badges', async () => {
  render(<BillingLinksPage />);

  await waitFor(() => {
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
  });
});
```

**Error Testing:**

Exception handling (from `src/billing-links/billing-links.service.spec.ts`):
```typescript
it('throws NotFoundException when link does not belong to seller', async () => {
  mockRepo.findOne.mockResolvedValue(null);

  await expect(service.inactivate('link-uuid-1', 'other-seller')).rejects.toThrow(NotFoundException);
});
```

HTTP error testing (from `src/public-charge/public-charge.service.spec.ts`):
```typescript
it('throws HttpException when dotnet-service is unavailable', async () => {
  billingLinksService.findActiveById.mockResolvedValue(makeLink());
  idempotencyService.exists.mockResolvedValue(null);
  (mockedAxios.post as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

  await expect(
    service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID)
  ).rejects.toThrow(HttpException);
});
```

**Idempotency Testing:**

Cached result detection (from `src/public-charge/public-charge.service.spec.ts`):
```typescript
it('returns cached result when idempotency key already exists (409)', async () => {
  const cached = { transaction_id: 'tx-existing', status: 'pending', amount: 10000, billing_link_id: 'link-uuid-1' };
  billingLinksService.findActiveById.mockResolvedValue(makeLink());
  idempotencyService.exists.mockResolvedValue(cached as any);

  const result = await service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID);

  expect(result.idempotent).toBe(true);
  expect(mockedAxios.post).not.toHaveBeenCalled();
});
```

**Security Testing:**

Seller isolation verification (from `src/billing-links/billing-links.service.spec.ts`):
```typescript
describe('seller_id isolation', () => {
  it('findByIdAndSeller throws when seller mismatch', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.findByIdAndSeller('link-uuid-1', 'wrong-seller')).rejects.toThrow(NotFoundException);
  });

  it('findByIdAndSeller always includes sellerId in query', async () => {
    const link = makeLink();
    mockRepo.findOne.mockResolvedValue(link);
    await service.findByIdAndSeller('link-uuid-1', 'seller-uuid-1');
    expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 'link-uuid-1', sellerId: 'seller-uuid-1' } });
  });
});
```

PII sanitization testing (from `src/shared/pii/pii-sanitizer.spec.ts`):
```typescript
it('redacts name field', () => {
  const result = PiiSanitizer.sanitize({ name: 'John Doe', amount: 100 });
  expect(result.name).toBe('[REDACTED]');
  expect(result.amount).toBe(100);
});

it('does not mutate the original object', () => {
  const original = { name: 'John', amount: 100 };
  PiiSanitizer.sanitize(original);
  expect(original.name).toBe('John');
});
```

**Rate Limiting Testing:**

Threshold verification (from `src/shared/rate-limit/rate-limiter.middleware.spec.ts`):
```typescript
it('allows exactly 30 requests', async () => {
  redisMock.incr.mockResolvedValue(30);
  const next = jest.fn();
  await middleware.use(mockReq(), mockRes(), next);
  expect(next).toHaveBeenCalled();
});

it('returns 429 on 31st request', async () => {
  redisMock.incr.mockResolvedValue(31);
  const res = mockRes();
  const next = jest.fn();
  await middleware.use(mockReq(), res, next);
  expect(res.status).toHaveBeenCalledWith(429);
  expect(res.json).toHaveBeenCalledWith({ error: 'rate_limit_exceeded', retry_after: 60 });
  expect(next).not.toHaveBeenCalled();
});
```

## Test Dependencies

**Node API:**
- `@nestjs/testing@^10.0.0` - NestJS test utilities
- `jest@^29.7.0` - Test runner
- `ts-jest@^29.1.1` - TypeScript support for Jest
- `@types/jest@^29.5.11` - Jest type definitions

**Frontend:**
- `vitest@^1.1.0` - Test runner
- `@testing-library/react@^14.1.2` - React component testing
- `@testing-library/jest-dom@^6.1.5` - DOM matchers
- `@testing-library/user-event@^14.5.2` - User interaction simulation
- `jsdom@^23.0.1` - DOM implementation
- `msw@^2.0.11` - Mock Service Worker for API mocking

---

*Testing analysis: 2026-04-16*
