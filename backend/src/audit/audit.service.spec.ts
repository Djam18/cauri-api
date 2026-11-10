import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { ConfigService } from '@nestjs/config';

describe('AuditService (NoSQL MongoDB)', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null), // Test fallback mode without Mongo instance
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should handle recordWebhookAudit gracefully in fallback mode when Mongo is disconnected', async () => {
    await expect(
      service.recordWebhookAudit({
        eventId: 'evt_test_001',
        eventType: 'payment_intent.succeeded',
        merchantId: 'mch_001',
        paymentIntentId: 'pi_001',
        targetUrl: 'https://webhook.site/test',
        payload: { amount: 10000 },
        signatureSent: 't=123,v1=abc',
        statusCode: 200,
        status: 'DELIVERED',
      }),
    ).resolves.not.toThrow();
  });

  it('should return empty list gracefully when Mongo is disconnected', async () => {
    const logs = await service.getMerchantAuditLogs('mch_001');
    expect(logs).toEqual([]);
  });
});
