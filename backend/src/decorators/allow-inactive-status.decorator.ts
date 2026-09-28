import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_STATUS_KEY = 'allowInactiveStatus';

/**
 * #1176: Marks a route as reachable by an authenticated user whose account
 * status is not 'active' (e.g. a soft-deleted user restoring their own
 * account). RolesGuard still validates the token/tokenVersion/lock state,
 * it just skips the blanket "non-active users are rejected" check.
 */
export const AllowInactiveStatus = () => SetMetadata(ALLOW_INACTIVE_STATUS_KEY, true);
