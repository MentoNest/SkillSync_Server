import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/auth.interface';

/**
 * Decorator to extract the current authenticated user from the request
 * Usage: @CurrentUser() user: JwtPayload
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof JwtPayload | undefined,
    ctx: ExecutionContext,
  ): JwtPayload | JwtPayload[keyof JwtPayload] | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    // If a specific property is requested, return only that property
    if (data) {
      return user[data];
    }

    // Otherwise return the entire user object
    return user;
  },
);

/**
 * Decorator to extract the user ID from the current authenticated user
 * Usage: @CurrentUserId() userId: string
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    return user?.sub;
  },
);
