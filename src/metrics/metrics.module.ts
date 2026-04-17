import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { BillingLinksModule } from '../billing-links/billing-links.module';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [BillingLinksModule, PassportModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
