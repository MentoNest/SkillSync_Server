<<<<<<< HEAD
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
=======
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { Repository, LessThan, MoreThan, Not } from 'typeorm';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MentorProfile } from '../mentor-profiles/entities/mentor-profile.entity';
import { AvailabilitySlot } from '../availability/entities/availability-slot.entity';
import { AvailabilityException } from '../availability/availability-exception.entity';
import { DateTime } from 'luxon';
>>>>>>> upstream/main

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
<<<<<<< HEAD
    private readonly bookingRepository: Repository<Booking>,
  ) {}

  /**
   * Accept a booking
   * Note: Session creation is handled separately via lifecycle hooks or event bus
   * This keeps BookingsService focused on booking state transitions
   */
  async acceptBooking(bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot accept booking with status '${booking.status}'. Only 'draft' bookings can be accepted.`,
      );
    }

    // Transition booking to accepted
    booking.status = BookingStatus.ACCEPTED;
    const acceptedBooking = await this.bookingRepository.save(booking);

    // Note: Session creation should be triggered by:
    // 1. Event emitter (onBookingAccepted event)
    // 2. Or lifecycle hook in a separate orchestrator service
    // This keeps the module dependency graph clean
    return acceptedBooking;
  }

  /**
   * Decline a booking
   * Ensures no session is created for declined bookings
   */
  async declineBooking(bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot decline booking with status '${booking.status}'. Only 'draft' bookings can be declined.`,
      );
    }

    booking.status = BookingStatus.DECLINED;
    return this.bookingRepository.save(booking);
  }

  /**
   * Cancel a booking
   * If session exists, it should be handled by separate logic
   * For now, we prevent cancellation of accepted bookings with sessions
   */
  async cancelBooking(bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
=======
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepo: Repository<MentorProfile>,
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepo: Repository<AvailabilitySlot>,
    @InjectRepository(AvailabilityException)
    private readonly exceptionRepo: Repository<AvailabilityException>,
  ) {}

  async createBooking(dto: CreateBookingDto, menteeUserId: string) {
    const { mentorProfileId, start, end } = dto;
    const startDate = DateTime.fromISO(start).toUTC();
    const endDate = DateTime.fromISO(end).toUTC();

    if (!startDate.isValid || !endDate.isValid) {
      throw new BadRequestException('Invalid date format');
    }

    if (endDate <= startDate) {
      throw new BadRequestException('End time must be after start time');
    }

    if (startDate < DateTime.now().toUTC()) {
      throw new BadRequestException('Cannot book in the past');
    }

    const mentor = await this.mentorProfileRepo.findOne({
      where: { id: mentorProfileId },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor profile not found');
    }

    // Check availability
    await this.validateAvailability(mentor, startDate, endDate);

    // Check for overlaps with accepted bookings
    await this.checkOverlaps(
      mentorProfileId,
      startDate.toJSDate(),
      endDate.toJSDate(),
    );

    // Create booking
    const booking = this.bookingRepo.create({
      mentorProfileId,
      menteeUserId,
      start: startDate.toJSDate(),
      end: endDate.toJSDate(),
      status: BookingStatus.REQUESTED,
    });

    return this.bookingRepo.save(booking);
  }

  async getMenteeBookings(menteeUserId: string) {
    return this.bookingRepo.find({
      where: { menteeUserId },
      relations: ['mentorProfile', 'mentorProfile.user'],
      order: { start: 'DESC' },
    });
  }

  async getMentorBookings(mentorUserId: string) {
    // First get mentor profile
    const mentor = await this.mentorProfileRepo.findOne({
      where: { userId: mentorUserId },
    });

    if (!mentor) {
      throw new NotFoundException('Mentor profile not found');
    }

    return this.bookingRepo.find({
      where: { mentorProfileId: mentor.id },
      relations: ['menteeUser'],
      order: { start: 'DESC' },
    });
  }

  async updateStatus(bookingId: string, status: BookingStatus, userId: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['mentorProfile'],
>>>>>>> upstream/main
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

<<<<<<< HEAD
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.ACCEPTED) {
      throw new BadRequestException(
        'Cannot cancel accepted booking with active session. Contact support.',
=======
    // Check if user is the mentor
    if (booking.mentorProfile.userId !== userId) {
      throw new ForbiddenException('Only the mentor can update booking status');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled booking');
    }

    if (status === BookingStatus.ACCEPTED) {
      // Re-check overlaps before accepting
      await this.checkOverlaps(
        booking.mentorProfileId,
        booking.start,
        booking.end,
        bookingId,
      );
    }

    booking.status = status;
    return this.bookingRepo.save(booking);
  }

  async cancelBooking(bookingId: string, userId: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['mentorProfile'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Check if user is mentee or mentor
    const isMentee = booking.menteeUserId === userId;
    const isMentor = booking.mentorProfile.userId === userId;

    if (!isMentee && !isMentor) {
      throw new ForbiddenException(
        'You are not authorized to cancel this booking',
>>>>>>> upstream/main
      );
    }

    booking.status = BookingStatus.CANCELLED;
<<<<<<< HEAD
    return this.bookingRepository.save(booking);
=======
    return this.bookingRepo.save(booking);
  }

  private async validateAvailability(
    mentor: MentorProfile,
    start: DateTime,
    end: DateTime,
  ) {
    // 1. Get mentor's availability slots
    const slots = await this.slotRepo.find({
      where: { mentorProfile: { id: mentor.id }, active: true },
    });

    if (!slots.length) {
      throw new BadRequestException('Mentor has no availability slots');
    }

    let matchingSlot: AvailabilitySlot | null = null;
    let mentorTz = 'UTC'; // Default or fallback

    // 2. Check if request matches any slot
    for (const slot of slots) {
      mentorTz = slot.timezone;
      const startInTz = start.setZone(mentorTz);
      const endInTz = end.setZone(mentorTz);

      if (startInTz.weekday !== endInTz.weekday) {
        continue;
      }

      if (startInTz.weekday !== slot.weekday) {
        continue;
      }

      const startMins = startInTz.hour * 60 + startInTz.minute;
      const endMins = endInTz.hour * 60 + endInTz.minute;

      if (startMins >= slot.startMinutes && endMins <= slot.endMinutes) {
        matchingSlot = slot;
        break;
      }
    }

    if (!matchingSlot) {
      throw new BadRequestException(
        'Requested time is outside of mentor availability',
      );
    }

    // 3. Check exceptions (blackouts)
    const exceptions = await this.exceptionRepo.find({
      where: { mentorProfile: { id: mentor.id } },
    });

    const startInTz = start.setZone(mentorTz);
    const endInTz = end.setZone(mentorTz);
    const dateStr = startInTz.toISODate(); // YYYY-MM-DD
    if (!dateStr) return; // Should not happen

    for (const ex of exceptions) {
      if (dateStr >= ex.startDate && dateStr <= ex.endDate) {
        // Date match
        if (ex.payload.type === 'FULL_DAY') {
          throw new BadRequestException('Mentor is unavailable on this date');
        }

        if (ex.payload.type === 'PARTIAL') {
          const startMins = startInTz.hour * 60 + startInTz.minute;
          const endMins = endInTz.hour * 60 + endInTz.minute;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const exStart = (ex.payload as any).startMinutes;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const exEnd = (ex.payload as any).endMinutes;

          // Check overlap: (StartA < EndB) and (EndA > StartB)
          if (startMins < exEnd && endMins > exStart) {
            throw new BadRequestException(
              'Mentor is unavailable during this time',
            );
          }
        }
      }
    }
  }

  private async checkOverlaps(
    mentorProfileId: string,
    start: Date,
    end: Date,
    excludeBookingId?: string,
  ) {
    const overlap = await this.bookingRepo.findOne({
      where: {
        mentorProfileId,
        status: BookingStatus.ACCEPTED,
        start: LessThan(end),
        end: MoreThan(start),
        id: excludeBookingId ? Not(excludeBookingId) : undefined,
      },
    });

    if (overlap) {
      throw new ConflictException(
        'Booking overlaps with an existing accepted session',
      );
    }
>>>>>>> upstream/main
  }
}
