import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './guards/api-key/api-key.guard';
import { IdempotencyInterceptor } from './interceptors/idempotency/idempotency.interceptor';
import { ProblemDetailsFilter } from './filters/problem-details/problem-details.filter';

@Global()
@Module({
  providers: [ApiKeyGuard, IdempotencyInterceptor, ProblemDetailsFilter],
  exports: [ApiKeyGuard, IdempotencyInterceptor, ProblemDetailsFilter],
})
export class CommonModule {}
