import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentIntentCreatedEvent } from '../webhooks/events/payment-intent-created.event';
import { PaymentIntentStatus } from '@prisma/client';

@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    merchantId: string,
    idempotencyKey: string,
    dto: CreatePaymentIntentDto,
  ) {
    const amountBigInt = BigInt(dto.amount);

    // =========================================================================
    // DETERMINISTIC MAGIC VALUES SIMULATION ENGINE
    // =========================================================================
    let status: PaymentIntentStatus = PaymentIntentStatus.SUCCEEDED;
    let failureCode: string | null = null;
    let failureMessage: string | null = null;

    if (dto.amount === 4002) {
      status = PaymentIntentStatus.FAILED;
      failureCode = 'INSUFFICIENT_FUNDS';
      failureMessage = 'The customer account or wallet does not have sufficient balance.';
    } else if (dto.amount === 4003) {
      status = PaymentIntentStatus.FAILED;
      failureCode = 'CARD_OR_ACCOUNT_EXPIRED';
      failureMessage = 'The selected payment method or mobile wallet session has expired.';
    } else if (dto.amount === 4029) {
      status = PaymentIntentStatus.FAILED;
      failureCode = 'RATE_LIMIT_EXCEEDED';
      failureMessage = 'The daily transaction threshold for this customer has been exceeded.';
    } else if (dto.amount === 5004) {
      status = PaymentIntentStatus.FAILED;
      failureCode = 'GATEWAY_TIMEOUT';
      failureMessage = 'Upstream telecom or bank network timed out after 30000ms.';
    }

    try {
      const paymentIntent = await this.prisma.paymentIntent.create({
        data: {
          merchantId,
          amount: amountBigInt,
          currency: dto.currency || 'XOF',
          reference: dto.reference,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          status,
          failureCode,
          failureMessage,
          idempotencyKey,
        },
      });

      this.logger.log(
        `PaymentIntent created: ${paymentIntent.id} (Status: ${paymentIntent.status}, Amount: ${dto.amount} ${paymentIntent.currency})`,
      );

      const formatted = this.formatResponse(paymentIntent);

      // Emit event asynchronously to decouple webhook dispatching and audit logging
      this.eventEmitter.emit(
        'payment-intent.created',
        new PaymentIntentCreatedEvent(merchantId, formatted, dto.webhookUrl),
      );

      return formatted;
    } catch (error: any) {
      // PostgreSQL Unique constraint violation code 23505 (P2002 in Prisma)
      if (error.code === 'P2002') {
        const existing = await this.prisma.paymentIntent.findUnique({
          where: {
            uq_merchant_idempotency: {
              merchantId,
              idempotencyKey,
            },
          },
        });
        if (existing) {
          return this.formatResponse(existing);
        }
        throw new ConflictException('Concurrent duplicate transaction in progress.');
      }
      throw error;
    }
  }

  async findOne(merchantId: string, id: string) {
    const paymentIntent = await this.prisma.paymentIntent.findFirst({
      where: {
        id,
        merchantId,
      },
    });

    if (!paymentIntent) {
      throw new NotFoundException(`Payment intent '${id}' not found.`);
    }

    return this.formatResponse(paymentIntent);
  }

  /**
   * Safely serializes BigInt to Number for JSON compliance
   */
  public formatResponse(paymentIntent: any) {
    return {
      id: paymentIntent.id,
      object: 'payment_intent',
      amount: Number(paymentIntent.amount),
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      reference: paymentIntent.reference,
      customer_phone: paymentIntent.customerPhone,
      customer_email: paymentIntent.customerEmail,
      failure_code: paymentIntent.failureCode,
      failure_message: paymentIntent.failureMessage,
      created_at: paymentIntent.createdAt.toISOString(),
      updated_at: paymentIntent.updatedAt.toISOString(),
    };
  }
}
