import { IdempotencyService } from './idempotency.service';

const redisMock = {
  set: jest.fn(),
  get: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
};

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => redisMock);
  return { __esModule: true, default: MockRedis };
});

const configStub = {
  get: jest.fn((key: string) => {
    if (key === 'REDIS_URL') return 'redis://localhost:6379';
    if (key === 'IDEMPOTENCY_TTL_SECONDS') return 86400;
    return undefined;
  }),
} as any;

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IdempotencyService(configStub);
  });

  describe('checkOrSave', () => {
    it('returns null on first call (key did not exist)', async () => {
      redisMock.set.mockResolvedValue('OK');

      const result = await service.checkOrSave('key-new', { foo: 'bar' });

      expect(result).toBeNull();
      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('key-new'),
        JSON.stringify({ foo: 'bar' }),
        'EX',
        expect.any(Number),
        'NX',
      );
    });

    it('returns existing payload on collision (key existed)', async () => {
      const existing = { transaction_id: 'tx-1', status: 'pending' };
      redisMock.set.mockResolvedValue(null);
      redisMock.get.mockResolvedValue(JSON.stringify(existing));

      const result = await service.checkOrSave('key-existing', { foo: 'bar' });

      expect(result).toEqual(existing);
    });
  });

  describe('save', () => {
    it('persists payload with TTL', async () => {
      redisMock.set.mockResolvedValue('OK');

      await service.save('key-1', { transaction_id: 'tx-2' });

      expect(redisMock.set).toHaveBeenCalledWith(
        expect.stringContaining('key-1'),
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });
  });

  describe('exists', () => {
    it('returns null when key is absent', async () => {
      redisMock.get.mockResolvedValue(null);
      const result = await service.exists('key-absent');
      expect(result).toBeNull();
    });

    it('returns parsed payload when key exists', async () => {
      redisMock.get.mockResolvedValue(JSON.stringify({ transaction_id: 'tx-3' }));
      const result = await service.exists('key-present');
      expect(result).toEqual({ transaction_id: 'tx-3' });
    });
  });
});
