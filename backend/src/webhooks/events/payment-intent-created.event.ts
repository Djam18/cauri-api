export class PaymentIntentCreatedEvent {
  constructor(
    public readonly merchantId: string,
    public readonly paymentIntent: any,
    public readonly webhookUrl?: string,
  ) {}
}
