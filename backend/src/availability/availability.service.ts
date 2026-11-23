import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { BusinessRuleException, ResourceNotFoundException } from '../common/errors/app-exceptions';
import { resolveTimezone } from '../common/utils/timezone.utils';
import { MentorProfile } from '../profile/mentor-profile.entity';
import { User } from '../user/user.entity';
import { AvailabilityException } from './availability-exception.entity';
import { AvailabilitySlot } from './availability-slot.entity';
import {
  CreateAvailabilityExceptionDto,
  UpdateAvailabilityExceptionDto,
} from './dto/availability-exception.dto';
import {
  AvailableWindowDto,
  AvailabilityCheckResponseDto,
  Next30DaysAvailabilityResponseDto,
} from './dto/availability-response.dto';
import {
  CreateAvailabilitySlotDto,
  UpdateAvailabilitySlotDto,
} from './dto/availability-slot.dto';
import {
  addDaysUtc,
  formatInTimezone,
  getUtcDateString,
  getUtcDayOfWeek,
  getUtcTimeString,
  isEndAfterStart,
  parseDateTime,
  parseTimeToMinutes,
  startOfUtcDay,
  timeRangesOverlap,
} from './availability.utils';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    @InjectRepository(AvailabilitySlot)
    private readonly slots: Repository<AvailabilitySlot>,
    @InjectRepository(AvailabilityException)
    private readonly exceptions: Repository<AvailabilityException>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfiles: Repository<MentorProfile>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  // ─── Slots ────────────────────────────────────────────────────────────────

  async listSlots(mentorId: string): Promise<AvailabilitySlot[]> {
    await this.ensureMentorExists(mentorId);
    return this.slots.find({ where: { mentorId }, order: { dayOfWeek: 'ASC', startTimeUtc: 'ASC' } });
  }

  async createSlot(mentorId: string, dto: CreateAvailabilitySlotDto): Promise<AvailabilitySlot> {
    await this.ensureMentorExists(mentorId);
    this.assertSlotTimes(dto.startTimeUtc, dto.endTimeUtc);
    await this.assertNoSlotOverlap(mentorId, dto.dayOfWeek, dto.startTimeUtc, dto.endTimeUtc);

    const entity = this.slots.create({
      mentorId,
      dayOfWeek: dto.dayOfWeek,
      startTimeUtc: dto.startTimeUtc,
      endTimeUtc: dto.endTimeUtc,
      timezone: dto.timezone ?? 'UTC',
    });
    return this.slots.save(entity);
  }

  async updateSlot(mentorId: string, slotId: string, dto: UpdateAvailabilitySlotDto): Promise<AvailabilitySlot> {
    const slot = await this.slots.findOne({ where: { id: slotId, mentorId } });
    if (!slot) throw new ResourceNotFoundException('Availability slot', slotId);

    const next = {
      dayOfWeek: dto.dayOfWeek ?? slot.dayOfWeek,
      startTimeUtc: dto.startTimeUtc ?? slot.startTimeUtc,
      endTimeUtc: dto.endTimeUtc ?? slot.endTimeUtc,
      timezone: dto.timezone ?? slot.timezone,
    };
    this.assertSlotTimes(next.startTimeUtc, next.endTimeUtc);
    await this.assertNoSlotOverlap(mentorId, next.dayOfWeek, next.startTimeUtc, next.endTimeUtc, slotId);

    Object.assign(slot, next);
    return this.slots.save(slot);
  }

  async deleteSlot(mentorId: string, slotId: string): Promise<void> {
    const slot = await this.slots.findOne({ where: { id: slotId, mentorId } });
    if (!slot) throw new ResourceNotFoundException('Availability slot', slotId);
    await this.slots.remove(slot);
  }

  // ─── Exceptions ───────────────────────────────────────────────────────────

  async listExceptions(mentorId: string): Promise<AvailabilityException[]> {
    await this.ensureMentorExists(mentorId);
    return this.exceptions.find({ where: { mentorId }, order: { date: 'ASC', startTimeUtc: 'ASC' } });
  }

  async createException(
    mentorId: string,
    dto: CreateAvailabilityExceptionDto,
  ): Promise<AvailabilityException> {
    await this.ensureMentorExists(mentorId);
    this.assertSlotTimes(dto.startTimeUtc, dto.endTimeUtc);
    await this.assertNoExceptionOverlap(mentorId, dto.date, dto.startTimeUtc, dto.endTimeUtc);

    const entity = this.exceptions.create({
      mentorId,
      date: dto.date,
      startTimeUtc: dto.startTimeUtc,
      endTimeUtc: dto.endTimeUtc,
      reason: dto.reason ?? null,
      isUnavailable: dto.isUnavailable ?? true,
    });
    return this.exceptions.save(entity);
  }

  async updateException(
    mentorId: string,
    exceptionId: string,
    dto: UpdateAvailabilityExceptionDto,
  ): Promise<AvailabilityException> {
    const exception = await this.exceptions.findOne({ where: { id: exceptionId, mentorId } });
    if (!exception) throw new ResourceNotFoundException('Availability exception', exceptionId);

    const next = {
      date: dto.date ?? exception.date,
      startTimeUtc: dto.startTimeUtc ?? exception.startTimeUtc,
      endTimeUtc: dto.endTimeUtc ?? exception.endTimeUtc,
      reason: dto.reason === undefined ? exception.reason : dto.reason,
      isUnavailable: dto.isUnavailable ?? exception.isUnavailable,
    };
    this.assertSlotTimes(next.startTimeUtc, next.endTimeUtc);
    await this.assertNoExceptionOverlap(mentorId, next.date, next.startTimeUtc, next.endTimeUtc, exceptionId);

    Object.assign(exception, next);
    return this.exceptions.save(exception);
  }

  async deleteException(mentorId: string, exceptionId: string): Promise<void> {
    const exception = await this.exceptions.findOne({ where: { id: exceptionId, mentorId } });
    if (!exception) throw new ResourceNotFoundException('Availability exception', exceptionId);
    await this.exceptions.remove(exception);
  }

  // ─── Availability checks ──────────────────────────────────────────────────

  async isAvailable(
    mentorId: string,
    dateTime: string | Date,
    timezone = 'UTC',
  ): Promise<AvailabilityCheckResponseDto> {
    await this.ensureMentorExists(mentorId);
    const dt = typeof dateTime === 'string' ? parseDateTime(dateTime) : dateTime;
    const available = await this.isAvailableAt(mentorId, dt);
    return { mentorId, timezone, dateTime: dt.toISOString(), available };
  }

  async getNext30DaysAvailability(
    mentorId: string,
    from?: Date,
    responseTimezone?: string,
  ): Promise<Next30DaysAvailabilityResponseDto> {
    await this.ensureMentorExists(mentorId);
    const start = startOfUtcDay(from ?? new Date());
    const end = addDaysUtc(start, 30);

    const [slots, exceptions, user] = await Promise.all([
      this.slots.find({ where: { mentorId } }),
      this.exceptions.find({ where: { mentorId } }),
      this.users.findOneBy({ walletAddress: mentorId }),
    ]);
    const timezone = resolveTimezone(
      user?.timezone ?? slots[0]?.timezone ?? 'UTC',
      responseTimezone,
    );

    const windows: AvailableWindowDto[] = [];
    for (let day = new Date(start.getTime()); day < end; day = addDaysUtc(day, 1)) {
      const dateStr = getUtcDateString(day);
      const dayOfWeek = getUtcDayOfWeek(day);
      const daySlots = slots.filter((s) => s.dayOfWeek === dayOfWeek);
      if (daySlots.length === 0) continue;

      const dayExceptions = exceptions.filter((e) => e.date === dateStr);
      for (const slot of daySlots) {
        const slotWindows = this.applyExceptionsToSlot(dateStr, slot, dayExceptions, timezone);
        windows.push(...slotWindows);
      }
    }

    windows.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
    return { mentorId, timezone, windows };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async ensureMentorExists(mentorId: string): Promise<void> {
    const exists = await this.mentorProfiles.existsBy({ walletAddress: mentorId });
    if (!exists) throw new ResourceNotFoundException('Mentor profile', mentorId);
  }

  private assertSlotTimes(start: string, end: string): void {
    if (!isEndAfterStart(start, end)) {
      throw new BusinessRuleException('endTimeUtc must be after startTimeUtc.');
    }
  }

  private async assertNoSlotOverlap(
    mentorId: string,
    dayOfWeek: number,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<void> {
    const where: Record<string, unknown> = { mentorId, dayOfWeek };
    if (excludeId) where.id = Not(excludeId);
    const sameDaySlots = await this.slots.find({ where: where as never });
    const conflict = sameDaySlots.find((s) => timeRangesOverlap(start, end, s.startTimeUtc, s.endTimeUtc));
    if (conflict) {
      throw new BusinessRuleException(
        `Availability slot overlaps with existing slot ${conflict.id} (${conflict.startTimeUtc}-${conflict.endTimeUtc}).`,
      );
    }
  }

  private async assertNoExceptionOverlap(
    mentorId: string,
    date: string,
    start: string,
    end: string,
    excludeId?: string,
  ): Promise<void> {
    const where: Record<string, unknown> = { mentorId, date };
    if (excludeId) where.id = Not(excludeId);
    const sameDay = await this.exceptions.find({ where: where as never });
    const conflict = sameDay.find((e) => timeRangesOverlap(start, end, e.startTimeUtc, e.endTimeUtc));
    if (conflict) {
      throw new BusinessRuleException(
        `Availability exception overlaps with existing exception ${conflict.id} (${conflict.startTimeUtc}-${conflict.endTimeUtc}).`,
      );
    }
  }

  private async isAvailableAt(mentorId: string, dt: Date): Promise<boolean> {
    const dateStr = getUtcDateString(dt);
    const timeStr = getUtcTimeString(dt);
    const dayOfWeek = getUtcDayOfWeek(dt);

    const [slots, exceptions] = await Promise.all([
      this.slots.find({ where: { mentorId, dayOfWeek } }),
      this.exceptions.find({ where: { mentorId, date: dateStr } }),
    ]);

    const inSlot = slots.some((s) => this.timeWithin(timeStr, s.startTimeUtc, s.endTimeUtc));
    if (!inSlot) return false;

    const blocked = exceptions.some(
      (e) => e.isUnavailable && this.timeWithin(timeStr, e.startTimeUtc, e.endTimeUtc),
    );
    return !blocked;
  }

  private timeWithin(time: string, start: string, end: string): boolean {
    const t = parseTimeToMinutes(time);
    return t >= parseTimeToMinutes(start) && t < parseTimeToMinutes(end);
  }

  private applyExceptionsToSlot(
    dateStr: string,
    slot: AvailabilitySlot,
    exceptions: AvailabilityException[],
    timezone: string,
  ): AvailableWindowDto[] {
    let windows: Array<{ start: number; end: number }> = [
      { start: parseTimeToMinutes(slot.startTimeUtc), end: parseTimeToMinutes(slot.endTimeUtc) },
    ];

    const blocking = exceptions.filter((e) => e.isUnavailable);
    for (const ex of blocking) {
      const exStart = parseTimeToMinutes(ex.startTimeUtc);
      const exEnd = parseTimeToMinutes(ex.endTimeUtc);
      windows = windows.flatMap((w) => this.subtractWindow(w, { start: exStart, end: exEnd }));
    }

    return windows
      .filter((w) => w.end > w.start)
      .map((w) => {
        const startUtc = this.utcDateTimeFromDateAndMinutes(dateStr, w.start);
        const endUtc = this.utcDateTimeFromDateAndMinutes(dateStr, w.end);
        return {
          startUtc: startUtc.toISOString(),
          endUtc: endUtc.toISOString(),
          displayStart: formatInTimezone(startUtc, timezone),
          displayEnd: formatInTimezone(endUtc, timezone),
          timezone,
          slotId: slot.id,
        };
      });
  }

  private subtractWindow(
    base: { start: number; end: number },
    cut: { start: number; end: number },
  ): Array<{ start: number; end: number }> {
    // No overlap
    if (cut.end <= base.start || cut.start >= base.end) return [base];
    const result: Array<{ start: number; end: number }> = [];
    if (cut.start > base.start) result.push({ start: base.start, end: Math.min(cut.start, base.end) });
    if (cut.end < base.end) result.push({ start: Math.max(cut.end, base.start), end: base.end });
    return result;
  }

  private utcDateTimeFromDateAndMinutes(dateStr: string, minutes: number): Date {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return new Date(Date.UTC(y, mo - 1, d, h, m, 0, 0));
  }
}
