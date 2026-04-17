import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingLinksModule } from './billing-links/billing-links.module';
import { PublicChargeModule } from './public-charge/public-charge.module';
import { MetricsModule } from './metrics/metrics.module';
import { BillingLink } from './billing-links/billing-link.entity';
import { CorrelationIdMiddleware } from './shared/correlation/correlation-id.middleware';
import { RateLimiterMiddleware } from './shared/rate-limit/rate-limiter.middleware';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/witetec',
      entities: [BillingLink],
      synchronize: false,
    }),
    BillingLinksModule,
    PublicChargeModule,
    MetricsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    consumer.apply(RateLimiterMiddleware).forRoutes('v1/public/charge/:linkId');
  }
}
