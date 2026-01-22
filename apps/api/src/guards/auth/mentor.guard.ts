import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class MentorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const mentorProfileId = request.headers['x-mentor-profile-id'];

    if (!mentorProfileId || typeof mentorProfileId !== 'string') {
      throw new UnauthorizedException(
        'Mentor profile ID is required in headers',
      );
    }

    (request as any).mentorProfileId = mentorProfileId;
    return true;
  }
}
