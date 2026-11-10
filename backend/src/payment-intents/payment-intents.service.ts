import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentIntentCreatedEvent } from '../webhooks/events/payment-intent-created.event';
import { PaymentIntentStatus } from '@prisma/client';
import {
  InsufficientFundsException,
  CardOrAccountExpiredException,
  RateLimitExceededException,
  GatewayTimeoutException,
  IdempotencyConflictException,
  ResourceNotFoundException,
} from '../common/exceptions/domain.exceptions';

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
    // =========================================================================
    // DOMAIN VALIDATION & DETERMINISTIC MAGIC VALUES SIMULATION
    // =========================================================================
    if (dto.amount === 4002) {
      this.logger.warn(`Simulating domain failure: Insufficient funds for amount ${dto.amount}`);
      throw new InsufficientFundsException(dto.amount, dto.currency);
    }

    if (dto.amount === 4003) {
      this.logger.warn(`Simulating domain failure: Card/account expired for amount ${dto.amount}`);
      throw new CardOrAccountExpiredException();
    }

    if (dto.amount === 4029) {
      this.logger.warn(`Simulating domain failure: Rate limit exceeded for amount ${dto.amount}`);
      throw new RateLimitExceededException();
    }

    if (dto.amount === 5004) {
      this.logger.warn(`Simulating domain failure: Gateway timeout for amount ${dto.amount}`);
      throw new GatewayTimeoutException();
    }

    const amountBigInt = BigInt(dto.amount);

    try {
      const paymentIntent = await this.prisma.paymentIntent.create({
        data: {
          merchantId,
          amount: amountBigInt,
          currency: dto.currency || 'XOF',
          reference: dto.reference,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          status: PaymentIntentStatus.SUCCEEDED,
          failureCode: null,
          failureMessage: null,
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
        throw new IdempotencyConflictException(idempotencyKey);
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
      throw new ResourceNotFoundException('PaymentIntent', id);
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
