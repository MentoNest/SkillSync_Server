import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, Brackets } from 'typeorm';
import { Booking, BookingStatus } from './booking.entity';
import {
  CheckConflictDto,
  ConflictResponseDto,
  ConflictingSlotDto,
} from './dto/booking.dto';

/** Statuses that occupy the slot and should be checked for conflicts */
const CONFLICT_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

/** Buffer in milliseconds applied around each booking (default: 0) */
const DEFAULT_BUFFER_MS = 0;

export interface ConflictCheckOptions {
  /** Extra gap (ms) required between sessions — e.g. 15-min transition time */
  bufferMs?: number;
  /** Booking ID to exclude (reschedule use-case) */
  excludeBookingId?: string;
}

@Injectable()
export class BookingConflictService {
  private readonly logger = new Logger(BookingConflictService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Full conflict check — throws ConflictException if any overlap is found.
   * Call this before persisting a new booking or rescheduling an existing one.
   */
  async assertNoConflict(
    dto: CheckConflictDto,
    options: ConflictCheckOptions = {},
  ): Promise<void> {
    this.validateTimeRange(dto.startTime, dto.endTime);

    const result = await this.detectConflicts(dto, options);

    if (result.hasConflict) {
      this.logger.warn(
        `Conflict detected for listing ${dto.listingId} ` +
          `[${dto.startTime} → ${dto.endTime}]: ` +
          `${result.conflicts.length} overlapping booking(s)`,
      );
      throw new ConflictException({
        message: result.message,
        conflicts: result.conflicts,
      });
    }
  }

  /**
   * Non-throwing conflict probe — returns the full conflict report.
   * Useful for pre-flight checks in the UI or availability endpoints.
   */
  async detectConflicts(
    dto: CheckConflictDto,
    options: ConflictCheckOptions = {},
  ): Promise<ConflictResponseDto> {
    this.validateTimeRange(dto.startTime, dto.endTime);

    const bufferMs = options.bufferMs ?? DEFAULT_BUFFER_MS;
    const start = new Date(new Date(dto.startTime).getTime() - bufferMs);
    const end = new Date(new Date(dto.endTime).getTime() + bufferMs);

    const overlapping = await this.findOverlappingBookings({
      listingId: dto.listingId,
      start,
      end,
      excludeBookingId: options.excludeBookingId ?? dto.excludeBookingId,
    });

    const conflicts: ConflictingSlotDto[] = overlapping.map((b) => ({
      bookingId: b.id,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      menteeId: b.menteeId,
    }));

    if (conflicts.length === 0) {
      return { hasConflict: false, conflicts: [] };
    }

    return {
      hasConflict: true,
      conflicts,
      message: `This slot overlaps with ${conflicts.length} existing booking(s). Please choose a different time.`,
    };
  }

  /**
   * Check if a specific mentor is double-booked across ALL their listings.
   * Useful when a mentor has multiple active listings.
   */
  async detectMentorConflicts(
    mentorId: string,
    startTime: string,
    endTime: string,
    options: ConflictCheckOptions = {},
  ): Promise<ConflictResponseDto> {
    this.validateTimeRange(startTime, endTime);

    const bufferMs = options.bufferMs ?? DEFAULT_BUFFER_MS;
    const start = new Date(new Date(startTime).getTime() - bufferMs);
    const end = new Date(new Date(endTime).getTime() + bufferMs);

    const overlapping = await this.bookingRepo
      .createQueryBuilder('booking')
      .where('booking.mentor_id = :mentorId', { mentorId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: CONFLICT_STATUSES,
      })
      .andWhere(
        new Brackets((qb) => {
          qb.where(
            'booking.start_time < :end AND booking.end_time > :start',
            { start, end },
          );
        }),
      )
      .andWhere(
        options.excludeBookingId
          ? 'booking.id != :excludeId'
          : '1=1',
        options.excludeBookingId
          ? { excludeId: options.excludeBookingId }
          : {},
      )
      .getMany();

    const conflicts: ConflictingSlotDto[] = overlapping.map((b) => ({
      bookingId: b.id,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      menteeId: b.menteeId,
    }));

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
      message:
        conflicts.length > 0
          ? `Mentor is already booked during this time slot.`
          : undefined,
    };
  }

  /**
   * Returns available time windows within a day given a slot duration.
   * Useful for building an availability calendar on the frontend.
   */
  async getAvailableSlots(
    listingId: string,
    date: Date,
    slotDurationMinutes: number,
    dayStartHour = 8,
    dayEndHour = 18,
  ): Promise<Array<{ startTime: Date; endTime: Date }>> {
    const dayStart = new Date(date);
    dayStart.setHours(dayStartHour, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(dayEndHour, 0, 0, 0);

    // Fetch all bookings for this listing on this day
    const existingBookings = await this.bookingRepo
      .createQueryBuilder('booking')
      .where('booking.listing_id = :listingId', { listingId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: CONFLICT_STATUSES,
      })
      .andWhere(
        'booking.start_time < :dayEnd AND booking.end_time > :dayStart',
        { dayStart, dayEnd },
      )
      .orderBy('booking.start_time', 'ASC')
      .getMany();

    const slotMs = slotDurationMinutes * 60 * 1000;
    const availableSlots: Array<{ startTime: Date; endTime: Date }> = [];

    let cursor = dayStart.getTime();
    const endMs = dayEnd.getTime();

    while (cursor + slotMs <= endMs) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor + slotMs);

      const hasConflict = existingBookings.some(
        (b) => b.startTime < slotEnd && b.endTime > slotStart,
      );

      if (!hasConflict) {
        availableSlots.push({ startTime: slotStart, endTime: slotEnd });
      }

      cursor += slotMs;
    }

    return availableSlots;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async findOverlappingBookings(params: {
    listingId: string;
    start: Date;
    end: Date;
    excludeBookingId?: string;
  }): Promise<Booking[]> {
    const { listingId, start, end, excludeBookingId } = params;

    /**
     * Overlap condition (Allen's interval algebra):
     *   existing.start < requested.end  AND  existing.end > requested.start
     *
     * This correctly catches all overlap patterns:
     *   - Exact match
     *   - Partial overlap (head / tail)
     *   - Engulfing (new slot entirely inside existing)
     *   - Containing (new slot entirely wraps existing)
     */
    const qb = this.bookingRepo
      .createQueryBuilder('booking')
      .where('booking.listing_id = :listingId', { listingId })
      .andWhere('booking.status IN (:...statuses)', {
        statuses: CONFLICT_STATUSES,
      })
      .andWhere(
        'booking.start_time < :end AND booking.end_time > :start',
        { start, end },
      );

    if (excludeBookingId) {
      qb.andWhere('booking.id != :excludeId', { excludeId: excludeBookingId });
    }

    return qb.getMany();
  }

  private validateTimeRange(startTime: string, endTime: string): void {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format provided.');
    }

    if (end <= start) {
      throw new BadRequestException(
        'End time must be strictly after start time.',
      );
    }

    if (start < new Date()) {
      throw new BadRequestException(
        'Cannot book a slot in the past.',
      );
    }
  }
}
