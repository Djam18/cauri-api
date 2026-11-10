import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { PaymentIntentsService } from './payment-intents.service';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { ApiKeyGuard } from '../common/guards/api-key/api-key.guard';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency/idempotency.interceptor';
import { CurrentMerchant } from '../common/decorators/current-merchant.decorator';
import { Merchant } from '@prisma/client';

@ApiTags('Payment Intents')
@ApiBearerAuth('api-key')
@UseGuards(ApiKeyGuard)
@Controller('payment-intents')
export class PaymentIntentsController {
  constructor(private readonly paymentIntentsService: PaymentIntentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Create a new payment intent with deterministic outcome',
    description:
      'Creates a new payment intent. Requires an Idempotency-Key header to ensure duplicate requests produce identical outcomes without double debiting.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique client-generated key (UUID or string) for request deduplication',
    required: true,
    example: 'req_cauri_987654321',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment intent successfully created or replayed from idempotency cache',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error, insufficient funds (4002) or missing idempotency key (RFC 7807)',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid Bearer API key',
  })
  @ApiResponse({
    status: 409,
    description: 'Concurrent request conflict for the given idempotency key',
  })
  @ApiResponse({
    status: 422,
    description: 'Idempotency key payload mismatch',
  })
  @ApiResponse({
    status: 504,
    description: 'Simulated upstream gateway timeout (5004)',
  })
  async create(
    @CurrentMerchant() merchant: Merchant,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentIntentsService.create(merchant.id, idempotencyKey, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Retrieve payment intent details by ID',
    description: 'Fetches the consolidated state of an existing payment intent.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique payment intent identifier (e.g. pi_cauri_...)',
    example: 'pi_cauri_550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment intent found',
  })
  @ApiResponse({
    status: 404,
    description: 'Payment intent not found for this merchant (RFC 7807)',
  })
  async findOne(@CurrentMerchant() merchant: Merchant, @Param('id') id: string) {
    return this.paymentIntentsService.findOne(merchant.id, id);
  }
}
