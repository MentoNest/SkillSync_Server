import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class UserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.headers['x-user-id'];

    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException('User ID is required in headers');
    }

    (request as any).userId = userId;
    return true;
  }
}
