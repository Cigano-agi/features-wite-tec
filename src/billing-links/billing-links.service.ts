import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { CreateBillingLinkDto } from './dto/create-billing-link.dto';
import { UpdateBillingLinkDto } from './dto/update-billing-link.dto';
import type { BillingLink } from '@prisma/client';

@Injectable()
export class BillingLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(sellerId: string, dto: CreateBillingLinkDto): Promise<BillingLink> {
    return this.prisma.billingLink.create({
      data: { sellerId, amount: dto.amount, description: dto.description, status: 'active' },
    });
  }

  async findAllBySeller(sellerId: string): Promise<BillingLink[]> {
    return this.prisma.billingLink.findMany({ where: { sellerId }, orderBy: { createdAt: 'desc' } });
  }

  async findActiveById(id: string): Promise<BillingLink | null> {
    return this.prisma.billingLink.findFirst({ where: { id, status: 'active' } });
  }

  async findByIdAndSeller(id: string, sellerId: string): Promise<BillingLink> {
    const link = await this.prisma.billingLink.findFirst({ where: { id, sellerId } });
    if (!link) throw new NotFoundException('billing_link_not_found');
    return link;
  }

  async update(id: string, sellerId: string, dto: UpdateBillingLinkDto): Promise<BillingLink> {
    await this.findByIdAndSeller(id, sellerId);
    return this.prisma.billingLink.update({
      where: { id },
      data: { ...dto },
    });
  }

  async inactivate(id: string, sellerId: string): Promise<BillingLink> {
    await this.findByIdAndSeller(id, sellerId);
    return this.prisma.billingLink.update({
      where: { id },
      data: { status: 'inactive' },
    });
  }

  async getMetrics(sellerId: string): Promise<{ active_links: number; total_approved: number; total_pending: number }> {
    const activeLinks = await this.prisma.billingLink.count({ where: { sellerId, status: 'active' } });
    return { active_links: activeLinks, total_approved: 0, total_pending: 0 };
  }
}
