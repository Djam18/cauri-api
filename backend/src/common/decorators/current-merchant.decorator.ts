import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Merchant } from '@prisma/client';

export const CurrentMerchant = createParamDecorator(
  (data: keyof Merchant | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const merchant = request.merchant as Merchant;

    return data && merchant ? merchant[data] : merchant;
  },
);
