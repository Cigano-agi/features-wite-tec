import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

const makeContext = (authHeader?: string): ExecutionContext => {
  const req: any = { headers: authHeader ? { authorization: authHeader } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
};

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() } as any;
    guard = new JwtAuthGuard(jwtService);
  });

  it('returns true and attaches user when Bearer token verifies', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'seller-1', email: 'x@y.com' });
    const ctx = makeContext('Bearer valid.jwt.token');
    const result = await guard.canActivate(ctx);
    const req: any = ctx.switchToHttp().getRequest();
    expect(result).toBe(true);
    expect(req.user).toEqual({ sellerId: 'seller-1', email: 'x@y.com' });
  });

  it('throws UnauthorizedException when no Authorization header', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when scheme is not Bearer', async () => {
    await expect(guard.canActivate(makeContext('Basic abcdef'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when Bearer but no token', async () => {
    await expect(guard.canActivate(makeContext('Bearer'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when verifyAsync rejects', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    await expect(guard.canActivate(makeContext('Bearer expired.token'))).rejects.toThrow(UnauthorizedException);
  });
});
