jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class {},
  OnEvent: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentIntentsService } from './payment-intents.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentIntentStatus } from '@prisma/client';
import {
  InsufficientFundsException,
  GatewayTimeoutException,
  CardOrAccountExpiredException,
  RateLimitExceededException,
  ResourceNotFoundException,
} from '../common/exceptions/domain.exceptions';

describe('PaymentIntentsService', () => {
  let service: PaymentIntentsService;

  const mockPrisma = {
    paymentIntent: {
      create: jest.fn().mockImplementation((args) => ({
        id: 'pi_cauri_mock123',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentIntentsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<PaymentIntentsService>(PaymentIntentsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create nominal payment intent with SUCCEEDED status (10000 XOF)', async () => {
    const result = await service.create('mch_test', 'req_001', {
      amount: 10000,
      currency: 'XOF',
      reference: 'CMD-1',
      customerPhone: '+2290166646310',
    });

    expect(result.status).toBe(PaymentIntentStatus.SUCCEEDED);
    expect(result.amount).toBe(10000);
    expect(result.failure_code).toBeNull();
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'payment-intent.created',
      expect.anything(),
    );
  });

  it('should throw InsufficientFundsException on magic value 4002', async () => {
    await expect(
      service.create('mch_test', 'req_002', {
        amount: 4002,
        currency: 'XOF',
        reference: 'CMD-2',
        customerPhone: '+2290166646310',
      }),
    ).rejects.toThrow(InsufficientFundsException);
  });

  it('should throw CardOrAccountExpiredException on magic value 4003', async () => {
    await expect(
      service.create('mch_test', 'req_003', {
        amount: 4003,
        currency: 'XOF',
        reference: 'CMD-3',
        customerPhone: '+2290166646310',
      }),
    ).rejects.toThrow(CardOrAccountExpiredException);
  });

  it('should throw RateLimitExceededException on magic value 4029', async () => {
    await expect(
      service.create('mch_test', 'req_004', {
        amount: 4029,
        currency: 'XOF',
        reference: 'CMD-4',
        customerPhone: '+2290166646310',
      }),
    ).rejects.toThrow(RateLimitExceededException);
  });

  it('should throw GatewayTimeoutException on magic value 5004', async () => {
    await expect(
      service.create('mch_test', 'req_005', {
        amount: 5004,
        currency: 'XOF',
        reference: 'CMD-5',
        customerPhone: '+2290166646310',
      }),
    ).rejects.toThrow(GatewayTimeoutException);
  });

  it('should throw ResourceNotFoundException when payment intent is not found', async () => {
    mockPrisma.paymentIntent.findFirst.mockResolvedValue(null);

    await expect(service.findOne('mch_test', 'pi_non_existent')).rejects.toThrow(
      ResourceNotFoundException,
    );
  });
});
