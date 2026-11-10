jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class {},
  OnEvent: () => () => {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('WebhooksService', () => {
  let service: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: PrismaService,
          useValue: {
            merchant: { findUnique: jest.fn() },
            webhookDelivery: { create: jest.fn() },
          },
        },
        {
          provide: AuditService,
          useValue: {
            recordWebhookAudit: jest.fn(),
            getMerchantAuditLogs: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should compute valid HMAC-SHA256 signature', () => {
    const payload = JSON.stringify({ event: 'test', amount: 10000 });
    const secret = 'whsec_test_secret_123';
    const timestamp = 1731154000;

    const signature = service.computeSignature(payload, secret, timestamp);
    expect(signature).toBeDefined();
    expect(signature.length).toBe(64); // SHA-256 hex length
  });

  it('should verify signature successfully using timing-safe comparison', () => {
    const payload = JSON.stringify({ event: 'payment_intent.succeeded', amount: 10000 });
    const secret = 'whsec_test_secret_123';
    const timestamp = Math.floor(Date.now() / 1000);

    const signature = service.computeSignature(payload, secret, timestamp);
    const headerValue = `t=${timestamp},v1=${signature}`;

    const verification = service.verifySignature(payload, secret, headerValue);
    expect(verification.isValid).toBe(true);
  });

  it('should reject tampered signature', () => {
    const payload = JSON.stringify({ event: 'payment_intent.succeeded', amount: 10000 });
    const secret = 'whsec_test_secret_123';
    const timestamp = Math.floor(Date.now() / 1000);

    const fakeSignature = 'a'.repeat(64);
    const headerValue = `t=${timestamp},v1=${fakeSignature}`;

    const verification = service.verifySignature(payload, secret, headerValue);
    expect(verification.isValid).toBe(false);
  });

  it('should reject expired signature to defeat replay attacks (>300s)', () => {
    const payload = JSON.stringify({ event: 'payment_intent.succeeded', amount: 10000 });
    const secret = 'whsec_test_secret_123';
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago

    const signature = service.computeSignature(payload, secret, oldTimestamp);
    const headerValue = `t=${oldTimestamp},v1=${signature}`;

    const verification = service.verifySignature(payload, secret, headerValue);
    expect(verification.isValid).toBe(false);
    expect(verification.reason).toContain('Replay attack');
  });
});
