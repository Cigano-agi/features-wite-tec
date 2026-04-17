import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { PublicChargeService } from './public-charge.service';
import { BillingLinksService } from '../billing-links/billing-links.service';
import { IdempotencyService } from '../shared/idempotency/idempotency.service';
import { ConfigService } from '@nestjs/config';
import type { BillingLink } from '@prisma/client';

const makeLink = (): BillingLink => ({
  id: 'link-uuid-1',
  sellerId: 'seller-uuid-1',
  amount: 10000,
  description: 'Test product',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
} as BillingLink);

const IDEMPOTENCY_KEY = 'idem-key-abc';
const CORRELATION_ID = 'corr-id-xyz';

describe('PublicChargeService', () => {
  let service: PublicChargeService;
  let billingLinksService: jest.Mocked<BillingLinksService>;
  let idempotencyService: jest.Mocked<IdempotencyService>;
  let httpService: jest.Mocked<HttpService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    billingLinksService = { findActiveById: jest.fn() } as any;
    idempotencyService = { exists: jest.fn(), save: jest.fn(), checkOrSave: jest.fn() } as any;
    httpService = { post: jest.fn() } as any;
    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          PUBLIC_CHARGE_DEFAULT_EMAIL: 'noreply@witetec.com',
          PUBLIC_CHARGE_DEFAULT_PHONE: '+5500000000000',
        };
        return values[key];
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicChargeService,
        { provide: BillingLinksService, useValue: billingLinksService },
        { provide: IdempotencyService, useValue: idempotencyService },
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PublicChargeService>(PublicChargeService);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates transaction on happy path', async () => {
    billingLinksService.findActiveById.mockResolvedValue(makeLink());
    idempotencyService.exists.mockResolvedValue(null);
    httpService.post.mockReturnValue(of({
      data: { transactionId: 'tx-1', status: 'pending', amount: 10000 },
      status: 201, statusText: 'Created', headers: {}, config: {} as any,
    }));
    idempotencyService.save.mockResolvedValue(undefined);

    const result = await service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID);

    expect(result.transaction_id).toBe('tx-1');
    expect(result.billing_link_id).toBe('link-uuid-1');
    expect(httpService.post).toHaveBeenCalledWith(
      '/internal/transactions',
      expect.objectContaining({ billingLinkId: 'link-uuid-1' }),
      expect.objectContaining({ headers: { 'x-correlation-id': CORRELATION_ID } }),
    );
    expect(idempotencyService.save).toHaveBeenCalled();
  });

  it('throws NotFoundException when link inactive', async () => {
    billingLinksService.findActiveById.mockResolvedValue(null);
    await expect(
      service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID)
    ).rejects.toThrow(NotFoundException);
  });

  it('returns cached result with idempotent:true when key exists', async () => {
    const cached = { transaction_id: 'tx-existing', status: 'pending', amount: 10000, billing_link_id: 'link-uuid-1' };
    billingLinksService.findActiveById.mockResolvedValue(makeLink());
    idempotencyService.exists.mockResolvedValue(cached as any);

    const result = await service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID);

    expect(result.idempotent).toBe(true);
    expect(httpService.post).not.toHaveBeenCalled();
  });

  it('throws HttpException when HttpService fails', async () => {
    billingLinksService.findActiveById.mockResolvedValue(makeLink());
    idempotencyService.exists.mockResolvedValue(null);
    httpService.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

    await expect(
      service.charge('link-uuid-1', { name: 'John', cpf: '12345678901' }, IDEMPOTENCY_KEY, CORRELATION_ID)
    ).rejects.toThrow(HttpException);
  });
});
