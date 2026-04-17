import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { BillingLinksService } from './billing-links.service';
import { BillingLink } from './billing-link.entity';

const makeLink = (overrides: Partial<BillingLink> = {}): BillingLink =>
  Object.assign(new BillingLink(), {
    id: 'link-uuid-1',
    sellerId: 'seller-uuid-1',
    amount: 10000,
    description: 'Test product',
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

describe('BillingLinksService', () => {
  let service: BillingLinksService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingLinksService,
        { provide: getRepositoryToken(BillingLink), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BillingLinksService>(BillingLinksService);
  });

  describe('create', () => {
    it('creates a billing link with seller_id from token, status active', async () => {
      const link = makeLink();
      mockRepo.create.mockReturnValue(link);
      mockRepo.save.mockResolvedValue(link);

      const result = await service.create('seller-uuid-1', { amount: 10000, description: 'Test' });

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ sellerId: 'seller-uuid-1', status: 'active' }));
      expect(result.status).toBe('active');
    });
  });

  describe('findAllBySeller', () => {
    it('returns only links belonging to the seller', async () => {
      const links = [makeLink({ sellerId: 'seller-a' }), makeLink({ id: 'link-2', sellerId: 'seller-a' })];
      mockRepo.find.mockResolvedValue(links);

      const result = await service.findAllBySeller('seller-a');

      expect(mockRepo.find).toHaveBeenCalledWith({ where: { sellerId: 'seller-a' }, order: { createdAt: 'DESC' } });
      expect(result).toHaveLength(2);
    });
  });

  describe('inactivate', () => {
    it('sets status to inactive', async () => {
      const link = makeLink({ status: 'active' });
      mockRepo.findOne.mockResolvedValue(link);
      mockRepo.save.mockImplementation((l: BillingLink) => Promise.resolve(l));

      const result = await service.inactivate('link-uuid-1', 'seller-uuid-1');

      expect(result.status).toBe('inactive');
    });

    it('throws NotFoundException when link does not belong to seller', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.inactivate('link-uuid-1', 'other-seller')).rejects.toThrow(NotFoundException);
    });
  });

  describe('seller_id isolation', () => {
    it('findByIdAndSeller throws when seller mismatch', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findByIdAndSeller('link-uuid-1', 'wrong-seller')).rejects.toThrow(NotFoundException);
    });

    it('findByIdAndSeller always includes sellerId in query', async () => {
      const link = makeLink();
      mockRepo.findOne.mockResolvedValue(link);

      await service.findByIdAndSeller('link-uuid-1', 'seller-uuid-1');

      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 'link-uuid-1', sellerId: 'seller-uuid-1' } });
    });
  });

  describe('getMetrics', () => {
    it('returns active link count for the seller', async () => {
      mockRepo.count.mockResolvedValue(5);
      const result = await service.getMetrics('seller-uuid-1');

      expect(result.active_links).toBe(5);
      expect(result).toHaveProperty('total_approved');
      expect(result).toHaveProperty('total_pending');
    });
  });
});
