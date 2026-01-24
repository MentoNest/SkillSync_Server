import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
} from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, BookingStatus } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    private eventEmitter: EventEmitter2,
  ) {}

  async createBooking(
    menteeId: string,
    createDto: CreateBookingDto,
  ): Promise<Booking> {
    const startTime = new Date(createDto.startTime);
    const endTime = new Date(createDto.endTime);

    // Validate time range
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be before end time');
    }

    // Validate not in the past
    if (startTime < new Date()) {
      throw new BadRequestException('Cannot book time in the past');
    }

    // Check for overlapping bookings
    const hasOverlap = await this.checkOverlap(
      createDto.mentorId,
      startTime,
      endTime,
    );
    if (hasOverlap) {
      throw new BadRequestException(
        'Mentor already has a confirmed booking during this time',
      );
    }

    const booking = this.bookingRepository.create({
      ...createDto,
      menteeId,
      startTime,
      endTime,
      status: BookingStatus.PENDING,
    });

    const saved = await this.bookingRepository.save(booking);

    // Emit event for notifications
    this.eventEmitter.emit('booking.created', {
      bookingId: saved.id,
      menteeId,
      mentorId: createDto.mentorId,
      startTime,
      endTime,
    });

    this.logger.log(`Booking created: ${saved.id} by mentee ${menteeId}`);
    return saved;
  }

  async confirmBooking(bookingId: string, mentorId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['mentee', 'mentor'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.mentorId !== mentorId) {
      throw new ForbiddenException(
        'Only the assigned mentor can confirm this booking',
      );
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Cannot confirm booking with status: ${booking.status}`,
      );
    }

    // Double-check no overlap (race condition protection)
    const hasOverlap = await this.checkOverlap(
      booking.mentorId,
      booking.startTime,
      booking.endTime,
      bookingId,
    );

    if (hasOverlap) {
      throw new BadRequestException('Time slot no longer available');
    }

    booking.status = BookingStatus.CONFIRMED;
    booking.confirmedAt = new Date();

    const updated = await this.bookingRepository.save(booking);

    this.eventEmitter.emit('booking.confirmed', {
      bookingId: updated.id,
      menteeId: updated.menteeId,
      mentorId: updated.mentorId,
      startTime: updated.startTime,
      endTime: updated.endTime,
    });

    this.logger.log(`Booking confirmed: ${bookingId} by mentor ${mentorId}`);
    return updated;
  }

  async cancelBooking(
    bookingId: string,
    userId: string,
    cancellationReason?: string,
  ): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['mentee', 'mentor'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.menteeId !== userId && booking.mentorId !== userId) {
      throw new ForbiddenException(
        'Only the mentee or mentor can cancel this booking',
      );
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed booking');
    }

    // Business rule: Cannot cancel within 24 hours if confirmed (example rule)
    if (booking.status === BookingStatus.CONFIRMED) {
      const hoursUntil =
        (booking.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil < 24) {
        throw new BadRequestException(
          'Cannot cancel confirmed booking within 24 hours of start time',
        );
      }
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancellationReason = cancellationReason;
    booking.cancelledBy = userId;
    booking.cancelledAt = new Date();

    const updated = await this.bookingRepository.save(booking);

    this.eventEmitter.emit('booking.cancelled', {
      bookingId: updated.id,
      menteeId: updated.menteeId,
      mentorId: updated.mentorId,
      cancelledBy: userId,
      cancellationReason,
    });

    this.logger.log(`Booking cancelled: ${bookingId} by user ${userId}`);
    return updated;
  }

  async getBookings(
    userId: string,
    userRole: string,
    query: BookingQueryDto,
  ): Promise<Booking[]> {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.mentee', 'mentee')
      .leftJoinAndSelect('booking.mentor', 'mentor');

    // Filter by role
    if (userRole === 'mentee') {
      queryBuilder.andWhere('booking.menteeId = :userId', { userId });
    } else if (userRole === 'mentor') {
      queryBuilder.andWhere('booking.mentorId = :userId', { userId });
    }

    // Apply filters
    if (query.status) {
      queryBuilder.andWhere('booking.status = :status', {
        status: query.status,
      });
    }

    if (query.mentorId) {
      queryBuilder.andWhere('booking.mentorId = :mentorId', {
        mentorId: query.mentorId,
      });
    }

    if (query.menteeId) {
      queryBuilder.andWhere('booking.menteeId = :menteeId', {
        menteeId: query.menteeId,
      });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere(
        'booking.startTime BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(query.startDate),
          endDate: new Date(query.endDate),
        },
      );
    } else if (query.startDate) {
      queryBuilder.andWhere('booking.startTime >= :startDate', {
        startDate: new Date(query.startDate),
      });
    } else if (query.endDate) {
      queryBuilder.andWhere('booking.startTime <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    queryBuilder.orderBy('booking.startTime', 'ASC');

    return queryBuilder.getMany();
  }

  async getBookingById(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['mentee', 'mentor'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.menteeId !== userId && booking.mentorId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return booking;
  }

  private async checkOverlap(
    mentorId: string,
    startTime: Date,
    endTime: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.mentorId = :mentorId', { mentorId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere(
        '(booking.startTime < :endTime AND booking.endTime > :startTime)',
        { startTime, endTime },
      );

    if (excludeBookingId) {
      query.andWhere('booking.id != :excludeBookingId', { excludeBookingId });
    }

    const count = await query.getCount();
    return count > 0;
  }

  async completeBooking(bookingId: string): Promise<Booking> {
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }

    booking.status = BookingStatus.COMPLETED;
    return this.bookingRepository.save(booking);
  }
}
