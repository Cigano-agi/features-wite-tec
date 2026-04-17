import { Module } from '@nestjs/common';
import { BillingLinksService } from './billing-links.service';
import { BillingLinksController } from './billing-links.controller';

@Module({
  imports: [],
  controllers: [BillingLinksController],
  providers: [BillingLinksService],
  exports: [BillingLinksService],
})
export class BillingLinksModule {}
