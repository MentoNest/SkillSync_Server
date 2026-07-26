import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilitySlot } from './entities/availability-slot.entity.js';
import { AvailabilityException } from './entities/availability-exception.entity.js';
import {
  CreateAvailabilitySlotDto,
  UpdateAvailabilitySlotDto,
  CreateAvailabilityExceptionDto,
  UpdateAvailabilityExceptionDto,
} from './dto/availability.dto.js';
import { isValidIanaTimezone } from '../common/utils/timezone.utils.js';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepo: Repository<AvailabilitySlot>,
    @InjectRepository(AvailabilityException)
    private readonly exceptionRepo: Repository<AvailabilityException>,
  ) {}

  // ── Slots ────────────────────────────────────────────────────────────────

  async createSlot(
    mentorId: string,
    dto: CreateAvailabilitySlotDto,
  ): Promise<AvailabilitySlot> {
    if (!isValidIanaTimezone(dto.timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${dto.timezone}`);
    }
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    await this.assertNoOverlap(mentorId, dto.dayOfWeek, dto.startTime, dto.endTime);

    const slot = this.slotRepo.create({ ...dto, mentorId });
    return this.slotRepo.save(slot);
  }

  async getSlots(mentorId: string): Promise<AvailabilitySlot[]> {
    return this.slotRepo.find({
      where: { mentorId, isActive: true },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async updateSlot(
    slotId: string,
    mentorId: string,
    dto: UpdateAvailabilitySlotDto,
  ): Promise<AvailabilitySlot> {
    const slot = await this.findSlotOr404(slotId, mentorId);

    if (dto.timezone && !isValidIanaTimezone(dto.timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${dto.timezone}`);
    }

    const newStart = dto.startTime ?? slot.startTime;
    const newEnd = dto.endTime ?? slot.endTime;
    if (newStart >= newEnd) {
      throw new BadRequestException('startTime must be before endTime');
    }

    Object.assign(slot, dto);
    return this.slotRepo.save(slot);
  }

  async deleteSlot(slotId: string, mentorId: string): Promise<void> {
    const slot = await this.findSlotOr404(slotId, mentorId);
    await this.slotRepo.remove(slot);
  }

  // ── Exceptions ───────────────────────────────────────────────────────────

  async createException(
    mentorId: string,
    dto: CreateAvailabilityExceptionDto,
  ): Promise<AvailabilityException> {
    if (dto.startTime && dto.endTime && dto.startTime >= dto.endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    const ex = this.exceptionRepo.create({ ...dto, mentorId });
    return this.exceptionRepo.save(ex);
  }

  async getExceptions(mentorId: string): Promise<AvailabilityException[]> {
    return this.exceptionRepo.find({
      where: { mentorId },
      order: { exceptionDate: 'ASC' },
    });
  }

  async updateException(
    exId: string,
    mentorId: string,
    dto: UpdateAvailabilityExceptionDto,
  ): Promise<AvailabilityException> {
    const ex = await this.findExceptionOr404(exId, mentorId);

    const newStart = dto.startTime ?? ex.startTime;
    const newEnd = dto.endTime ?? ex.endTime;
    if (newStart && newEnd && newStart >= newEnd) {
      throw new BadRequestException('startTime must be before endTime');
    }

    Object.assign(ex, dto);
    return this.exceptionRepo.save(ex);
  }

  async deleteException(exId: string, mentorId: string): Promise<void> {
    const ex = await this.findExceptionOr404(exId, mentorId);
    await this.exceptionRepo.remove(ex);
  }

  // ── Availability check ───────────────────────────────────────────────────

  /**
   * Check whether mentor `mentorId` is available at a given UTC Date.
   *
   * Logic:
   *  1. Find the recurring slot matching the day-of-week + time range.
   *  2. Look for an AvailabilityException on that calendar date that overrides.
   */
  async isAvailable(mentorId: string, utcDateTime: Date): Promise<boolean> {
    const dayOfWeek = utcDateTime.getUTCDay();
    const timeStr = utcDateTime.toISOString().substring(11, 16); // "HH:MM"
    const dateStr = utcDateTime.toISOString().substring(0, 10); // "YYYY-MM-DD"

    // Check exceptions first
    const exception = await this.exceptionRepo
      .createQueryBuilder('ex')
      .where('ex.mentorId = :mentorId', { mentorId })
      .andWhere('ex.exceptionDate = :dateStr', { dateStr })
      .andWhere(
        '(ex.startTime IS NULL OR ex.startTime <= :time)',
        { time: timeStr },
      )
      .andWhere(
        '(ex.endTime IS NULL OR ex.endTime > :time)',
        { time: timeStr },
      )
      .getOne();

    if (exception) {
      return exception.isAvailable;
    }

    // Fall back to recurring slots
    const slot = await this.slotRepo
      .createQueryBuilder('slot')
      .where('slot.mentorId = :mentorId', { mentorId })
      .andWhere('slot.dayOfWeek = :dayOfWeek', { dayOfWeek })
      .andWhere('slot.startTime <= :time', { time: timeStr })
      .andWhere('slot.endTime > :time', { time: timeStr })
      .andWhere('slot.isActive = true')
      .getOne();

    return slot !== null;
  }

  /**
   * Return all available windows for the next `days` days (default 30).
   */
  async getUpcomingAvailability(
    mentorId: string,
    days = 30,
  ): Promise<{ date: string; slots: { start: string; end: string }[] }[]> {
    const slots = await this.getSlots(mentorId);
    const exceptions = await this.getExceptions(mentorId);
    const result: { date: string; slots: { start: string; end: string }[] }[] = [];

    const now = new Date();
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setUTCDate(now.getUTCDate() + i);
      const dateStr = date.toISOString().substring(0, 10);
      const dow = date.getUTCDay();

      const dayExceptions = exceptions.filter((e) => e.exceptionDate === dateStr);

      // Build windows from recurring slots
      const windows: { start: string; end: string }[] = slots
        .filter((s) => s.dayOfWeek === dow)
        .map((s) => ({ start: s.startTime, end: s.endTime }));

      // Apply exceptions
      const exBlocks = dayExceptions.filter((e) => !e.isAvailable);
      const exAdditions = dayExceptions.filter((e) => e.isAvailable);

      const filtered = windows.filter(
        (w) =>
          !exBlocks.some(
            (b) =>
              (b.startTime == null || b.startTime <= w.start) &&
              (b.endTime == null || b.endTime >= w.end),
          ),
      );

      exAdditions.forEach((e) => {
        if (e.startTime && e.endTime) {
          filtered.push({ start: e.startTime, end: e.endTime });
        }
      });

      if (filtered.length > 0) {
        result.push({ date: dateStr, slots: filtered });
      }
    }

    return result;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async findSlotOr404(
    slotId: string,
    mentorId: string,
  ): Promise<AvailabilitySlot> {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, mentorId },
    });
    if (!slot) throw new NotFoundException('Availability slot not found');
    return slot;
  }

  private async findExceptionOr404(
    exId: string,
    mentorId: string,
  ): Promise<AvailabilityException> {
    const ex = await this.exceptionRepo.findOne({
      where: { id: exId, mentorId },
    });
    if (!ex) throw new NotFoundException('Availability exception not found');
    return ex;
  }

  private async assertNoOverlap(
    mentorId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.slotRepo
      .createQueryBuilder('slot')
      .where('slot.mentorId = :mentorId', { mentorId })
      .andWhere('slot.dayOfWeek = :dayOfWeek', { dayOfWeek })
      .andWhere('slot.isActive = true')
      .andWhere('slot.startTime < :endTime', { endTime })
      .andWhere('slot.endTime > :startTime', { startTime });

    if (excludeId) {
      qb.andWhere('slot.id != :excludeId', { excludeId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        'This slot overlaps with an existing availability slot',
      );
    }
  }
}
