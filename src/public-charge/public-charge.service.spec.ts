import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, HttpException } from '@nestjs/common';
import { PublicChargeService } from './public-charge.service';
import { BillingLinksService } from '../billing-links/billing-links.service';
import { IdempotencyService } from '../shared/idempotency/idempotency.service';
import { BillingLink } from '../billing-links/billing-link.entity';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeLink = (): BillingLink =>
  Object.assign(new BillingLink(), {
    id: 'link-uuid-1',
    sellerId: 'seller-uuid-1',
    amount: 10000,
    description: 'Test product',
    status: 'active' as const,
  });

const IDEMPOTENCY_KEY = 'idem-key-abc';
const CORRELATION_ID = 'corr-id-xyz';

describe('PublicChargeService', () => {
  let service: PublicChargeService;
  let billingLinksService: jest.Mocked<BillingLinksService>;
  let idempotencyService: jest.Mocked<IdempotencyService>;

  beforeEach(async () => {
    billingLinksService = {
      findActiveById: jest.fn(),
    } as any;

    idempotencyService = {
      exists: jest.fn(),
      save: jest.fn(),
      checkOrSave: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicChargeService,
        { provide: BillingLinksService, useValue: billingLinksService },
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    }).compile();

    service = module.get<PublicChargeService>(PublicChargeService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('happy path', () => {
    it('creates transaction and returns result', async () => {
      billingLinksService.findActiveById.mockResolvedValue(makeLink());
      idempotencyService.exists.mockResolvedValue(null);
      (mockedAxios.post as jest.Mock).mockResolvedValue({
        data: { transactionId: 'tx-1', status: 'pending', amount: 10000 },
      });
      idempotencyService.save.mockResolvedValue(undefined);

      const result = await service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID);

      expect(result.transaction_id).toBe('tx-1');
      expect(result.billing_link_id).toBe('link-uuid-1');
      expect(idempotencyService.save).toHaveBeenCalled();
    });
  });

  describe('inactive link', () => {
    it('throws NotFoundException when link is not active', async () => {
      billingLinksService.findActiveById.mockResolvedValue(null);

      await expect(
        service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('idempotency', () => {
    it('returns cached result when idempotency key already exists (409)', async () => {
      const cached = { transaction_id: 'tx-existing', status: 'pending', amount: 10000, billing_link_id: 'link-uuid-1' };
      billingLinksService.findActiveById.mockResolvedValue(makeLink());
      idempotencyService.exists.mockResolvedValue(cached as any);

      const result = await service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID);

      expect(result.idempotent).toBe(true);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('dotnet timeout', () => {
    it('throws HttpException when dotnet-service is unavailable', async () => {
      billingLinksService.findActiveById.mockResolvedValue(makeLink());
      idempotencyService.exists.mockResolvedValue(null);
      (mockedAxios.post as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID)
      ).rejects.toThrow(HttpException);
    });
  });
});
