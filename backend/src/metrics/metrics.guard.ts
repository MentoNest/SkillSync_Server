import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class MetricsBasicAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const authHeader: string = req.headers['authorization'] ?? '';
    if (!authHeader.startsWith('Basic ')) throw new UnauthorizedException();

    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const [user, ...rest] = decoded.split(':');
    const pass = rest.join(':');

    const expectedUser = process.env.METRICS_USER ?? 'metrics';
    const expectedPass = process.env.METRICS_PASS ?? 'secret';

    if (user !== expectedUser || pass !== expectedPass) throw new UnauthorizedException();
    return true;
  }
}
