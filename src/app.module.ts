import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './shared/auth/auth.module';
import { BillingLinksModule } from './billing-links/billing-links.module';
import { PublicChargeModule } from './public-charge/public-charge.module';
import { MetricsModule } from './metrics/metrics.module';
import { CorrelationIdMiddleware } from './shared/correlation/correlation-id.middleware';
import { RateLimiterMiddleware } from './shared/rate-limit/rate-limiter.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().default('redis://localhost:6379'),
        JWT_SECRET: Joi.string().required(),
        DOTNET_SERVICE_URL: Joi.string().default('http://localhost:5001'),
        PUBLIC_CHARGE_DEFAULT_EMAIL: Joi.string().email().default('noreply@witetec.com'),
        PUBLIC_CHARGE_DEFAULT_PHONE: Joi.string().default('+5500000000000'),
        RATE_LIMIT_PER_MINUTE: Joi.number().integer().default(30),
        IDEMPOTENCY_TTL_SECONDS: Joi.number().integer().default(86400),
        PORT: Joi.number().integer().default(3000),
      }),
    }),
    PrismaModule,
    AuthModule,
    BillingLinksModule,
    PublicChargeModule,
    MetricsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*splat}');
    consumer.apply(RateLimiterMiddleware).forRoutes('v1/public/charge/:linkId');
  }
}
