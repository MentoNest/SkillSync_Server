import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, MoreThan, Repository } from 'typeorm';
import {
  MentorAvailability,
  DayOfWeek,
} from './entities/mentor-availability.entity';
import { BlockedTime } from './entities/blocked-time.entity';
import {
  BlockTimeDto,
  CreateAvailabilityDto,
  QueryRangeDto,
  QuerySlotsDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';
import {
  AvailableSlot,
  MentorSchedule,
} from './interfaces/availability.interfaces';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    @InjectRepository(MentorAvailability)
    private readonly availabilityRepo: Repository<MentorAvailability>,

    @InjectRepository(BlockedTime)
    private readonly blockedTimeRepo: Repository<BlockedTime>,
  ) {}

  // ─── Availability Rules ────────────────────────────────────────────────────

  /**
   * Create a new recurring availability rule for a mentor.
   * Validates that startTime < endTime and the time window accommodates
   * at least one full slot.
   */
  async createRule(
    mentorId: string,
    dto: CreateAvailabilityDto,
  ): Promise<MentorAvailability> {
    this.validateTimeRange(dto.startTime, dto.endTime, dto.slotDurationMinutes ?? 60);

    if (dto.effectiveFrom && dto.effectiveTo) {
      if (new Date(dto.effectiveFrom) > new Date(dto.effectiveTo)) {
        throw new BadRequestException('effectiveFrom must be before effectiveTo');
      }
    }

    const rule = this.availabilityRepo.create({
      mentorId,
      dayOfWeek: dto.dayOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      timezone: dto.timezone ?? 'UTC',
      slotDurationMinutes: dto.slotDurationMinutes ?? 60,
      bufferMinutes: dto.bufferMinutes ?? 0,
      isActive: dto.isActive ?? true,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
    });

    return this.availabilityRepo.save(rule);
  }

  /**
   * Return all availability rules for a mentor (active and inactive).
   */
  async getRules(mentorId: string): Promise<MentorAvailability[]> {
    return this.availabilityRepo.find({
      where: { mentorId },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  /**
   * Return a single rule. Throws if not found or doesn't belong to the mentor.
   */
  async getRule(id: string, mentorId: string): Promise<MentorAvailability> {
    const rule = await this.availabilityRepo.findOne({ where: { id, mentorId } });
    if (!rule) {
      throw new NotFoundException(`Availability rule ${id} not found`);
    }
    return rule;
  }

  /**
   * Partially update an existing rule.
   */
  async updateRule(
    id: string,
    mentorId: string,
    dto: UpdateAvailabilityDto,
  ): Promise<MentorAvailability> {
    const rule = await this.getRule(id, mentorId);

    const newStart = dto.startTime ?? rule.startTime;
    const newEnd = dto.endTime ?? rule.endTime;
    const newDuration = dto.slotDurationMinutes ?? rule.slotDurationMinutes;
    this.validateTimeRange(newStart, newEnd, newDuration);

    Object.assign(rule, {
      ...(dto.dayOfWeek !== undefined && { dayOfWeek: dto.dayOfWeek }),
      ...(dto.startTime && { startTime: dto.startTime }),
      ...(dto.endTime && { endTime: dto.endTime }),
      ...(dto.timezone && { timezone: dto.timezone }),
      ...(dto.slotDurationMinutes !== undefined && { slotDurationMinutes: dto.slotDurationMinutes }),
      ...(dto.bufferMinutes !== undefined && { bufferMinutes: dto.bufferMinutes }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.effectiveFrom !== undefined && {
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      }),
      ...(dto.effectiveTo !== undefined && {
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      }),
    });

    return this.availabilityRepo.save(rule);
  }

  /**
   * Soft-delete by deactivating a rule, or hard-delete.
   */
  async deleteRule(id: string, mentorId: string): Promise<void> {
    const rule = await this.getRule(id, mentorId);
    await this.availabilityRepo.remove(rule);
  }

  // ─── Blocked Times ─────────────────────────────────────────────────────────

  /**
   * Block a specific date/time range for a mentor.
   */
  async blockTime(mentorId: string, dto: BlockTimeDto): Promise<BlockedTime> {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (startAt >= endAt) {
      throw new BadRequestException('startAt must be before endAt');
    }

    // Prevent duplicate/overlapping blocks
    const overlapping = await this.findOverlappingBlocks(mentorId, startAt, endAt);
    if (overlapping.length > 0) {
      throw new ConflictException(
        `Time range overlaps with an existing blocked period (id: ${overlapping[0].id})`,
      );
    }

    const block = this.blockedTimeRepo.create({ mentorId, startAt, endAt, reason: dto.reason ?? null });
    return this.blockedTimeRepo.save(block);
  }

  /**
   * List all upcoming blocked times for a mentor.
   */
  async getBlockedTimes(mentorId: string): Promise<BlockedTime[]> {
    return this.blockedTimeRepo.find({
      where: { mentorId },
      order: { startAt: 'ASC' },
    });
  }

  /**
   * Remove a previously created time block.
   */
  async removeBlock(id: string, mentorId: string): Promise<void> {
    const block = await this.blockedTimeRepo.findOne({ where: { id, mentorId } });
    if (!block) {
      throw new NotFoundException(`Blocked time ${id} not found`);
    }
    await this.blockedTimeRepo.remove(block);
  }

  // ─── Slot Generation (Booking Integration) ────────────────────────────────

  /**
   * Generate all available bookable slots for a mentor on a specific date.
   *
   * This is the primary integration point with the Booking module.
   * Booking services should call this to display a mentor's open slots
   * before creating a booking.
   *
   * @param mentorId - The mentor's UUID
   * @param dto.date - ISO date string "YYYY-MM-DD"
   * @param dto.durationMinutes - Override slot duration (optional)
   * @param bookedWindows - Already-booked {startAt, endAt} pairs injected
   *   by the Booking module to exclude occupied slots
   */
  async getAvailableSlots(
    mentorId: string,
    dto: QuerySlotsDto,
    bookedWindows: { startAt: Date; endAt: Date }[] = [],
  ): Promise<AvailableSlot[]> {
    const targetDate = new Date(dto.date + 'T00:00:00.000Z');
    const dayOfWeek = this.getDayOfWeekForDate(dto.date) as DayOfWeek;

    // 1. Fetch active rules for this day
    const rules = await this.availabilityRepo.find({
      where: { mentorId, dayOfWeek, isActive: true },
    });

    if (rules.length === 0) return [];

    // 2. Fetch blocked windows that intersect with today
    const dayStart = new Date(dto.date + 'T00:00:00.000Z');
    const dayEnd = new Date(dto.date + 'T23:59:59.999Z');
    const blocks = await this.blockedTimeRepo.find({
      where: {
        mentorId,
        startAt: LessThan(dayEnd),
        endAt: MoreThan(dayStart),
      },
    });

    const allBlockedWindows = [
      ...blocks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
      ...bookedWindows,
    ];

    // 3. Generate slots from each rule
    const slots: AvailableSlot[] = [];
    for (const rule of rules) {
      // Skip rules that are not yet effective or have expired
      if (!this.isRuleEffectiveOn(rule, dto.date)) continue;

      const slotDuration = dto.durationMinutes ?? rule.slotDurationMinutes;
      const ruleSlots = this.generateSlotsFromRule(rule, dto.date, slotDuration);

      // 4. Filter out blocked/booked windows
      for (const slot of ruleSlots) {
        const isBlocked = allBlockedWindows.some((w) =>
          this.intervalsOverlap(slot.startAt, slot.endAt, w.startAt, w.endAt),
        );
        if (!isBlocked) {
          slots.push(slot);
        }
      }
    }

    // Sort chronologically
    return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  /**
   * Get available slots across a range of dates.
   * Used to build a full weekly/monthly calendar view.
   */
  async getAvailableSlotsRange(
    mentorId: string,
    dto: QueryRangeDto,
    bookedWindows: { startAt: Date; endAt: Date }[] = [],
  ): Promise<MentorSchedule[]> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    if (from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
    if (diffDays > 90) {
      throw new BadRequestException('Date range cannot exceed 90 days');
    }

    const schedules: MentorSchedule[] = [];
    const cursor = new Date(from);

    while (cursor <= to) {
      const dateStr = cursor.toISOString().substring(0, 10);
      const slots = await this.getAvailableSlots(mentorId, { date: dateStr }, bookedWindows);

      if (slots.length > 0) {
        schedules.push({ mentorId, date: dateStr, slots });
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return schedules;
  }

  /**
   * Check whether a specific UTC time window is available for a mentor.
   *
   * Called by the Booking module before confirming a booking to
   * guarantee the slot is still free.
   *
   * @returns true if the mentor is available, false otherwise
   */
  async checkSlotAvailable(
    mentorId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    // 1. Resolve what date/time this falls on in the mentor's primary timezone
    //    (We use UTC day for simplicity; callers should pass UTC timestamps)
    const dateStr = startAt.toISOString().substring(0, 10);
    const dayOfWeek = this.getDayOfWeekForDate(dateStr) as DayOfWeek;
    const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);

    // 2. Must match at least one active availability rule
    const rules = await this.availabilityRepo.find({
      where: { mentorId, dayOfWeek, isActive: true },
    });

    const coveredByRule = rules.some((rule) => {
      if (!this.isRuleEffectiveOn(rule, dateStr)) return false;
      const ruleStart = this.parseTimeToUtcMs(dateStr, rule.startTime, rule.timezone);
      const ruleEnd = this.parseTimeToUtcMs(dateStr, rule.endTime, rule.timezone);
      return (
        startAt.getTime() >= ruleStart &&
        endAt.getTime() <= ruleEnd
      );
    });

    if (!coveredByRule) return false;

    // 3. Must not overlap any blocked time
    const blocks = await this.findOverlappingBlocks(mentorId, startAt, endAt);
    if (blocks.length > 0) return false;

    return true;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private generateSlotsFromRule(
    rule: MentorAvailability,
    dateStr: string,
    slotDurationMinutes: number,
  ): AvailableSlot[] {
    const slots: AvailableSlot[] = [];
    const stepMs = (slotDurationMinutes + rule.bufferMinutes) * 60_000;
    const durationMs = slotDurationMinutes * 60_000;

    const windowStartMs = this.parseTimeToUtcMs(dateStr, rule.startTime, rule.timezone);
    const windowEndMs = this.parseTimeToUtcMs(dateStr, rule.endTime, rule.timezone);

    let cursorMs = windowStartMs;

    while (cursorMs + durationMs <= windowEndMs) {
      const startAt = new Date(cursorMs);
      const endAt = new Date(cursorMs + durationMs);

      slots.push({
        startAt,
        endAt,
        durationMinutes: slotDurationMinutes,
        availabilityRuleId: rule.id,
        localStart: this.formatUtcAsLocal(startAt, rule.timezone),
        localEnd: this.formatUtcAsLocal(endAt, rule.timezone),
        timezone: rule.timezone,
      });

      cursorMs += stepMs;
    }

    return slots;
  }

  /**
   * Convert a HH:mm time string on a given date to a UTC millisecond timestamp,
   * respecting the provided IANA timezone.
   *
   * Uses the Intl API to compute the UTC offset at that specific moment
   * (handles DST transitions correctly).
   */
  private parseTimeToUtcMs(dateStr: string, time: string, timezone: string): number {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);

    // Build a "wall clock" date as if it were UTC
    const wallClock = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

    // Compute the offset the timezone has at this wall-clock moment
    const offsetMs = this.getTimezoneOffsetMs(new Date(wallClock), timezone);

    // Subtract offset to get the true UTC instant
    return wallClock - offsetMs;
  }

  /**
   * Returns the timezone's offset from UTC in milliseconds at a given instant.
   * Positive = east of UTC (e.g. Africa/Lagos is +3600000).
   */
  private getTimezoneOffsetMs(date: Date, timezone: string): number {
    const utcStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(date);

    const tzStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(date);

    return Date.parse(tzStr) - Date.parse(utcStr);
  }

  private formatUtcAsLocal(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  /**
   * Get day-of-week (0=Sun…6=Sat) for a YYYY-MM-DD date string (UTC basis).
   */
  private getDayOfWeekForDate(dateStr: string): number {
    return new Date(dateStr + 'T12:00:00.000Z').getUTCDay();
  }

  private isRuleEffectiveOn(rule: MentorAvailability, dateStr: string): boolean {
    const date = new Date(dateStr + 'T00:00:00.000Z');
    if (rule.effectiveFrom && date < new Date(rule.effectiveFrom)) return false;
    if (rule.effectiveTo && date > new Date(rule.effectiveTo)) return false;
    return true;
  }

  private validateTimeRange(
    startTime: string,
    endTime: string,
    slotDuration: number,
  ): void {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;

    if (startMinutes >= endMinutes) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }
    if (endMinutes - startMinutes < slotDuration) {
      throw new BadRequestException(
        `Time window (${endMinutes - startMinutes} min) is shorter than the slot duration (${slotDuration} min)`,
      );
    }
  }

  private intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart < bEnd && aEnd > bStart;
  }

  private async findOverlappingBlocks(
    mentorId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<BlockedTime[]> {
    return this.blockedTimeRepo
      .createQueryBuilder('block')
      .where('block.mentorId = :mentorId', { mentorId })
      .andWhere('block.startAt < :endAt', { endAt })
      .andWhere('block.endAt > :startAt', { startAt })
      .getMany();
  }
}
