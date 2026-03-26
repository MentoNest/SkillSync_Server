import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from '../entities/booking.entity';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { UpdateBookingDto } from '../dto/update-booking.dto';
import { ServiceListing } from '../../service-listing/entities/service-listing.entity';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(ServiceListing)
    private readonly serviceListingRepo: Repository<ServiceListing>,
  ) {}

  /**
   * Create a new booking with duration validation
   */
  async create(dto: CreateBookingDto, menteeId: string): Promise<Booking> {
    // Validate duration is within acceptable range (15-480 minutes)
    this.validateDuration(dto.duration);

    // Find the service listing
    const serviceListing = await this.serviceListingRepo.findOne({
      where: { id: dto.serviceListingId, isActive: true },
    });

    if (!serviceListing) {
      throw new NotFoundException('Service listing not found or inactive');
    }

    // Validate service listing has duration defined
    if (!serviceListing.duration) {
      throw new BadRequestException('Service listing does not have a defined duration');
    }

    // Enforce mentee capacity
    if (
      serviceListing.maxMentees !== null &&
      serviceListing.maxMentees !== undefined &&
      serviceListing.currentMenteeCount >= serviceListing.maxMentees
    ) {
      throw new BadRequestException('This listing has reached its maximum mentee capacity');
    }

    // Calculate total price based on duration
    const totalPrice = this.calculateTotalPrice(serviceListing.price, dto.duration);

    // Create the booking
    const booking = this.bookingRepo.create({
      ...dto,
      scheduledAt: new Date(dto.scheduledAt),
      mentorId: serviceListing.mentorId,
      menteeId,
      totalPrice,
      status: BookingStatus.PENDING,
    });

    const saved = await this.bookingRepo.save(booking);

    await this.serviceListingRepo.increment(
      { id: serviceListing.id },
      'currentMenteeCount',
      1,
    );

    return saved;
  }

  /**
   * Get all bookings with optional filters
   */
  async findAll(filters?: { 
    status?: BookingStatus; 
    mentorId?: string; 
    menteeId?: string;
  }): Promise<Booking[]> {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.mentorId) {
      where.mentorId = filters.mentorId;
    }

    if (filters?.menteeId) {
      where.menteeId = filters.menteeId;
    }

    return this.bookingRepo.find({
      where,
      relations: ['serviceListing'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a single booking by ID
   */
  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['serviceListing'],
    });

    if (!booking) {
      throw new NotFoundException(`Booking with ID ${id} not found`);
    }

    return booking;
  }

  /**
   * Update a booking
   */
  async update(id: string, dto: UpdateBookingDto): Promise<Booking> {
    const booking = await this.findOne(id);

    // Validate duration if it's being updated
    if (dto.duration !== undefined) {
      this.validateDuration(dto.duration);
      
      // Recalculate total price if duration changed
      if (booking.serviceListing) {
        booking.totalPrice = this.calculateTotalPrice(
          booking.serviceListing.price,
          dto.duration,
        );
      }
    }

    // Update scheduledAt if provided
    if (dto.scheduledAt) {
      booking.scheduledAt = new Date(dto.scheduledAt);
    }

    Object.assign(booking, dto);
    return this.bookingRepo.save(booking);
  }

  /**
   * Cancel a booking
   */
  async cancel(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    if (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED) {
      await this.serviceListingRepo.decrement({ id: booking.serviceListingId }, 'currentMenteeCount', 1);
    }
    booking.status = BookingStatus.CANCELLED;
    return this.bookingRepo.save(booking);
  }

  async reject(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    if (booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED) {
      await this.serviceListingRepo.decrement({ id: booking.serviceListingId }, 'currentMenteeCount', 1);
    }
    booking.status = BookingStatus.REJECTED;
    return this.bookingRepo.save(booking);
  }

  /**
   * Remove a booking permanently
   */
  async remove(id: string): Promise<void> {
    const booking = await this.findOne(id);
    await this.bookingRepo.remove(booking);
  }

  /**
   * Validate duration is within acceptable range
   * Duration must be between 15 and 480 minutes (8 hours)
   */
  private validateDuration(duration: number): void {
    const MIN_DURATION = 15; // 15 minutes
    const MAX_DURATION = 480; // 8 hours (480 minutes)

    if (typeof duration !== 'number' || isNaN(duration)) {
      throw new BadRequestException('Duration must be a valid number');
    }

    if (duration < MIN_DURATION) {
      throw new BadRequestException(
        `Duration must be at least ${MIN_DURATION} minutes`,
      );
    }

    if (duration > MAX_DURATION) {
      throw new BadRequestException(
        `Duration must be at most ${MAX_DURATION} minutes (8 hours)`,
      );
    }
  }

  /**
   * Calculate total price based on service price and duration
   */
  private calculateTotalPrice(servicePrice: number, durationMinutes: number): number {
    // Assuming servicePrice is per hour, calculate proportional price
    const hourlyRate = servicePrice;
    const hours = durationMinutes / 60;
    return Number((hourlyRate * hours).toFixed(2));
  }
}
