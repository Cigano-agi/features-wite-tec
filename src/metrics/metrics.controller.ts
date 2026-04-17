import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { BillingLinksService } from '../billing-links/billing-links.service';
import { JwtAuthGuard } from '../shared/auth/jwt-auth.guard';

@Controller('v1/billing-links')
@UseGuards(JwtAuthGuard)
export class MetricsController {
  constructor(private readonly billingLinksService: BillingLinksService) {}

  @Get('metrics')
  async getMetrics(@Req() req: any) {
    return this.billingLinksService.getMetrics(req.user.sellerId);
  }
}
