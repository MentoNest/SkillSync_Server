import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { DEFAULT_TIMEZONE, isValidTimezone, normalizeTimezone } from '../common/timezone/timezone.util';
import {
  CreateAvailabilityExceptionDto,
  CreateAvailabilitySlotDto,
  UpdateAvailabilitySlotDto,
} from './dto/availability.dto';
import { AvailabilityException } from './entities/availability-exception.entity';
import { AvailabilitySlot } from './entities/availability-slot.entity';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface SlotOccurrence {
  date: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  start: string;
  end: string;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AvailabilitySlot) private readonly slots: Repository<AvailabilitySlot>,
    @InjectRepository(AvailabilityException) private readonly exceptions: Repository<AvailabilityException>,
  ) {}

  async listSlots(mentorId: string): Promise<AvailabilitySlot[]> {
    return this.slots.find({ where: { mentorId }, order: { dayOfWeek: 'ASC', startTime: 'ASC' } });
  }

  async createSlot(mentorId: string, dto: CreateAvailabilitySlotDto): Promise<AvailabilitySlot> {
    this.assertRange(dto.startTime, dto.endTime);
    const timezone = this.assertTimezone(dto.timezone);
    const overlap = await this.findOverlap(mentorId, dto.dayOfWeek, dto.startTime, dto.endTime);
    if (overlap) throw new ConflictException('Availability slot overlaps an existing slot');
    return this.slots.save(
      this.slots.create({
        mentorId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        timezone,
      }),
    );
  }

  async updateSlot(mentorId: string, id: string, dto: UpdateAvailabilitySlotDto): Promise<AvailabilitySlot> {
    const slot = await this.slots.findOne({ where: { id, mentorId } });
    if (!slot) throw new NotFoundException('Availability slot not found');

    const dayOfWeek = dto.dayOfWeek ?? slot.dayOfWeek;
    const startTime = dto.startTime ?? slot.startTime;
    const endTime = dto.endTime ?? slot.endTime;
    const timezone = dto.timezone === undefined ? slot.timezone : this.assertTimezone(dto.timezone);

    this.assertRange(startTime, endTime);
    const overlap = await this.findOverlap(mentorId, dayOfWeek, startTime, endTime, slot.id);
    if (overlap) throw new ConflictException('Availability slot overlaps an existing slot');

    Object.assign(slot, { dayOfWeek, startTime, endTime, timezone });
    return this.slots.save(slot);
  }

  async deleteSlot(mentorId: string, id: string): Promise<void> {
    const res = await this.slots.delete({ id, mentorId });
    if (!res.affected) throw new NotFoundException('Availability slot not found');
  }

  /** True when a new/updated slot would overlap an existing one for the same weekday. */
  async hasOverlap(
    mentorId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<boolean> {
    return (await this.findOverlap(mentorId, dayOfWeek, startTime, endTime, excludeId)) !== null;
  }

  async listExceptions(mentorId: string): Promise<AvailabilityException[]> {
    return this.exceptions.find({ where: { mentorId }, order: { date: 'ASC' } });
  }

  async createException(mentorId: string, dto: CreateAvailabilityExceptionDto): Promise<AvailabilityException> {
    if (dto.startTime && dto.endTime) {
      this.assertRange(dto.startTime, dto.endTime);
    } else if (dto.startTime || dto.endTime) {
      throw new BadRequestException('Both startTime and endTime are required for a partial exception');
    }
    const date = this.normalizeDate(dto.date);
    return this.exceptions.save(
      this.exceptions.create({
        mentorId,
        date,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason ?? null,
      }),
    );
  }

  async deleteException(mentorId: string, id: string): Promise<void> {
    const res = await this.exceptions.delete({ id, mentorId });
    if (!res.affected) throw new NotFoundException('Availability exception not found');
  }

  /** Whether the mentor is available at the given instant, honouring weekly slots and exceptions. */
  async isAvailable(mentorId: string, dateTime: Date | string): Promise<boolean> {
    const instant = this.toInstant(dateTime);
    const slots = await this.slots.find({ where: { mentorId } });
    if (slots.length === 0) return false;
    const exceptions = await this.exceptions.find({ where: { mentorId } });

    return slots.some((slot) => {
      const local = instant.setZone(normalizeTimezone(slot.timezone));
      if (this.dayOfWeek(local) !== slot.dayOfWeek) return false;
      const hhmm = local.toFormat('HH:mm');
      if (hhmm < slot.startTime || hhmm >= slot.endTime) return false;
      return !this.isBlocked(exceptions, local);
    });
  }

  /** Expand weekly slots into concrete occurrences for the next `days`, converted for display. */
  async slotsForNextDays(
    mentorId: string,
    days = 30,
    displayTimezone: string = DEFAULT_TIMEZONE,
  ): Promise<SlotOccurrence[]> {
    const tz = normalizeTimezone(displayTimezone);
    const slots = await this.listSlots(mentorId);
    if (slots.length === 0) return [];
    const exceptions = await this.exceptions.find({ where: { mentorId } });

    const firstDay = DateTime.utc().startOf('day');
    const occurrences: SlotOccurrence[] = [];
    for (let offset = 0; offset < days; offset++) {
      const day = firstDay.plus({ days: offset });
      const date = day.toFormat('yyyy-MM-dd');
      const dow = this.dayOfWeek(day);
      const forDate = exceptions.filter((ex) => ex.date === date);
      if (forDate.some((ex) => !ex.startTime || !ex.endTime)) continue;

      for (const slot of slots) {
        if (slot.dayOfWeek !== dow) continue;
        const blocked = forDate.some((ex) => overlaps(ex.startTime!, ex.endTime!, slot.startTime, slot.endTime));
        if (blocked) continue;

        const zone = normalizeTimezone(slot.timezone);
        const start = DateTime.fromISO(`${date}T${slot.startTime}`, { zone });
        const end = DateTime.fromISO(`${date}T${slot.endTime}`, { zone });
        occurrences.push({
          date,
          dayOfWeek: dow,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timezone: tz,
          start: start.setZone(tz).toISO({ suppressMilliseconds: true }) ?? start.toISO()!,
          end: end.setZone(tz).toISO({ suppressMilliseconds: true }) ?? end.toISO()!,
        });
      }
    }
    return occurrences;
  }

  private async findOverlap(
    mentorId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<AvailabilitySlot | null> {
    const existing = await this.slots.find({ where: { mentorId, dayOfWeek } });
    const overlap = existing.find(
      (slot) => slot.id !== excludeId && overlaps(startTime, endTime, slot.startTime, slot.endTime),
    );
    return overlap ?? null;
  }

  private isBlocked(exceptions: AvailabilityException[], local: DateTime): boolean {
    const date = local.toFormat('yyyy-MM-dd');
    const hhmm = local.toFormat('HH:mm');
    return exceptions.some((ex) => {
      if (ex.date !== date) return false;
      if (!ex.startTime || !ex.endTime) return true;
      return hhmm >= ex.startTime && hhmm < ex.endTime;
    });
  }

  private toInstant(dateTime: Date | string): DateTime {
    const dt =
      typeof dateTime === 'string'
        ? DateTime.fromISO(dateTime, { zone: DEFAULT_TIMEZONE })
        : DateTime.fromJSDate(dateTime, { zone: DEFAULT_TIMEZONE });
    if (!dt.isValid) throw new BadRequestException('Invalid dateTime');
    return dt;
  }

  /** Luxon weekday is 1 (Mon) ... 7 (Sun); map to JS 0 (Sun) ... 6 (Sat). */
  private dayOfWeek(dt: DateTime): number {
    return dt.weekday === 7 ? 0 : dt.weekday;
  }

  private assertRange(startTime: string, endTime: string): void {
    if (!TIME.test(startTime) || !TIME.test(endTime)) {
      throw new BadRequestException('startTime and endTime must be in HH:mm format');
    }
    if (endTime <= startTime) throw new BadRequestException('endTime must be after startTime');
  }

  private assertTimezone(timezone: string | undefined): string {
    if (timezone === undefined || timezone === null) return DEFAULT_TIMEZONE;
    if (!isValidTimezone(timezone)) throw new BadRequestException('Invalid IANA timezone');
    return timezone;
  }

  private normalizeDate(date: string): string {
    const parsed = DateTime.fromISO(date, { zone: DEFAULT_TIMEZONE });
    if (!parsed.isValid) throw new BadRequestException('Invalid date');
    return parsed.toFormat('yyyy-MM-dd');
  }
}

/** Half-open interval overlap on 'HH:mm' strings. */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}
