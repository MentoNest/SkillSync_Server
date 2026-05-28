import {
  CanActivate,
  ExecutionContext,
  Injectable,
  TooManyRequestsException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { Request, Response } from 'express';

import { SlidingWindowProvider } from '../providers/sliding-window.provider';

import { THROTTLE_OPTIONS } from '../constants/throttling.constants';

import { buildThrottleKey } from '../utils/throttle-key.util';

@Injectable()
export class RedisThrottlerGuard
  implements CanActivate
{
  constructor(
    private readonly reflector: Reflector,
    private readonly slidingWindowProvider: SlidingWindowProvider,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<Request>();

    const response =
      context.switchToHttp().getResponse<Response>();

    const options =
      this.reflector.get<{
        limit: number;
        ttl: number;
      }>(
        THROTTLE_OPTIONS,
        context.getHandler(),
      );

    const limit =
      options?.limit ?? 20;

    const ttl =
      options?.ttl ?? 60;

    const key =
      buildThrottleKey(request);

    const result =
      await this.slidingWindowProvider.check(
        key,
        limit,
        ttl,
      );

    response.setHeader(
      'Retry-After',
      result.retryAfter,
    );

    if (!result.allowed) {
      throw new TooManyRequestsException(
        'Too many requests',
      );
    }

    return true;
  }
}