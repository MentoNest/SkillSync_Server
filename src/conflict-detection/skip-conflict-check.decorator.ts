import { SetMetadata } from '@nestjs/common';

export const SKIP_CONFLICT_CHECK_KEY = 'skipConflictCheck';

/**
 * Apply to any route handler to bypass the BookingConflictGuard.
 * Use only for admin or system-level endpoints.
 *
 * @example
 * @SkipConflictCheck()
 * @Post('admin/force-create')
 * forceCreate(@Body() dto: CreateBookingDto) { ... }
 */
export const SkipConflictCheck = () =>
  SetMetadata(SKIP_CONFLICT_CHECK_KEY, true);
