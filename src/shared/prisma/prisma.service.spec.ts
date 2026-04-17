import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    service = module.get<PrismaService>(PrismaService);
    // Stub inherited PrismaClient methods to avoid hitting a real DB
    (service as any).$connect = jest.fn().mockResolvedValue(undefined);
    (service as any).$disconnect = jest.fn().mockResolvedValue(undefined);
  });

  it('is defined and extends PrismaClient surface ($connect/$disconnect available)', () => {
    expect(service).toBeDefined();
    expect(typeof (service as any).$connect).toBe('function');
    expect(typeof (service as any).$disconnect).toBe('function');
  });

  it('onModuleInit calls $connect exactly once', async () => {
    await service.onModuleInit();
    expect((service as any).$connect).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy calls $disconnect exactly once', async () => {
    await service.onModuleDestroy();
    expect((service as any).$disconnect).toHaveBeenCalledTimes(1);
  });
});
