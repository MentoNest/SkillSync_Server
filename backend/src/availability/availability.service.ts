import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { AvailabilityException } from './entities/availability-exception.entity';
import { CreateSlotDto, UpdateSlotDto, CreateExceptionDto } from './dto/availability.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepo: Repository<AvailabilitySlot>,
    @InjectRepository(AvailabilityException)
    private readonly exceptionRepo: Repository<AvailabilityException>,
    private readonly usersService: UsersService,
  ) {}

  // ── Slots ──────────────────────────────────────────────────────────────────

  async getSlots(mentorId: string): Promise<AvailabilitySlot[]> {
    return this.slotRepo.find({ where: { mentorId }, order: { dayOfWeek: 'ASC', startTime: 'ASC' } });
  }

  async createSlot(mentorId: string, dto: CreateSlotDto): Promise<AvailabilitySlot> {
    this.assertEndAfterStart(dto.startTime, dto.endTime);
    await this.assertNoOverlap(mentorId, dto.dayOfWeek, dto.startTime, dto.endTime);
    const slot = this.slotRepo.create({ mentorId, ...dto, timezone: dto.timezone ?? 'UTC' });
    return this.slotRepo.save(slot);
  }

  async updateSlot(mentorId: string, id: string, dto: UpdateSlotDto): Promise<AvailabilitySlot> {
    const slot = await this.slotRepo.findOne({ where: { id, mentorId } });
    if (!slot) throw new NotFoundException('Slot not found');
    Object.assign(slot, dto);
    this.assertEndAfterStart(slot.startTime, slot.endTime);
    await this.assertNoOverlap(mentorId, slot.dayOfWeek, slot.startTime, slot.endTime, id);
    return this.slotRepo.save(slot);
  }

  async deleteSlot(mentorId: string, id: string): Promise<void> {
    const slot = await this.slotRepo.findOne({ where: { id, mentorId } });
    if (!slot) throw new NotFoundException('Slot not found');
    await this.slotRepo.remove(slot);
  }

  // ── Exceptions ─────────────────────────────────────────────────────────────

  async getExceptions(mentorId: string): Promise<AvailabilityException[]> {
    return this.exceptionRepo.find({ where: { mentorId }, order: { exceptionDate: 'ASC' } });
  }

  async createException(mentorId: string, dto: CreateExceptionDto): Promise<AvailabilityException> {
    if (dto.startTime && dto.endTime) this.assertEndAfterStart(dto.startTime, dto.endTime);
    const exc = this.exceptionRepo.create({
      mentorId,
      exceptionDate: dto.exceptionDate,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
      reason: dto.reason ?? null,
    });
    return this.exceptionRepo.save(exc);
  }

  async deleteException(mentorId: string, id: string): Promise<void> {
    const exc = await this.exceptionRepo.findOne({ where: { id, mentorId } });
    if (!exc) throw new NotFoundException('Exception not found');
    await this.exceptionRepo.remove(exc);
  }

  // ── Availability check ─────────────────────────────────────────────────────

  async isAvailable(mentorId: string, dateTime: Date): Promise<boolean> {
    const user = await this.usersService.findActiveById(mentorId);
    if (!user) return false;

    const dateStr = dateTime.toISOString().slice(0, 10);
    const timeStr = dateTime.toISOString().slice(11, 16);
    const dayOfWeek = dateTime.getUTCDay();

    // Check exceptions first
    const exception = await this.exceptionRepo.findOne({ where: { mentorId, exceptionDate: dateStr } });
    if (exception) {
      if (!exception.startTime) return false; // full-day block
      return timeStr >= exception.startTime && timeStr < exception.endTime!;
    }

    // Check weekly slots
    const slots = await this.slotRepo.find({ where: { mentorId, dayOfWeek } });
    return slots.some((s) => timeStr >= s.startTime && timeStr < s.endTime);
  }

  async getAvailableSlotsDays(mentorId: string): Promise<{ date: string; slots: AvailabilitySlot[] }[]> {
    const user = await this.usersService.findActiveById(mentorId);
    if (!user) return [];

    const slots = await this.slotRepo.find({ where: { mentorId } });
    const exceptions = await this.exceptionRepo.find({ where: { mentorId } });
    const exceptionDates = new Set(exceptions.filter((e) => !e.startTime).map((e) => e.exceptionDate));

    const result: { date: string; slots: AvailabilitySlot[] }[] = [];
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      if (exceptionDates.has(dateStr)) continue;
      const daySlots = slots.filter((s) => s.dayOfWeek === d.getUTCDay());
      if (daySlots.length) result.push({ date: dateStr, slots: daySlots });
    }
    return result;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private assertEndAfterStart(start: string, end: string): void {
    if (end <= start) throw new BadRequestException('End time must be after start time');
  }

  private async assertNoOverlap(
    mentorId: string,
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.slotRepo.find({ where: { mentorId, dayOfWeek } });
    const overlaps = existing.filter(
      (s) => s.id !== excludeId && s.startTime < endTime && s.endTime > startTime,
    );
    if (overlaps.length) throw new BadRequestException('Slot overlaps with an existing slot');
  }
}
