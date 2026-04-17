import { Module } from '@nestjs/common';
import { PublicChargeController } from './public-charge.controller';
import { PublicChargeService } from './public-charge.service';
import { BillingLinksModule } from '../billing-links/billing-links.module';
import { IdempotencyService } from '../shared/idempotency/idempotency.service';
import { PspModule } from '../shared/psp/psp.module';

@Module({
  imports: [BillingLinksModule, PspModule],
  controllers: [PublicChargeController],
  providers: [PublicChargeService, IdempotencyService],
})
export class PublicChargeModule {}
