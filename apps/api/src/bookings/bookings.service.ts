import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
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
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === BookingStatus.ACCEPTED) {
      throw new BadRequestException(
        'Cannot cancel accepted booking with active session. Contact support.',
      );
    }

    booking.status = BookingStatus.CANCELLED;
    return this.bookingRepository.save(booking);
  }
}
