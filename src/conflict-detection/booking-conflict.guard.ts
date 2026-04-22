import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { BookingConflictService } from './booking-conflict.service';
import { SKIP_CONFLICT_CHECK_KEY } from './decorators/skip-conflict-check.decorator';
import { CONFLICT_BUFFER_KEY } from './decorators/conflict-buffer.decorator';

/**
 * BookingConflictGuard
 *
 * Attach this guard to any route that creates or reschedules a booking.
 * It reads { listingId, startTime, endTime, excludeBookingId? } from the
 * request body and delegates to BookingConflictService.assertNoConflict().
 *
 * Usage:
 *   @UseGuards(BookingConflictGuard)
 *   @Post()
 *   createBooking(@Body() dto: CreateBookingDto) { ... }
 *
 *   @SkipConflictCheck()          ← opt-out for admin overrides
 *   @Post('admin/force')
 *   forceCreate(...) { ... }
 *
 *   @ConflictBuffer(15)           ← add 15-min buffer between sessions
 *   @Post('premium')
 *   createPremium(...) { ... }
 */
@Injectable()
export class BookingConflictGuard implements CanActivate {
  private readonly logger = new Logger(BookingConflictGuard.name);

  constructor(
    private readonly conflictService: BookingConflictService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow decorated routes to bypass (e.g. admin force-create)
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_CONFLICT_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request: Request = context.switchToHttp().getRequest();
    const body = request.body as Record<string, unknown>;

    const listingId = body?.listingId as string | undefined;
    const startTime = body?.startTime as string | undefined;
    const endTime = body?.endTime as string | undefined;
    const excludeBookingId = body?.excludeBookingId as string | undefined;

    // Guard only activates when the required fields are present
    if (!listingId || !startTime || !endTime) {
      this.logger.debug(
        'BookingConflictGuard: missing conflict-check fields — skipping.',
      );
      return true;
    }

    // Read optional buffer from decorator
    const bufferMinutes = this.reflector.getAllAndOverride<number>(
      CONFLICT_BUFFER_KEY,
      [context.getHandler(), context.getClass()],
    );

    await this.conflictService.assertNoConflict(
      { listingId, startTime, endTime, excludeBookingId },
      { bufferMs: bufferMinutes ? bufferMinutes * 60 * 1000 : 0 },
    );

    return true;
  }
}
