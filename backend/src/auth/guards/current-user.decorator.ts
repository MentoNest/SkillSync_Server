import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './jwt-auth.guard';

/** @CurrentUser() user, or @CurrentUser('sub') userId. */
export const CurrentUser = createParamDecorator((field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
  const user: JwtPayload = ctx.switchToHttp().getRequest().user;
  return field ? user?.[field] : user;
});
