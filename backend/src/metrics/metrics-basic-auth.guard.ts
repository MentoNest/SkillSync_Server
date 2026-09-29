import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class MetricsBasicAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const username = process.env.METRICS_BASIC_AUTH_USERNAME;
    const password = process.env.METRICS_BASIC_AUTH_PASSWORD;
    if (!username || !password) {
      throw new ServiceUnavailableException(
        'Metrics authentication is not configured',
      );
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const authorization = request.headers.authorization;
    const encodedCredentials = authorization?.match(
      /^Basic\s+([A-Za-z0-9+/]+=*)$/i,
    )?.[1];
    const decodedCredentials = encodedCredentials
      ? Buffer.from(encodedCredentials, 'base64').toString('utf8')
      : '';
    const separator = decodedCredentials.indexOf(':');
    const suppliedUsername =
      separator >= 0 ? decodedCredentials.slice(0, separator) : '';
    const suppliedPassword =
      separator >= 0 ? decodedCredentials.slice(separator + 1) : '';
    const matches = (supplied: string, expected: string) =>
      timingSafeEqual(
        createHash('sha256').update(supplied).digest(),
        createHash('sha256').update(expected).digest(),
      );

    const usernameMatches = matches(suppliedUsername, username);
    const passwordMatches = matches(suppliedPassword, password);
    if (!usernameMatches || !passwordMatches) {
      response.setHeader(
        'WWW-Authenticate',
        'Basic realm="metrics", charset="UTF-8"',
      );
      throw new UnauthorizedException('Invalid metrics credentials');
    }

    return true;
  }
}
