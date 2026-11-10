import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { ApiKeyGuard } from '../common/guards/api-key/api-key.guard';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '@prisma/client';

@ApiTags('Audit & Compliance (NoSQL)')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('webhooks')
  @ApiOperation({
    summary: 'Retrieve raw immutable NoSQL audit trail for dispatched webhooks',
    description:
      'Queries MongoDB event store for non-relational raw JSON payloads, cryptographic signatures and delivery telemetry.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 50,
    description: 'Maximum number of audit documents to return',
  })
  @ApiResponse({
    status: 200,
    description: 'List of raw audit records retrieved from MongoDB',
  })
  async getWebhookAuditLogs(
    @CurrentMerchant() merchant: Merchant,
    @Query('limit') limit?: number,
  ) {
    const max = limit ? Math.min(Number(limit), 100) : 50;
    return this.auditService.getMerchantAuditLogs(merchant.id, max);
  }
}
