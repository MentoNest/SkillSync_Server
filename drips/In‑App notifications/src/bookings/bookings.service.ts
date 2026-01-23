import { Injectable } from "@nestjs/common";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { NotificationType } from "../notifications/entities/notification.entity";

@Injectable()
export class BookingsService {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async createBooking(userId: string, bookingData: any) {
    // Create booking logic here...
    const booking = { id: "booking-123", ...bookingData };

    // Send notification
    const notification = await this.notificationsService.create({
      userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: "Booking Confirmed",
      message: `Your booking #${booking.id} has been confirmed successfully.`,
      metadata: {
        bookingId: booking.id,
        bookingDate: bookingData.date,
      },
    });

    // Push real-time notification via WebSocket
    this.notificationsGateway.pushToUser(userId, notification);

    return booking;
  }

  async cancelBooking(userId: string, bookingId: string) {
    // Cancel booking logic here...

    // Send cancellation notification
    const notification = await this.notificationsService.create({
      userId,
      type: NotificationType.BOOKING_CANCELLED,
      title: "Booking Cancelled",
      message: `Your booking #${bookingId} has been cancelled.`,
      metadata: {
        bookingId,
        cancelledAt: new Date().toISOString(),
      },
    });

    // Push real-time notification
    this.notificationsGateway.pushToUser(userId, notification);
  }
}
