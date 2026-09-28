import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

export const FEATURE_FLAG_KEY = 'featureFlag';

/**
 * Decorator to protect routes behind a feature flag.
 * @example @FeatureFlag('newMatching')
 */
export const FeatureFlag = (flagName: string): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_FLAG_KEY, flagName);

/**
 * Guard that prevents access to routes behind disabled feature flags.
 * Uses reflection to read the @FeatureFlag() decorator metadata.
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flagName = this.reflector.getAllAndOverride<string>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!flagName) {
      return true; // No feature flag required
    }

    const isEnabled = this.configService.get<boolean>(
      `featureFlags.${flagName}`,
    );

    if (!isEnabled) {
      throw new ForbiddenException(
        `Feature '${flagName}' is not enabled in this environment`,
      );
    }

    return true;
  }
}
