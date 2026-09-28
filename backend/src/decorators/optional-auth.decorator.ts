import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark endpoint as optionally authenticated (works with or without a valid Bearer token)
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

/**
 * Mark endpoint as public (bypasses JWT authentication guard completely)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
