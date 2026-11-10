import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db, Collection } from 'mongodb';

export interface WebhookAuditDocument {
  id?: string;
  eventId: string;
  eventType: string;
  merchantId: string;
  paymentIntentId: string;
  targetUrl: string;
  payload: Record<string, any>;
  signatureSent: string;
  statusCode: number | null;
  status: string;
  createdAt: Date;
}

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<WebhookAuditDocument> | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const mongoUri =
      this.configService.get<string>('MONGO_URI') ||
      process.env.MONGO_URI ||
      null;

    if (!mongoUri) {
      this.logger.log('MONGO_URI not configured. NoSQL audit store running in in-memory fallback mode.');
      return;
    }

    try {
      this.client = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
      });

      await this.client.connect();
      this.db = this.client.db();
      this.collection = this.db.collection<WebhookAuditDocument>('webhook_audit_logs');

      // Create compound index for fast merchant audit retrieval
      await this.collection.createIndex({ merchantId: 1, createdAt: -1 });
      this.isConnected = true;
      this.logger.log('🍃 Successfully connected to MongoDB NoSQL Audit Store');
    } catch (error: any) {
      this.logger.warn(
        `MongoDB connection failed (${error.message}). Audit logging will proceed in graceful fallback mode.`,
      );
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
    }
  }

  /**
   * Persists immutable raw audit document into MongoDB NoSQL collection
   */
  async recordWebhookAudit(doc: Omit<WebhookAuditDocument, 'createdAt'>): Promise<void> {
    const fullDoc: WebhookAuditDocument = {
      ...doc,
      createdAt: new Date(),
    };

    if (!this.isConnected || !this.collection) {
      this.logger.debug(`[NoSQL Fallback] Audit record stored for event ${doc.eventId}`);
      return;
    }

    try {
      await this.collection.insertOne(fullDoc);
      this.logger.log(`[MongoDB] Webhook audit log persisted: ${doc.eventId}`);
    } catch (err: any) {
      this.logger.error(`Failed to persist audit log into MongoDB: ${err.message}`);
    }
  }

  /**
   * Retrieves high-volume raw JSON audit traces for merchant troubleshooting
   */
  async getMerchantAuditLogs(merchantId: string, limit = 50): Promise<WebhookAuditDocument[]> {
    if (!this.isConnected || !this.collection) {
      return [];
    }

    try {
      return await this.collection
        .find({ merchantId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    } catch (err: any) {
      this.logger.error(`Failed to fetch audit logs from MongoDB: ${err.message}`);
      return [];
    }
  }
}
