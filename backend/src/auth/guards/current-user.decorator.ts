import { createParamDecorator, ExecutionContext } from '@nestjs/common';
// Type-only import: describes the claims stored in the JWT
import type { JwtPayload } from './jwt-auth.guard';

/** @CurrentUser() user, or @CurrentUser('sub') userId. */
// Custom parameter decorator for controller handlers.
// `field` is the optional argument passed to the decorator, restricted to valid JWT claim names.
export const CurrentUser = createParamDecorator((field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
  // The auth guard/strategy attaches the decoded JWT payload to `request.user`.
  // NOTE: this is undefined on routes that aren't protected by the guard.
  const user: JwtPayload = ctx.switchToHttp().getRequest().user;
  // With a field, return just that claim (optional chaining avoids a crash if user is missing);
  // without one, return the whole payload.
  return field ? user?.[field] : user;
});