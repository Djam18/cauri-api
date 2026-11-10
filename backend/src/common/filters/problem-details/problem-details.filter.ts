import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  DomainException,
  InsufficientFundsException,
  CardOrAccountExpiredException,
  RateLimitExceededException,
  GatewayTimeoutException,
  CustomerCancelledException,
  UssdTimeoutException,
  MissingIdempotencyKeyException,
  IdempotencyConflictException,
  IdempotencyPayloadMismatchException,
  ResourceNotFoundException,
  MerchantNotFoundException,
} from '../../exceptions/domain.exceptions';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let detail = 'An unexpected internal error occurred.';
    let title = 'Internal Server Error';

    // 1. Map Pure Domain Exceptions to Standard HTTP Status Codes
    if (exception instanceof DomainException) {
      title = exception.name;
      code = exception.code;
      detail = exception.message;

      if (exception instanceof InsufficientFundsException) {
        status = HttpStatus.BAD_REQUEST; // 400
      } else if (exception instanceof CardOrAccountExpiredException) {
        status = HttpStatus.BAD_REQUEST; // 400
      } else if (exception instanceof MissingIdempotencyKeyException) {
        status = HttpStatus.BAD_REQUEST; // 400
      } else if (exception instanceof RateLimitExceededException) {
        status = HttpStatus.TOO_MANY_REQUESTS; // 429
      } else if (
        exception instanceof GatewayTimeoutException ||
        exception instanceof UssdTimeoutException
      ) {
        status = HttpStatus.GATEWAY_TIMEOUT; // 504
      } else if (exception instanceof CustomerCancelledException) {
        status = HttpStatus.BAD_REQUEST; // 400
      } else if (exception instanceof IdempotencyConflictException) {
        status = HttpStatus.CONFLICT; // 409
      } else if (exception instanceof IdempotencyPayloadMismatchException) {
        status = HttpStatus.UNPROCESSABLE_ENTITY; // 422
      } else if (
        exception instanceof ResourceNotFoundException ||
        exception instanceof MerchantNotFoundException
      ) {
        status = HttpStatus.NOT_FOUND; // 404
      } else {
        status = HttpStatus.BAD_REQUEST; // 400 default for domain rules
      }
    } else if (exception instanceof HttpException) {
      // 2. Map NestJS HTTP / Framework Exceptions (ValidationPipe, Auth Guards, etc.)
      status = exception.getStatus();
      title = exception.name;
      code = exception.name.toUpperCase().replace('EXCEPTION', '_ERROR');

      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        detail = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const respObj = exceptionResponse as Record<string, any>;
        detail = Array.isArray(respObj.message)
          ? respObj.message.join('; ')
          : respObj.message || exception.message;
        code = respObj.error
          ? respObj.error.toUpperCase().replace(/\s+/g, '_')
          : code;
      }
    } else if (exception instanceof Error) {
      // 3. Fallback for unhandled runtime errors
      detail = exception.message;
      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack,
      );
    }

    // Correlation ID propagation for SRE & distributed tracing
    const correlationId =
      (request.headers['x-request-id'] as string) || `req_${randomUUID()}`;

    response.setHeader('X-Request-Id', correlationId);
    response.setHeader('Content-Type', 'application/problem+json');

    // RFC 7807 (Problem Details for HTTP APIs) standard payload
    const problemDetails = {
      type: `https://errors.cauri.dev/v1/${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      title,
      status,
      detail,
      instance: request.originalUrl || request.url,
      code,
      correlation_id: correlationId,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(problemDetails);
  }
}
