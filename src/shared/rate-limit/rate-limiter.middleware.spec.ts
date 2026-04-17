import { RateLimiterMiddleware } from './rate-limiter.middleware';

const redisMock = {
  incr: jest.fn(),
  expire: jest.fn().mockResolvedValue(1),
};

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => redisMock);
  return { __esModule: true, default: MockRedis };
});

const mockReq = (ip = '127.0.0.1') => ({ ip, socket: { remoteAddress: ip } } as any);
const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('RateLimiterMiddleware', () => {
  let middleware: RateLimiterMiddleware;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_PER_MINUTE = '30';
    middleware = new RateLimiterMiddleware();
  });

  it('allows request below limit', async () => {
    redisMock.incr.mockResolvedValue(5);
    const next = jest.fn();
    await middleware.use(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

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

  it('sets TTL on first request', async () => {
    redisMock.incr.mockResolvedValue(1);
    const next = jest.fn();
    await middleware.use(mockReq(), mockRes(), next);
    expect(redisMock.expire).toHaveBeenCalledWith(expect.any(String), 60);
  });
});
