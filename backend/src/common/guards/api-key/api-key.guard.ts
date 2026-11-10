import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException(
        'Missing Authorization header. Expected format: Bearer <api_key>',
      );
    }

    const [scheme, apiKey] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !apiKey) {
      throw new UnauthorizedException(
        'Invalid Authorization format. Expected: Bearer <api_key>',
      );
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { apiKey },
    });

    if (!merchant) {
      throw new UnauthorizedException(
        'Invalid API key provided. Check your merchant credentials.',
      );
    }

    // Attach merchant entity to request context for downstream controllers
    (request as any).merchant = merchant;
    return true;
  }
}
