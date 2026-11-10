/**
 * Pure Domain Exceptions (Decoupled from HTTP transport layer)
 * Following Clean Architecture and DDD principles.
 */

export class DomainException extends Error {
  constructor(
    public override readonly message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(amount?: number, currency?: string) {
    const detail =
      amount && currency
        ? `The customer account or wallet does not have sufficient balance to debit ${amount} ${currency}.`
        : 'The customer account or wallet does not have sufficient balance.';
    super(detail, 'INSUFFICIENT_FUNDS');
  }
}

export class CardOrAccountExpiredException extends DomainException {
  constructor() {
    super(
      'The selected payment method or mobile wallet session has expired.',
      'CARD_OR_ACCOUNT_EXPIRED',
    );
  }
}

export class RateLimitExceededException extends DomainException {
  constructor() {
    super(
      'The daily transaction threshold for this customer has been exceeded.',
      'RATE_LIMIT_EXCEEDED',
    );
  }
}

export class GatewayTimeoutException extends DomainException {
  constructor() {
    super(
      'Upstream telecom or bank network timed out after 30000ms.',
      'GATEWAY_TIMEOUT',
    );
  }
}

export class CustomerCancelledException extends DomainException {
  constructor() {
    super(
      'Customer actively cancelled or rejected the USSD authorization prompt on their mobile device.',
      'USER_CANCELLED',
    );
  }
}

export class UssdTimeoutException extends DomainException {
  constructor() {
    super(
      'USSD push session timed out. Customer did not enter their Mobile Money PIN within the 60-second window.',
      'USSD_TIMEOUT',
    );
  }
}

export class MissingIdempotencyKeyException extends DomainException {
  constructor() {
    super(
      "Missing required 'Idempotency-Key' header for transactional operation.",
      'MISSING_IDEMPOTENCY_KEY',
    );
  }
}

export class IdempotencyConflictException extends DomainException {
  constructor(key: string) {
    super(
      `Concurrent request with Idempotency-Key '${key}' is already in progress.`,
      'IDEMPOTENCY_CONFLICT',
    );
  }
}

export class IdempotencyPayloadMismatchException extends DomainException {
  constructor(key: string) {
    super(
      `Idempotency-Key '${key}' was previously used with a different request payload. Duplicate keys cannot alter parameters.`,
      'IDEMPOTENCY_PAYLOAD_MISMATCH',
    );
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(resource: string, id: string) {
    super(`${resource} '${id}' was not found.`, 'RESOURCE_NOT_FOUND');
  }
}

export class MerchantNotFoundException extends DomainException {
  constructor(id: string) {
    super(`Merchant with identifier '${id}' was not found.`, 'MERCHANT_NOT_FOUND');
  }
}
