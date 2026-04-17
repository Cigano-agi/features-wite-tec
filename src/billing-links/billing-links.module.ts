import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingLink } from './billing-link.entity';
import { BillingLinksService } from './billing-links.service';
import { BillingLinksController } from './billing-links.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BillingLink])],
  controllers: [BillingLinksController],
  providers: [BillingLinksService],
  exports: [BillingLinksService],
})
export class BillingLinksModule {}
