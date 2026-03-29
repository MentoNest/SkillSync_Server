import { SetMetadata } from '@nestjs/common';

export const CONFLICT_BUFFER_KEY = 'conflictBufferMinutes';

/**
 * Adds a time buffer (in minutes) around each booking for conflict detection.
 * This enforces a minimum gap between consecutive sessions on a listing.
 *
 * @param minutes - Buffer duration in minutes (e.g. 15 for a 15-min gap)
 *
 * @example
 * @ConflictBuffer(15)       // require 15-min gap between sessions
 * @UseGuards(BookingConflictGuard)
 * @Post('premium')
 * createPremiumBooking(@Body() dto: CreateBookingDto) { ... }
 */
export const ConflictBuffer = (minutes: number) =>
  SetMetadata(CONFLICT_BUFFER_KEY, minutes);
