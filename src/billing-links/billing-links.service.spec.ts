import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BillingLinksService } from './billing-links.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import type { BillingLink } from '@prisma/client';

const makeLink = (overrides: Partial<BillingLink> = {}): BillingLink => ({
  id: 'link-uuid-1',
  sellerId: 'seller-uuid-1',
  amount: 10000,
  description: 'Test product',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as BillingLink);

describe('BillingLinksService', () => {
  let service: BillingLinksService;
  let prisma: { billingLink: any };

  beforeEach(async () => {
    prisma = {
      billingLink: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingLinksService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BillingLinksService>(BillingLinksService);
  });

  describe('create', () => {
    it('calls prisma.billingLink.create with sellerId, dto fields, status active', async () => {
      const link = makeLink();
      prisma.billingLink.create.mockResolvedValue(link);
      const result = await service.create('seller-uuid-1', { amount: 10000, description: 'Test' } as any);
      expect(prisma.billingLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sellerId: 'seller-uuid-1', amount: 10000, description: 'Test', status: 'active' }),
      });
      expect(result).toEqual(link);
    });
  });

  describe('findAllBySeller', () => {
    it('uses findMany with seller filter ordered by createdAt desc', async () => {
      const links = [makeLink({ sellerId: 'seller-a' }), makeLink({ id: 'link-2', sellerId: 'seller-a' })];
      prisma.billingLink.findMany.mockResolvedValue(links);
      const result = await service.findAllBySeller('seller-a');
      expect(prisma.billingLink.findMany).toHaveBeenCalledWith({ where: { sellerId: 'seller-a' }, orderBy: { createdAt: 'desc' } });
      expect(result).toHaveLength(2);
    });
  });

  describe('findByIdAndSeller', () => {
    it('returns link when prisma returns one', async () => {
      const link = makeLink();
      prisma.billingLink.findFirst.mockResolvedValue(link);
      const result = await service.findByIdAndSeller('link-uuid-1', 'seller-uuid-1');
      expect(prisma.billingLink.findFirst).toHaveBeenCalledWith({ where: { id: 'link-uuid-1', sellerId: 'seller-uuid-1' } });
      expect(result).toEqual(link);
    });

    it('throws NotFoundException when prisma returns null', async () => {
      prisma.billingLink.findFirst.mockResolvedValue(null);
      await expect(service.findByIdAndSeller('link-uuid-1', 'wrong-seller')).rejects.toThrow(NotFoundException);
    });
  });

  describe('inactivate', () => {
    it('sets status to inactive via prisma.update', async () => {
      const link = makeLink({ status: 'active' });
      prisma.billingLink.findFirst.mockResolvedValue(link);
      prisma.billingLink.update.mockResolvedValue({ ...link, status: 'inactive' });
      const result = await service.inactivate('link-uuid-1', 'seller-uuid-1');
      expect(prisma.billingLink.update).toHaveBeenCalledWith({
        where: { id: 'link-uuid-1' },
        data: { status: 'inactive' },
      });
      expect(result.status).toBe('inactive');
    });

    it('throws NotFoundException when link does not belong to seller', async () => {
      prisma.billingLink.findFirst.mockResolvedValue(null);
      await expect(service.inactivate('link-uuid-1', 'other-seller')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMetrics', () => {
    it('returns active link count for the seller', async () => {
      prisma.billingLink.count.mockResolvedValue(5);
      const result = await service.getMetrics('seller-uuid-1');
      expect(prisma.billingLink.count).toHaveBeenCalledWith({ where: { sellerId: 'seller-uuid-1', status: 'active' } });
      expect(result).toEqual({ active_links: 5, total_approved: 0, total_pending: 0 });
    });
  });
});
