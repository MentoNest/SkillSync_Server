import { Request } from 'express';

export function buildThrottleKey(
  request: Request,
): string {
  const user =
    request.user as
      | { sub?: string }
      | undefined;

  if (user?.sub) {
    return `throttle:user:${user.sub}`;
  }

  const forwarded =
    request.headers['x-forwarded-for'];

  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : request.socket.remoteAddress;

  return `throttle:ip:${ip}`;
}