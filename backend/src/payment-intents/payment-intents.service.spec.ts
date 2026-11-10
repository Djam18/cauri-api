jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class {},
  OnEvent: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentIntentsService } from './payment-intents.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentIntentStatus } from '@prisma/client';

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

  it('should trigger INSUFFICIENT_FUNDS on magic value 4002', async () => {
    const result = await service.create('mch_test', 'req_002', {
      amount: 4002,
      currency: 'XOF',
      reference: 'CMD-2',
      customerPhone: '+2290166646310',
    });

    expect(result.status).toBe(PaymentIntentStatus.FAILED);
    expect(result.failure_code).toBe('INSUFFICIENT_FUNDS');
  });

  it('should trigger GATEWAY_TIMEOUT on magic value 5004', async () => {
    const result = await service.create('mch_test', 'req_003', {
      amount: 5004,
      currency: 'XOF',
      reference: 'CMD-3',
      customerPhone: '+2290166646310',
    });

    expect(result.status).toBe(PaymentIntentStatus.FAILED);
    expect(result.failure_code).toBe('GATEWAY_TIMEOUT');
  });
});
