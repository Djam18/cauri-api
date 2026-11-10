import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
