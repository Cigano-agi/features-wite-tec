import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingLink } from './billing-link.entity';
import { CreateBillingLinkDto } from './dto/create-billing-link.dto';
import { UpdateBillingLinkDto } from './dto/update-billing-link.dto';

@Injectable()
export class BillingLinksService {
  constructor(
    @InjectRepository(BillingLink)
    private readonly repo: Repository<BillingLink>,
  ) {}

  async create(sellerId: string, dto: CreateBillingLinkDto): Promise<BillingLink> {
    const link = this.repo.create({ sellerId, ...dto, status: 'active' });
    return this.repo.save(link);
  }

  async findAllBySeller(sellerId: string): Promise<BillingLink[]> {
    return this.repo.find({ where: { sellerId }, order: { createdAt: 'DESC' } });
  }

  async findActiveById(id: string): Promise<BillingLink | null> {
    return this.repo.findOne({ where: { id, status: 'active' } });
  }

  async findByIdAndSeller(id: string, sellerId: string): Promise<BillingLink> {
    const link = await this.repo.findOne({ where: { id, sellerId } });
    if (!link) throw new NotFoundException('billing_link_not_found');
    return link;
  }

  async update(id: string, sellerId: string, dto: UpdateBillingLinkDto): Promise<BillingLink> {
    const link = await this.findByIdAndSeller(id, sellerId);
    Object.assign(link, dto);
    return this.repo.save(link);
  }

  async inactivate(id: string, sellerId: string): Promise<BillingLink> {
    const link = await this.findByIdAndSeller(id, sellerId);
    link.status = 'inactive';
    return this.repo.save(link);
  }

  async getMetrics(sellerId: string): Promise<{ active_links: number; total_approved: number; total_pending: number }> {
    const activeLinks = await this.repo.count({ where: { sellerId, status: 'active' } });
    // TODO: TECH_LEAD_REVIEW — total_approved/total_pending require join with transactions table (out of billing_links schema scope)
    return { active_links: activeLinks, total_approved: 0, total_pending: 0 };
  }
}
