import { ProblemDetailsFilter } from './problem-details.filter';
import { ArgumentsHost, HttpStatus, BadRequestException } from '@nestjs/common';
import {
  InsufficientFundsException,
  IdempotencyConflictException,
  IdempotencyPayloadMismatchException,
  GatewayTimeoutException,
  ResourceNotFoundException,
} from '../../exceptions/domain.exceptions';

describe('ProblemDetailsFilter (RFC 7807)', () => {
  let filter: ProblemDetailsFilter;

  beforeEach(() => {
    filter = new ProblemDetailsFilter();
  });

  const createMockHost = (url: string = '/v1/payment-intents', requestId?: string) => {
    const request = {
      url,
      originalUrl: url,
      headers: requestId ? { 'x-request-id': requestId } : {},
    };

    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };

    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;

    return { host, request, response };
  };

  it('should map InsufficientFundsException to HTTP 400 and RFC 7807 format', () => {
    const { host, response } = createMockHost('/v1/payment-intents', 'req_test_123');
    const exception = new InsufficientFundsException(4002, 'XOF');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'req_test_123');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/problem+json',
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://errors.cauri.dev/v1/insufficient-funds',
        title: 'InsufficientFundsException',
        status: 400,
        code: 'INSUFFICIENT_FUNDS',
        correlation_id: 'req_test_123',
        instance: '/v1/payment-intents',
      }),
    );
  });

  it('should map IdempotencyConflictException to HTTP 409', () => {
    const { host, response } = createMockHost('/v1/payment-intents');
    const exception = new IdempotencyConflictException('key_abc');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://errors.cauri.dev/v1/idempotency-conflict',
        title: 'IdempotencyConflictException',
        status: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      }),
    );
  });

  it('should map IdempotencyPayloadMismatchException to HTTP 422', () => {
    const { host, response } = createMockHost('/v1/payment-intents');
    const exception = new IdempotencyPayloadMismatchException('key_abc');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://errors.cauri.dev/v1/idempotency-payload-mismatch',
        title: 'IdempotencyPayloadMismatchException',
        status: 422,
        code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      }),
    );
  });

  it('should map GatewayTimeoutException to HTTP 504', () => {
    const { host, response } = createMockHost('/v1/payment-intents');
    const exception = new GatewayTimeoutException();

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://errors.cauri.dev/v1/gateway-timeout',
        status: 504,
        code: 'GATEWAY_TIMEOUT',
      }),
    );
  });

  it('should map ResourceNotFoundException to HTTP 404', () => {
    const { host, response } = createMockHost('/v1/payment-intents/pi_999');
    const exception = new ResourceNotFoundException('PaymentIntent', 'pi_999');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://errors.cauri.dev/v1/resource-not-found',
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
      }),
    );
  });

  it('should handle standard NestJS HttpException with array validation errors', () => {
    const { host, response } = createMockHost('/v1/payment-intents');
    const exception = new BadRequestException(['amount must be positive', 'reference must not be empty']);

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        detail: 'amount must be positive; reference must not be empty',
      }),
    );
  });
});
