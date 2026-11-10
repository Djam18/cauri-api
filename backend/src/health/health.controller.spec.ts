import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Response } from 'express';

describe('HealthController', () => {
  let controller: HealthController;

  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  const mockAudit = {
    recordWebhookAudit: jest.fn(),
    getMerchantAuditLogs: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return 200 OK when database is connected', async () => {
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;

    await controller.checkHealth(mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'healthy',
        dependencies: expect.objectContaining({
          postgresql: 'connected',
        }),
      }),
    );
  });
});
