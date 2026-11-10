import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { PrismaService } from '../../../prisma/prisma.service';
import { of } from 'rxjs';
import { createHash } from 'crypto';
import {
  MissingIdempotencyKeyException,
  IdempotencyPayloadMismatchException,
  IdempotencyConflictException,
} from '../../exceptions/domain.exceptions';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let prisma: PrismaService;

  const mockPrisma = {
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    interceptor = module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  const createMockContext = (headers: Record<string, string>, body: any = {}) => {
    const request = {
      headers,
      body,
      merchant: { id: 'mch_001' },
    };
    const response = {
      setHeader: jest.fn(),
      status: jest.fn(),
      statusCode: 201,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      response,
    };
  };

  it('should throw MissingIdempotencyKeyException if Idempotency-Key header is missing', async () => {
    const { switchToHttp } = createMockContext({});
    const next = { handle: () => of('result') };

    await expect(
      interceptor.intercept({ switchToHttp } as any, next),
    ).rejects.toThrow(MissingIdempotencyKeyException);
  });

  it('should replay cached response with HIT header if record is RESOLVED', async () => {
    const body = { amount: 10000 };
    const payloadHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');

    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idemp_1',
      key: 'req_001',
      payloadHash,
      status: 'RESOLVED',
      responseStatus: 201,
      responseBody: { id: 'pi_1', status: 'SUCCEEDED' },
    });

    const { switchToHttp, response } = createMockContext({ 'idempotency-key': 'req_001' }, body);
    const next = { handle: () => of('new_result') };

    const result$ = await interceptor.intercept({ switchToHttp } as any, next);
    const result = await new Promise((resolve) => result$.subscribe(resolve));

    expect(response.setHeader).toHaveBeenCalledWith('X-Cache-Lookup', 'HIT');
    expect(result).toEqual({ id: 'pi_1', status: 'SUCCEEDED' });
  });

  it('should throw IdempotencyPayloadMismatchException if same key is reused with a different payload', async () => {
    const originalBody = { amount: 10000 };
    const originalPayloadHash = createHash('sha256').update(JSON.stringify(originalBody)).digest('hex');

    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idemp_1',
      key: 'req_001',
      payloadHash: originalPayloadHash,
      status: 'RESOLVED',
    });

    // Client attempts to send 50000 with the exact same idempotency key
    const conflictingBody = { amount: 50000 };
    const { switchToHttp } = createMockContext({ 'idempotency-key': 'req_001' }, conflictingBody);
    const next = { handle: () => of('result') };

    await expect(
      interceptor.intercept({ switchToHttp } as any, next),
    ).rejects.toThrow(IdempotencyPayloadMismatchException);
  });

  it('should throw IdempotencyConflictException if previous request is still in-flight (PROCESSING)', async () => {
    const body = { amount: 10000 };
    const payloadHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');

    mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
      id: 'idemp_1',
      key: 'req_001',
      payloadHash,
      status: 'PROCESSING',
    });

    const { switchToHttp } = createMockContext({ 'idempotency-key': 'req_001' }, body);
    const next = { handle: () => of('result') };

    await expect(
      interceptor.intercept({ switchToHttp } as any, next),
    ).rejects.toThrow(IdempotencyConflictException);
  });
});
