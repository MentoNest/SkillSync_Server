import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, LessThan, MoreThan } from 'typeorm';
import { MentorAvailability, DayOfWeek } from '../entities/mentor-availability.entity';
import { MentorProfile } from '../../profile/entities/mentor-profile.entity';
import { CreateAvailabilityDto } from '../dto/create-availability.dto';
import { UpdateAvailabilityDto } from '../dto/update-availability.dto';

/** Natural Monday → Sunday sort order for display. */
const DAY_ORDER: Record<DayOfWeek, number> = {
  [DayOfWeek.MONDAY]: 0,
  [DayOfWeek.TUESDAY]: 1,
  [DayOfWeek.WEDNESDAY]: 2,
  [DayOfWeek.THURSDAY]: 3,
  [DayOfWeek.FRIDAY]: 4,
  [DayOfWeek.SATURDAY]: 5,
  [DayOfWeek.SUNDAY]: 6,
};

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(MentorAvailability)
    private readonly availabilityRepo: Repository<MentorAvailability>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
  ) {}

  /**
   * Create a new availability slot for the authenticated mentor.
   * Throws 400 if endTime ≤ startTime.
   * Throws 409 if the slot overlaps an existing active slot on the same day.
   */
  async create(dto: CreateAvailabilityDto, userId: string): Promise<MentorAvailability> {
    const mentor = await this.getMentorByUserId(userId);

    this.assertTimeRange(dto.startTime, dto.endTime);
    await this.assertNoOverlap(mentor.id, dto.dayOfWeek, dto.startTime, dto.endTime);

    const slot = this.availabilityRepo.create({ ...dto, mentor });
    return this.availabilityRepo.save(slot);
  }

  /**
   * Return all active slots for the authenticated mentor, sorted Mon → Sun then by start time.
   */
  async findMySlots(userId: string): Promise<MentorAvailability[]> {
    const mentor = await this.getMentorByUserId(userId);
    return this.findByMentorId(mentor.id);
  }

  /**
   * Return all active slots for a mentor profile (by mentor profile UUID).
   * Used by mentees when browsing mentor availability.
   */
  async findByMentorId(mentorId: string): Promise<MentorAvailability[]> {
    const slots = await this.availabilityRepo.find({
      where: { mentor: { id: mentorId }, isActive: true },
    });
    return this.sortSlots(slots);
  }

  /**
   * Update an existing slot owned by the authenticated mentor.
   * Re-validates time range and overlap whenever time-related fields change.
   */
  async update(
    slotId: string,
    dto: UpdateAvailabilityDto,
    userId: string,
  ): Promise<MentorAvailability> {
    const slot = await this.findOneOwned(slotId, userId);

    const effectiveDay = dto.dayOfWeek ?? slot.dayOfWeek;
    const effectiveStart = dto.startTime ?? slot.startTime;
    const effectiveEnd = dto.endTime ?? slot.endTime;

    const timeChanged = dto.dayOfWeek !== undefined || dto.startTime !== undefined || dto.endTime !== undefined;

    if (timeChanged) {
      this.assertTimeRange(effectiveStart, effectiveEnd);
      await this.assertNoOverlap(
        slot.mentor.id,
        effectiveDay,
        effectiveStart,
        effectiveEnd,
        slotId,
      );
    }

    Object.assign(slot, dto);
    return this.availabilityRepo.save(slot);
  }

  /**
   * Permanently delete a slot owned by the authenticated mentor.
   */
  async remove(slotId: string, userId: string): Promise<void> {
    const slot = await this.findOneOwned(slotId, userId);
    await this.availabilityRepo.remove(slot);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getMentorByUserId(userId: string): Promise<MentorProfile> {
    const mentor = await this.mentorProfileRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!mentor) {
      throw new NotFoundException('Mentor profile not found. Create a mentor profile first.');
    }
    return mentor;
  }

  /**
   * Load a slot and verify the requesting user owns it.
   */
  private async findOneOwned(slotId: string, userId: string): Promise<MentorAvailability> {
    const slot = await this.availabilityRepo.findOne({
      where: { id: slotId },
      relations: ['mentor', 'mentor.user'],
    });
    if (!slot) {
      throw new NotFoundException('Availability slot not found');
    }
    if (slot.mentor.user.id !== userId) {
      throw new ForbiddenException('You do not own this availability slot');
    }
    return slot;
  }

  /**
   * Validate that startTime is strictly before endTime.
   * Times are HH:MM strings — lexicographic comparison is identical to chronological.
   */
  private assertTimeRange(startTime: string, endTime: string): void {
    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be earlier than endTime');
    }
  }

  /**
   * Ensure no existing active slot for the same mentor and day overlaps the given range.
   *
   * Two slots [A_start, A_end) and [B_start, B_end) overlap when:
   *   A_start < B_end  AND  A_end > B_start
   *
   * Adjacent slots (e.g. 09:00–11:00 and 11:00–13:00) are NOT overlapping.
   *
   * @param excludeId  Slot to exclude from the check (used during updates).
   */
  private async assertNoOverlap(
    mentorId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ): Promise<void> {
    const where: Parameters<typeof this.availabilityRepo.findOne>[0]['where'] = {
      mentor: { id: mentorId },
      dayOfWeek,
      isActive: true,
      startTime: LessThan(endTime),
      endTime: MoreThan(startTime),
      ...(excludeId ? { id: Not(excludeId) } : {}),
    };

    const conflict = await this.availabilityRepo.findOne({ where });

    if (conflict) {
      throw new ConflictException(
        `Slot overlaps with an existing availability on ${conflict.dayOfWeek} ` +
          `(${conflict.startTime}–${conflict.endTime})`,
      );
    }
  }

  private sortSlots(slots: MentorAvailability[]): MentorAvailability[] {
    return slots.sort(
      (a, b) =>
        DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek] ||
        a.startTime.localeCompare(b.startTime),
    );
  }
}
