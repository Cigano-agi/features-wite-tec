import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { BillingLinksModule } from '../billing-links/billing-links.module';

@Module({
  imports: [BillingLinksModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
