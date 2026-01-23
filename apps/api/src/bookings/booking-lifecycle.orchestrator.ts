import { Injectable } from '@nestjs/common';
import { Booking } from './entities/booking.entity';
import { BookingsService } from './bookings.service';
import { SessionsService } from '../sessions/sessions.service';

/**
 * BookingLifecycleOrchestrator
 *
 * Orchestrates the lifecycle of bookings and their associated sessions.
 * This service is responsible for coordinating state transitions across
 * the Booking and Session entities while keeping the individual services
 * focused on their specific domains.
 *
 * This pattern avoids circular dependencies and keeps the codebase clean:
 * - BookingsService: handles booking state transitions
 * - SessionsService: handles session state transitions
 * - BookingLifecycleOrchestrator: coordinates integration between them
 */
@Injectable()
export class BookingLifecycleOrchestrator {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * Accept a booking and create an associated session
   * This is the only point where bookings transition to ACCEPTED
   * and sessions are automatically created
   */
  async acceptBooking(bookingId: string): Promise<Booking> {
    // Transition booking to ACCEPTED
    const acceptedBooking = await this.bookingsService.acceptBooking(bookingId);

    // Automatically create session from accepted booking
    // Session creation is enforced here and never exposed publicly
    try {
      await this.sessionsService.createFromBooking(bookingId);
    } catch (error) {
      // If session creation fails, we have a data consistency issue
      // Log it and re-throw so the error is visible
      console.error(`Failed to create session for booking ${bookingId}:`, error);
      throw error;
    }

    return acceptedBooking;
  }

  /**
   * Decline a booking (no session creation)
   */
  async declineBooking(bookingId: string): Promise<Booking> {
    return this.bookingsService.declineBooking(bookingId);
  }

  /**
   * Cancel a booking (prevents cancellation if session exists)
   */
  async cancelBooking(bookingId: string): Promise<Booking> {
    return this.bookingsService.cancelBooking(bookingId);
  }
}
