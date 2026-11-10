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

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let title = 'Internal Server Error';
    let detail = 'An unexpected error occurred while processing your request.';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      title = exception.name || 'HTTP Error';
      if (typeof exceptionResponse === 'string') {
        detail = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const respObj = exceptionResponse as Record<string, any>;
        detail = Array.isArray(respObj.message)
          ? respObj.message.join(', ')
          : respObj.message || exception.message;
        code = respObj.error || exception.name;
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    }

    const correlationId =
      (request.headers['x-request-id'] as string) || `req_${randomUUID()}`;

    // Ensure the response header includes the correlation ID
    response.setHeader('X-Request-Id', correlationId);

    // RFC 7807 Problem Details payload
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
