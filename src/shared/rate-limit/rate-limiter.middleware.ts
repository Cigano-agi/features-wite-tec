import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

const RATE_LIMIT_PREFIX = 'rate:charge:';
const WINDOW_SECONDS = 60;

@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  private readonly redis: Redis;
  private readonly limit: number;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
    this.limit = this.configService.get<number>('RATE_LIMIT_PER_MINUTE') ?? 30;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = RATE_LIMIT_PREFIX + ip;

    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }

    if (current > this.limit) {
      res.status(429).json({ error: 'rate_limit_exceeded', retry_after: WINDOW_SECONDS });
      return;
    }

    next();
  }
}
