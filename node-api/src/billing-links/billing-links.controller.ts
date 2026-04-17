import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, HttpCode } from '@nestjs/common';
import { BillingLinksService } from './billing-links.service';
import { CreateBillingLinkDto } from './dto/create-billing-link.dto';
import { UpdateBillingLinkDto } from './dto/update-billing-link.dto';
import { JwtAuthGuard } from '../shared/auth/jwt-auth.guard';

@Controller('v1/billing-links')
@UseGuards(JwtAuthGuard)
export class BillingLinksController {
  constructor(private readonly service: BillingLinksService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateBillingLinkDto) {
    return this.service.create(req.user.sellerId, dto);
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.service.findAllBySeller(req.user.sellerId);
  }

  @Get('metrics')
  async metrics(@Req() req: any) {
    return this.service.getMetrics(req.user.sellerId);
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateBillingLinkDto) {
    return this.service.update(id, req.user.sellerId, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  async inactivate(@Req() req: any, @Param('id') id: string) {
    return this.service.inactivate(id, req.user.sellerId);
  }
}
