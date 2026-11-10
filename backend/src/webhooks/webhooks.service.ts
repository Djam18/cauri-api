import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentIntentCreatedEvent } from './events/payment-intent-created.event';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { WebhookDeliveryStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Computes standardized cryptographic HMAC-SHA256 signature
   * Scheme: t=<timestamp>,v1=<hmac_sha256>
   */
  public computeSignature(payloadString: string, secret: string, timestamp: number): string {
    const signedPayload = `${timestamp}.${payloadString}`;
    return createHmac('sha256', secret).update(signedPayload).digest('hex');
  }

  /**
   * Constant-time timing-safe signature validator to defeat timing attacks
   */
  public verifySignature(
    payloadString: string,
    secret: string,
    headerValue: string,
    toleranceSeconds = 300,
  ): { isValid: boolean; reason?: string } {
    const parts = headerValue.split(',');
    const timestampPart = parts.find((p) => p.startsWith('t='));
    const signaturePart = parts.find((p) => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { isValid: false, reason: 'Malformed signature header format' };
    }

    const timestamp = parseInt(timestampPart.slice(2), 10);
    const receivedSignature = signaturePart.slice(3);

    // Replay attack protection
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
      return { isValid: false, reason: 'Signature timestamp outside tolerance window (Replay attack)' };
    }

    const expectedSignature = this.computeSignature(payloadString, secret, timestamp);

    const receivedBuffer = Buffer.from(receivedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return { isValid: false, reason: 'Signature length mismatch' };
    }

    // Constant-time comparison
    const isValid = timingSafeEqual(receivedBuffer, expectedBuffer);
    return { isValid, reason: isValid ? undefined : 'Signature cryptographic verification failed' };
  }

  /**
   * Asynchronous event listener decoupling webhook dispatch from client request latency
   */
  @OnEvent('payment-intent.created', { async: true })
  async handlePaymentIntentCreated(event: PaymentIntentCreatedEvent) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: event.merchantId },
    });

    if (!merchant) return;

    const targetUrl = event.webhookUrl || merchant.webhookUrl;
    if (!targetUrl) {
      this.logger.debug(`No webhook URL configured for merchant ${merchant.id}`);
      return;
    }

    const eventType =
      event.paymentIntent.status === 'SUCCEEDED'
        ? 'payment_intent.succeeded'
        : 'payment_intent.failed';

    const webhookPayload = {
      id: `evt_cauri_${randomUUID()}`,
      event: eventType,
      created_at: new Date().toISOString(),
      data: event.paymentIntent,
    };

    const payloadString = JSON.stringify(webhookPayload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureHex = this.computeSignature(payloadString, merchant.webhookSecret, timestamp);
    const signatureHeader = `t=${timestamp},v1=${signatureHex}`;

    let statusCode: number | null = null;
    let status: WebhookDeliveryStatus = WebhookDeliveryStatus.DELIVERED;

    try {
      this.logger.log(`Dispatching signed webhook to: ${targetUrl}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cauri-Signature': signatureHeader,
          'User-Agent': 'Cauri-Webhook-Dispatcher/1.0',
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      statusCode = response.status;

      if (!response.ok) {
        status = WebhookDeliveryStatus.RETRYING;
        this.logger.warn(`Webhook endpoint responded with status ${response.status}`);
      } else {
        this.logger.log(`Webhook successfully delivered to ${targetUrl} (HTTP ${response.status})`);
      }
    } catch (err: any) {
      this.logger.error(`Webhook delivery network failed: ${err.message}`);
      status = WebhookDeliveryStatus.RETRYING;
    }

    // Persist delivery audit record in database (PostgreSQL transactional)
    await this.prisma.webhookDelivery.create({
      data: {
        paymentIntentId: event.paymentIntent.id,
        eventType,
        payload: webhookPayload,
        targetUrl,
        statusCode,
        status,
        signatureSent: signatureHeader,
        attemptCount: 1,
      },
    });

    // Persist high-volume raw JSON audit log in NoSQL store (MongoDB)
    await this.auditService.recordWebhookAudit({
      eventId: webhookPayload.id,
      eventType,
      merchantId: event.merchantId,
      paymentIntentId: event.paymentIntent.id,
      targetUrl,
      payload: webhookPayload,
      signatureSent: signatureHeader,
      statusCode,
      status,
    });
  }
}
