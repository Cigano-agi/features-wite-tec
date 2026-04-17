import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const IDEMPOTENCY_PREFIX = 'idempotency:charge:';

@Injectable()
export class IdempotencyService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.ttlSeconds = parseInt(process.env.IDEMPOTENCY_TTL_SECONDS ?? '86400', 10);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private key(idempotencyKey: string): string {
    return IDEMPOTENCY_PREFIX + idempotencyKey;
  }

  async checkOrSave(idempotencyKey: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const k = this.key(idempotencyKey);
    const serialized = JSON.stringify(payload);
    const result = await this.redis.set(k, serialized, 'EX', this.ttlSeconds, 'NX');
    if (result === 'OK') return null;
    const existing = await this.redis.get(k);
    return existing ? (JSON.parse(existing) as Record<string, unknown>) : null;
  }

  async save(idempotencyKey: string, payload: Record<string, unknown>): Promise<void> {
    await this.redis.set(this.key(idempotencyKey), JSON.stringify(payload), 'EX', this.ttlSeconds);
  }

  async exists(idempotencyKey: string): Promise<Record<string, unknown> | null> {
    const data = await this.redis.get(this.key(idempotencyKey));
    return data ? (JSON.parse(data) as Record<string, unknown>) : null;
  }

  getRedis(): Redis {
    return this.redis;
  }
}
