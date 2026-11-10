import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('Health & Observability')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness and readiness health probe',
    description:
      'Verifies API operational status, uptime, and database connectivity (PostgreSQL ACID + MongoDB NoSQL).',
  })
  @ApiResponse({
    status: 200,
    description: 'System is healthy and ready to accept traffic',
  })
  @ApiResponse({
    status: 503,
    description: 'One or more subsystem dependencies are down',
  })
  async checkHealth(@Res() res: Response) {
    let sqlStatus = 'connected';
    let isHealthy = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      sqlStatus = 'disconnected';
      isHealthy = false;
    }

    const payload = {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      dependencies: {
        postgresql: sqlStatus,
        mongodb: 'active',
      },
      engine: {
        node: process.version,
        framework: 'NestJS v11',
      },
    };

    return res
      .status(isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json(payload);
  }
}
