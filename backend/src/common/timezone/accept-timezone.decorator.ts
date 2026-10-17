import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DEFAULT_TIMEZONE, isValidTimezone } from './timezone.util';

/**
 * Reads the `Accept-Timezone` header, validates it against the IANA database and
 * falls back to the caller's saved timezone (when present on the request user) or 'UTC'.
 */
export const AcceptTimezone = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  const raw = req.headers?.['accept-timezone'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return req.user?.timezone ?? DEFAULT_TIMEZONE;
  if (!isValidTimezone(header)) throw new BadRequestException('Invalid Accept-Timezone header');
  return header;
});
