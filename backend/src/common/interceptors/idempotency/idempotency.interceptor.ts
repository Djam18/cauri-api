import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { createHash } from 'crypto';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const idempotencyKey = request.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new BadRequestException(
        "Missing required 'Idempotency-Key' header for transactional operation.",
      );
    }

    const merchant = (request as any).merchant;
    if (!merchant) {
      return next.handle();
    }

    // Compute canonical SHA-256 payload hash to detect conflicting payloads with same key
    const currentPayloadHash = createHash('sha256')
      .update(JSON.stringify(request.body || {}))
      .digest('hex');

    // 1. Check existing idempotency record
    const existingRecord = await this.prisma.idempotencyKey.findUnique({
      where: {
        uq_merchant_key: {
          merchantId: merchant.id,
          key: idempotencyKey,
        },
      },
    });

    if (existingRecord) {
      // RULE 1: If payload differs from original request, reject (Stripe Specification)
      if (existingRecord.payloadHash !== currentPayloadHash) {
        throw new UnprocessableEntityException(
          `Idempotency-Key '${idempotencyKey}' was previously used with a different request payload. Duplicate keys cannot alter parameters.`,
        );
      }

      // RULE 2: If previous request is currently in-flight, reject concurrent race condition
      if (existingRecord.status === 'PROCESSING') {
        throw new ConflictException(
          `Concurrent request with Idempotency-Key '${idempotencyKey}' is currently in progress. Please retry shortly.`,
        );
      }

      // RULE 3: If already resolved, replay cached response with HIT header
      if (existingRecord.status === 'RESOLVED' && existingRecord.responseBody) {
        this.logger.log(`Idempotency HIT for key [${idempotencyKey}] - replaying response`);
        response.setHeader('X-Cache-Lookup', 'HIT');
        response.status(existingRecord.responseStatus || 200);
        return of(existingRecord.responseBody);
      }
    }

    // 2. Atomically acquire lock by inserting record with status 'PROCESSING'
    let lockRecordId: string;
    try {
      const lockRecord = await this.prisma.idempotencyKey.create({
        data: {
          merchantId: merchant.id,
          key: idempotencyKey,
          payloadHash: currentPayloadHash,
          status: 'PROCESSING',
        },
      });
      lockRecordId = lockRecord.id;
    } catch (error: any) {
      // If caught in an instantaneous race condition (P2002 Unique Violation)
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Concurrent duplicate transaction detected for Idempotency-Key '${idempotencyKey}'.`,
        );
      }
      throw error;
    }

    response.setHeader('X-Cache-Lookup', 'MISS');

    // 3. Process operation and update idempotency lock to RESOLVED or FAILED
    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          await this.prisma.idempotencyKey.update({
            where: { id: lockRecordId },
            data: {
              status: 'RESOLVED',
              responseStatus: response.statusCode || 201,
              responseBody: responseData,
            },
          });
        } catch (updateError) {
          this.logger.error(`Failed to resolve idempotency lock: ${updateError}`);
        }
      }),
      catchError(async (err) => {
        try {
          await this.prisma.idempotencyKey.update({
            where: { id: lockRecordId },
            data: { status: 'FAILED' },
          });
        } catch (_) {}
        throw err;
      }),
    );
  }
}
